#version 300 es
precision highp float;
precision highp int;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_scroll;

uniform sampler2D u_textTex;
uniform vec4      u_textRect;

uniform sampler2D u_rippleTex;
uniform float     u_rippleTexel;

#define PI 3.14159265359

// ----------------------------------------------------
// SKY
// ----------------------------------------------------

vec3 skyColor(float y, float phase)
{
    float d = clamp(phase,0.0,1.0);
    vec3 top    = mix(vec3(0.08,0.18,0.45), vec3(0.02,0.02,0.08), d);
    vec3 bottom = mix(vec3(0.85,0.52,0.38), vec3(1.00,0.35,0.22), d);
    return mix(bottom, top, pow(clamp(y,0.0,1.0), 1.3));
}

vec3 tonemap(vec3 x)
{
    const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
    return pow(clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0), vec3(1.0/2.2));
}

void sun(in float phase, out vec2 pos, out vec3 col)
{
    float d    = clamp(phase,0.0,1.0);
    float sunY = mix(0.52, 0.68, sin(d*PI));
    pos = vec2(mix(0.25,0.75,d), sunY);
    col = mix(vec3(1.0,0.7,0.45), vec3(1.0,0.55,0.25), d);
}

// ----------------------------------------------------
// NOISE
// ----------------------------------------------------

float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 74.51);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i=floor(p), f=fract(p), u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),          hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
}

float cloudFbm(vec2 p) {
    float v=0.0,a=0.5; vec2 s=vec2(100.0);
    for(int i=0;i<4;i++){v+=a*vnoise(p);p=p*2.1+s;a*=0.48;}
    return v;
}

float cloudDensity(vec2 uv, float t, float phase, out float base) {
    vec2 wind = vec2(t*0.012, t*0.004);
    base        = cloudFbm(uv*vec2(3.2,5.5)+wind);
    float cloud = base + cloudFbm(uv*vec2(6.5,9.0)+wind*1.4)*0.38;
    cloud       = smoothstep(0.60,0.88,cloud);
    return cloud * smoothstep(1.0,0.52,uv.y)
                 * (1.0-clamp(phase*1.4,0.0,1.0)*0.5)
                 * 0.55;
}

// ----------------------------------------------------
// MICRO NORMAL NOISE
// ----------------------------------------------------

vec2 microNormalDelta(vec2 p, float t, float depth) {
    vec2 drift1 = vec2(t*0.08,  t*0.05);
    vec2 drift2 = vec2(t*-0.06, t*0.09);
    const float e = 0.04;
    vec2 p1=p*8.0,  p2=p*20.0;
    float dx1=vnoise(p1+vec2(e,0)+drift1)-vnoise(p1-vec2(e,0)+drift1);
    float dy1=vnoise(p1+vec2(0,e)+drift1)-vnoise(p1-vec2(0,e)+drift1);
    float dx2=vnoise(p2+vec2(e,0)+drift2)-vnoise(p2-vec2(e,0)+drift2);
    float dy2=vnoise(p2+vec2(0,e)+drift2)-vnoise(p2-vec2(0,e)+drift2);
    return vec2(dx1+dx2*0.5, dy1+dy2*0.5) * smoothstep(0.0,0.35,depth);
}

// ----------------------------------------------------
// SHORE
// ----------------------------------------------------
//
// Процедурный силуэт берега: две горные массы (левая и правая),
// долина в центре, статичный (нет зависимости от времени).
//
// shoreProfile(x) → UV-координата y вершины силуэта при данном x.
// Значение > horizon → горный пиксель, если uv.y < profile.
//
// Архитектура:
//   1. Огибающая (envelope): два Gaussian-подобных масса по краям,
//      плавно обнуляется в центре → долина у горизонта.
//   2. fBM (4 октавы, seed=17.3) — скальная зубчатость.
//      Используется тот же vnoise, но с отдельным 2D-seed-сдвигом
//      → независим от облачного шума.
//   3. Средние хребты: второй слой fBM на меньшей частоте даёт
//      вторичные гребни внутри масс.
//
// Ref: IQ "Terrain" — envelope * fbm pattern; "Painting a Landscape
//      with Maths" https://iquilezles.org/articles/terrainmarching/
// Ref: GPU Gems 3 ch.1 "Generating Complex Procedural Terrains"

float shoreFbm(float x, float seedY) {
    // 1D-профиль через 2D vnoise (seedY сдвигает из облачного диапазона)
    float v=0.0, a=0.5, p=x;
    for(int i=0;i<5;i++){
        v += a * vnoise(vec2(p, seedY));
        p *= 2.3;
        a *= 0.48;
    }
    return v; // [0..1]
}

// ----------------------------------------------------
// VEGETATION SILHOUETTE SYSTEM
// ----------------------------------------------------
//
// Архитектура (4 слоя, back→front):
//   baselineSilhouette — НЕПРЕРЫВНАЯ fBM-лента вдоль всего горизонта.
//                        Закрывает берег полностью, без просветов.
//
// vegCluster — карта плотности с floor 0.35:
//   нет абсолютно пустых зон, только разница «редкий/плотный лес».
//   Плотные кластеры → деревья выше (ch ∝ cl) → перспективная иллюзия.
//
// Ref: IQ "Painting a Landscape with Maths"
//      https://iquilezles.org/articles/terrainmarching/
// Ref: Book of Shaders ch.11 — jittered grid instancing
// Ref: IQ "Outdoors Lighting" — silhouette rim-light pattern

// Непрерывная fBM-лента берега.
// seed=55.5, 88.2 — независимы от cloud (cloudFbm) и shore (91.7, 71.3, 83.1).
// [0.518 .. 0.586] UV: гарантирует тёмную полосу над горизонтом.
float baselineSilhouette(float x) {
    float hLarge  = shoreFbm(x * 4.2, 55.5) * 0.052;  // крупные рощевые горбы
    float hDetail = shoreFbm(x * 16.0, 88.2) * 0.016; // мелкая зубчатость кромки
    return 0.500 + 0.018 + hLarge + hDetail;
}

// Профиль для отражения: используем только мягкий дальний берег.
float vegetationProfile(float x) {
    return baselineSilhouette(x);
}

// ----------------------------------------------------
// WAVE MODEL
// ----------------------------------------------------

float wave(vec2 p, vec2 dir, float freq, float speed, float t)
{ return sin(dot(p,dir)*freq+t*speed); }

const vec2 DIR_L1=vec2( 0.9806, 0.1961), DIR_L2=vec2(-0.5735, 0.8192);
const vec2 DIR_M1=vec2( 0.5145, 0.8575), DIR_M2=vec2(-0.9285, 0.3714), DIR_M3=vec2( 0.5300,-0.8480);
const vec2 DIR_R1=vec2( 0.8000, 0.6000), DIR_R2=vec2(-0.2873, 0.9578), DIR_R3=vec2( 0.1961,-0.9806), DIR_R4=vec2(-0.9479, 0.3159);

float largeWaves(vec2 p,float t,float depth){
    return(wave(p,DIR_L1,1.2,0.25,t)*0.035+wave(p,DIR_L2,1.0,0.20,t)*0.025)*smoothstep(0.05,0.7,depth);}
float mediumWaves(vec2 p,float t,float depth){
    return(wave(p,DIR_M1,3.0,0.55,t)*0.06+wave(p,DIR_M2,3.8,0.50,t)*0.05+wave(p,DIR_M3,2.6,0.42,t)*0.04)*smoothstep(0.0,0.9,depth);}
float ripples(vec2 p,float t,float depth){
    return(wave(p,DIR_R1,10.0,1.10,t)*0.025+wave(p,DIR_R2,14.0,1.30,t)*0.020
          +wave(p,DIR_R3,18.0,1.60,t)*0.015+wave(p,DIR_R4,11.5,0.95,t)*0.018)*smoothstep(0.15,1.0,depth);}

float waveField(vec2 p, float t, float depth) {
    vec2 warp=vec2(sin(p.x*0.7+t*0.15)*0.18+sin(p.y*0.5+t*0.11)*0.12,
                   sin(p.y*0.6+t*0.13)*0.18+sin(p.x*0.4+t*0.09)*0.12);
    vec2 pw=p+warp;
    return largeWaves(pw,t,depth)+mediumWaves(pw,t,depth)+ripples(pw*1.8,t,clamp(depth*1.5,0.0,1.0))*0.8;
}

// ----------------------------------------------------
// HELPERS
// ----------------------------------------------------

float sampleTextAlpha(vec2 worldUV) {
    vec2  uv2 = (worldUV - u_textRect.xy) / u_textRect.zw * 0.5 + 0.5;
    float inB = step(0.0,uv2.x)*step(uv2.x,1.0)*step(0.0,uv2.y)*step(uv2.y,1.0);
    return texture(u_textTex, clamp(uv2,0.0,1.0)).a * inB;
}

// ----------------------------------------------------
// MAIN
// ----------------------------------------------------

out vec4 fragColor;

void main()
{
    vec2  uv    = gl_FragCoord.xy / u_resolution.xy;
    vec2  coord = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    const float horizon = 0.5;

    vec3 col;
    vec2 sunPos; vec3 sunCol;
    sun(u_scroll, sunPos, sunCol);

    // ════════════════════════════════════════════════
    // SKY
    // ════════════════════════════════════════════════
    if (uv.y >= horizon)
    {
        vec3 sky = skyColor(uv.y, u_scroll);

        float d        = length(uv - sunPos);
        vec3  sunLight = sunCol * (exp(-d*20.0)*3.0 + exp(-d*6.0)*0.5);

        float cloudBase;
        float density      = cloudDensity(uv, u_time, u_scroll, cloudBase);
        float sunInfluence = exp(-d*4.5);
        vec3  cloudLight   = mix(vec3(1.0,1.0,1.05), sunCol*1.3+vec3(0.25), sunInfluence);
        cloudLight        *= mix(0.72, 1.0, smoothstep(0.52,0.58,cloudBase));

        col = mix(sky + sunLight, cloudLight + sunLight*sunInfluence*0.15, density);

        // Название в небе
        vec3 titleCol = mix(vec3(1.00,0.97,0.91),
                            sunCol*1.25+vec3(0.20,0.22,0.28),
                            sunInfluence*0.55);
        col = mix(col, titleCol, sampleTextAlpha(uv) * 0.90);

        // Сглаживание горизонта
        float skyFog = smoothstep(horizon + 0.018, horizon, uv.y) * 0.55;
        col = mix(col, skyColor(horizon, u_scroll), skyFog);

        // ── РАСТИТЕЛЬНОСТЬ БЕРЕГА ────────────────────────────────────────
        // Рендер 4 слоёв back→front: baseline → куст → тростник → дерево.
        // baselineSilhouette обеспечивает сплошную тёмную ленту по всему
        // горизонту. Деревья и кусты выступают над ней как отдельные кроны.
        //
        // Rim-light: единый для топ-кромки всего силуэта (vegTop).
        //   exp(-Δy*k) → узкая подсветка, k=88 → ~0.01 UV ширина.
        //   Имитирует солнечный контур кроны у рассвета/заката.
        //
        // Ref: IQ "Outdoors Lighting" — rim-light на силуэтах
        //      https://iquilezles.org/articles/outdoorslighting/


        // Сильное ограничение по вертикали: считаем силуэт только
        // в узкой полосе вокруг горизонта, остальное не трогаем.
        float vegBandMin = horizon - 0.02;
        float vegBandMax = horizon + 0.16;
        if (uv.y < vegBandMin || uv.y > vegBandMax) {
            fragColor = vec4(tonemap(col), 1.0);
            return;
        }

        // ── ДАЛЬНИЙ БЕРЕГ (МЯГКИЙ СИЛУЭТ) ───────────────────────────────
        {
            float base = baselineSilhouette(uv.x);

            // тонкая тёмная полоса по всему горизонту
            float iBase = smoothstep(base + 0.0020, base - 0.0020, uv.y);

            if (iBase > 0.001) {
                float dphas = clamp(u_scroll, 0.0, 1.0);

                vec3 baseC = mix(vec3(0.022, 0.028, 0.058),
                                 vec3(0.032, 0.016, 0.030), dphas);

                vec3 vc = mix(col, baseC, iBase);

                // лёгкий rim-light по верхней кромке base
                vec3  rimC    = sunCol * 0.40 + skyColor(base, u_scroll) * 0.25;
                float rimBase = exp(-max(base - uv.y, 0.0) * 72.0) * iBase;
                vc += rimC * rimBase * 0.35;

                col = vc;
            }

            fragColor = vec4(tonemap(col), 1.0);
            return;
        }

    }
    // ════════════════════════════════════════════════
    // WATER
    // ════════════════════════════════════════════════
    else
    {
        float t     = u_time;
        float depth = clamp(1.0 - uv.y/horizon, 0.0, 1.0);

        float perspScale = 1.0 / (depth + 0.12);
        vec2  p = vec2(coord.x * perspScale, coord.y) * 2.2;

        // ── НОРМАЛЬ ВОЛН ─────────────────────────────────────────────────
        float eps = 0.003;
        vec3 n = normalize(vec3(
            -(waveField(p+vec2(eps,0.0),t,depth)-waveField(p-vec2(eps,0.0),t,depth))*5.0,
            1.0,
            -(waveField(p+vec2(0.0,eps),t,depth)-waveField(p-vec2(0.0,eps),t,depth))*5.0
        ));

        // ── ИНТЕРАКТИВНАЯ РЯБЬ ───────────────────────────────────────────
        {
            vec2  rUV = vec2(uv.x, 1.0 - uv.y*2.0);
            float rt  = u_rippleTexel;
            float rxP = texture(u_rippleTex, rUV+vec2(rt,0.0)).r;
            float rxN = texture(u_rippleTex, rUV-vec2(rt,0.0)).r;
            float ryP = texture(u_rippleTex, rUV+vec2(0.0,rt)).r;
            float ryN = texture(u_rippleTex, rUV-vec2(0.0,rt)).r;
            n = normalize(n + vec3(-(rxP-rxN)/perspScale*5.0, 0.0, -(ryP-ryN)*5.0));
        }

        // ── MICRO NORMAL NOISE ───────────────────────────────────────────
        {
            vec2 mn = microNormalDelta(p, t, depth);
            n = normalize(n + vec3(mn.x, 0.0, mn.y) * 0.28);
        }

        float rippleStrength = pow(1.0 - n.y, 1.0);

        // ── FRESNEL ─────────────────────────────────────────────────────
        float horizonDist = (horizon - uv.y) / horizon;
        vec3  viewDir     = normalize(vec3(coord.x*0.1, 0.02+horizonDist*0.26, 1.0));
        float cosTheta    = clamp(dot(viewDir,n), 0.0, 1.0);
        float fresnel     = 0.02 + 0.98*pow(1.0-cosTheta, 5.0);

        // ── ОТРАЖЕНИЕ НЕБА + БЕРЕГА ──────────────────────────────────────
        // Отражённый UV: зеркало горизонта + дисторсия нормалью.
        // После вычисления skyColor проверяем: попадает ли отражение в гору?
        // Если да — заменяем на тёмный цвет горного отражения.
        //
        // Горное отражение:
        //   - само по себе тёмное, чуть темнее горы (вода поглощает)
        //   - дистортируется волнами автоматически (через n.xz смещение)
        //   - гладко бленд через fresnel (крутой угол → больше отражения)
        // Ref: planar reflection mountain masking — аналог skyRefl, но для силуэта
        float reflStrength = 0.015 + 0.07*depth;
        vec2  refl = vec2(uv.x, 2.0*horizon-uv.y) + n.xz*reflStrength;
        refl.y     = clamp(refl.y, horizon, 1.0);

        vec3 skyRefl = skyColor(refl.y, u_scroll)
                     + exp(-abs(refl.y-horizon)*28.0)*0.35*sunCol;

        // Отражение растительности в воде
        // vegetationProfile включает baseline → reflection band гарантирован.
        // vegReflH — max(baseline, trees, bushes, grass) в отражённой точке.
        {
            float vegReflH    = vegetationProfile(refl.x);
            float vegReflMask = smoothstep(vegReflH + 0.0022, vegReflH - 0.0022, refl.y);
            if (vegReflMask > 0.0) {
                float d2 = clamp(u_scroll, 0.0, 1.0);
                vec3 vReflBase = mix(vec3(0.022, 0.032, 0.062), vec3(0.030, 0.014, 0.030), d2);
                float vWaterRim = exp(-abs(refl.y - vegReflH) * 60.0) * 0.18;
                vReflBase += sunCol * vWaterRim * 0.30;
                skyRefl = mix(skyRefl, vReflBase, vegReflMask * (0.65 + 0.35 * depth));
            }
        }

        // ── СОЛНЕЧНАЯ ДОРОЖКА ────────────────────────────────────────────
        vec2  sunRefl   = vec2(sunPos.x, 2.0*horizon-sunPos.y);
        float pathX     = abs(uv.x - sunPos.x);
        float pathY     = clamp(horizon-uv.y, 0.0, horizon);
        float pathWidth = 0.04 + 0.14*(pathY/horizon);
        float sunPath   = exp(-pathX*pathX/(pathWidth*pathWidth))
                        * smoothstep(0.0,0.08,pathY/horizon)
                        * (0.4+0.6*rippleStrength);

        vec2  toSun = uv + n.xz*0.08 - sunRefl;
        float r2    = toSun.x*toSun.x + max(-toSun.y,0.0)*max(-toSun.y,0.0)*0.12;
        vec3  sunLight = sunCol*(exp(-r2*45.0)*4.5 + exp(-r2*18.0)*0.7 + sunPath);

        // ── ЦВЕТ ВОДЫ ────────────────────────────────────────────────────
        vec3 waterDeep = mix(vec3(0.03,0.10,0.16), skyRefl*0.6, 0.3);
        vec3 waterCol  = mix(waterDeep, skyRefl+sunLight, fresnel*(0.65+0.35*depth));

        // ── СПЕКУЛЯР + ГЛИНТЫ ────────────────────────────────────────────
        vec2 sunDir2D = normalize(sunPos - vec2(uv.x,horizon));
        vec3 lightDir = normalize(vec3(sunDir2D.x, 0.6, sunDir2D.y));
        vec3 halfDir  = normalize(lightDir + viewDir);

        float glint = pow(max(dot(n,lightDir),0.0),80.0)*rippleStrength*(0.3+0.7*depth)*3.5;
        waterCol += glint*sunCol*1.2;
        waterCol  = mix(waterCol, waterCol*vec3(0.88,0.93,1.05),
                        rippleStrength*0.28*(0.2+0.8*depth));
        waterCol += pow(max(dot(n,halfDir),0.0),52.0)*0.9*(0.4+0.6*depth)*(sunCol*1.5+vec3(0.1));

        col = mix(waterCol, skyColor(horizon,u_scroll), smoothstep(0.07,0.0,depth)*0.8);

        // ── ОТРАЖЕНИЕ НАЗВАНИЯ ───────────────────────────────────────────
        vec2  textRefl = vec2(uv.x, 1.0-uv.y) + n.xz*(0.018+0.030*rippleStrength);
        float waterA   = sampleTextAlpha(textRefl)
                       * fresnel
                       * (0.55+0.45*(1.0-depth*0.60))
                       * (0.50+0.50*rippleStrength);
        col += (sunCol*1.6+vec3(0.12,0.15,0.22)) * waterA * 0.78;
    }

    fragColor = vec4(tonemap(col), 1.0);
}
