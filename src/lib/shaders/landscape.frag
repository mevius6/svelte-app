#version 300 es
precision highp float;
precision highp int;

uniform vec2  u_resolution;
uniform vec2  u_sceneScale;
uniform float u_time;
uniform float u_scroll;

uniform sampler2D u_textTex;
uniform vec4      u_textRect;

uniform sampler2D u_rippleTex;
uniform float     u_rippleTexel;
uniform vec3      u_cameraPos;
uniform vec3      u_cameraRight;
uniform vec3      u_cameraUp;
uniform vec3      u_cameraForward;
uniform float     u_cameraTanHalfFovY;
uniform vec4      u_rippleWorldRect;
uniform float     u_waterLevel;
uniform float     u_shorePlaneZ;

#define PI 3.14159265359

// ----------------------------------------------------
// SKY
// ----------------------------------------------------

vec3 skyColor(float y, float phase01)
{
    vec3 top    = mix(vec3(0.08,0.18,0.45), vec3(0.02,0.02,0.08), phase01);
    vec3 bottom = mix(vec3(0.85,0.52,0.38), vec3(1.00,0.35,0.22), phase01);
    return mix(bottom, top, pow(clamp(y,0.0,1.0), 1.3));
}

vec3 tonemap(vec3 x)
{
    const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
    return pow(clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0), vec3(1.0/2.2));
}

vec3 sunColor(float phase01)
{
    return mix(vec3(1.0,0.7,0.45), vec3(1.0,0.55,0.25), phase01);
}

vec3 sunDirection(float phase01)
{
    float azimuth = mix(-0.78, 0.78, phase01);
    float elevation = mix(0.08, 0.34, sin(phase01 * PI));
    return normalize(vec3(
        sin(azimuth) * cos(elevation),
        sin(elevation),
        -cos(azimuth) * cos(elevation)
    ));
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

float cloudBaseFbm(vec2 p) {
    float v=0.0,a=0.5; vec2 s=vec2(100.0);
    for(int i=0;i<4;i++){v+=a*vnoise(p);p=p*2.1+s;a*=0.48;}
    return v;
}

float cloudDetailFbm(vec2 p) {
    float v=0.0,a=0.5; vec2 s=vec2(100.0);
    // AI: keep the primary cloud body at 4 octaves, but trim the secondary detail layer to 3 where the visual impact is smaller.
    for(int i=0;i<3;i++){v+=a*vnoise(p);p=p*2.1+s;a*=0.48;}
    return v;
}

float cloudDensity(vec2 uv, float t, float phase01, out float base) {
    vec2 wind = vec2(t*0.012, t*0.004);
    // AI: cache cloud UV variants/fades once and keep the lower-cost detail octave reduction local to the secondary cloud layer.
    vec2 baseUv = uv * vec2(3.2,5.5) + wind;
    vec2 detailUv = uv * vec2(6.5,9.0) + wind * 1.4;
    base        = cloudBaseFbm(baseUv);
    float cloud = base + cloudDetailFbm(detailUv)*0.38;
    cloud       = smoothstep(0.60,0.88,cloud);
    float phaseFade = 1.0 - min(phase01 * 1.4, 1.0) * 0.5;
    float verticalFade = smoothstep(1.0,0.52,uv.y);
    return cloud * verticalFade
                 * phaseFade
                 * 0.55;
}

// ----------------------------------------------------
// MICRO NORMAL NOISE
// ----------------------------------------------------

vec2 microNormalDelta(vec2 p, float t, float depthMask) {
    vec2 drift1 = vec2(t*0.08,  t*0.05);
    vec2 drift2 = vec2(t*-0.06, t*0.09);
    const float e = 0.04;
    vec2 p1=p*8.0,  p2=p*20.0;
    float dx1=vnoise(p1+vec2(e,0)+drift1)-vnoise(p1-vec2(e,0)+drift1);
    float dy1=vnoise(p1+vec2(0,e)+drift1)-vnoise(p1-vec2(0,e)+drift1);
    float dx2=vnoise(p2+vec2(e,0)+drift2)-vnoise(p2-vec2(e,0)+drift2);
    float dy2=vnoise(p2+vec2(0,e)+drift2)-vnoise(p2-vec2(0,e)+drift2);
    return vec2(dx1+dx2*0.5, dy1+dy2*0.5) * depthMask;
}

// ----------------------------------------------------
// SHORE
// ----------------------------------------------------
//
// Процедурный силуэт берега.
//
// Ref: IQ "Terrain" — envelope * fbm pattern; "Painting a Landscape with Maths" https://iquilezles.org/articles/terrainmarching/
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

float largeWaves(vec2 p,float t,float depthMask){
    return(wave(p,DIR_L1,1.2,0.25,t)*0.022+wave(p,DIR_L2,1.0,0.20,t)*0.016)*depthMask;}
float mediumWaves(vec2 p,float t,float depthMask){
    return(wave(p,DIR_M1,3.0,0.55,t)*0.040+wave(p,DIR_M2,3.8,0.50,t)*0.032+wave(p,DIR_M3,2.6,0.42,t)*0.025)*depthMask;}
float ripples(vec2 p,float t,float depthMask){
    return(wave(p,DIR_R1,10.0,1.10,t)*0.018+wave(p,DIR_R2,14.0,1.30,t)*0.015
          +wave(p,DIR_R3,18.0,1.60,t)*0.011+wave(p,DIR_R4,11.5,0.95,t)*0.013)*depthMask;}

float waveFieldWithMasks(
    vec2 p,
    float t,
    float largeMask,
    float mediumMask,
    float rippleMask
) {
    vec2 warp=vec2(sin(p.x*0.7+t*0.15)*0.12+sin(p.y*0.5+t*0.11)*0.08,
                   sin(p.y*0.6+t*0.13)*0.12+sin(p.x*0.4+t*0.09)*0.08);
    vec2 pw=p+warp;
    // AI: reuse precomputed depth masks from the caller; the layered wave blend is otherwise identical.
    return largeWaves(pw,t,largeMask)+mediumWaves(pw,t,mediumMask)+ripples(pw*1.8,t,rippleMask)*0.8;
}

vec3 waveNormal(
    vec2 p,
    float t,
    float largeMask,
    float mediumMask,
    float rippleMask
) {
    const float eps = 0.003;
    // AI: reuse the same depth attenuation across the four finite-difference wave samples; depth is constant for this fragment.
    float waveXp = waveFieldWithMasks(p + vec2(eps, 0.0), t, largeMask, mediumMask, rippleMask);
    float waveXn = waveFieldWithMasks(p - vec2(eps, 0.0), t, largeMask, mediumMask, rippleMask);
    float waveYp = waveFieldWithMasks(p + vec2(0.0, eps), t, largeMask, mediumMask, rippleMask);
    float waveYn = waveFieldWithMasks(p - vec2(0.0, eps), t, largeMask, mediumMask, rippleMask);

    return normalize(vec3(
        -(waveXp - waveXn) * 5.0,
        1.0,
        -(waveYp - waveYn) * 5.0
    ));
}

// ----------------------------------------------------
// HELPERS
// ----------------------------------------------------

float sampleTextAlpha(vec2 worldUV) {
    vec2  uv2 = (worldUV - u_textRect.xy) / u_textRect.zw * 0.5 + 0.5;
    float inB = step(0.0,uv2.x)*step(uv2.x,1.0)*step(0.0,uv2.y)*step(uv2.y,1.0);
    return texture(u_textTex, clamp(uv2,0.0,1.0)).a * inB;
}

float saturate(float v) {
    return clamp(v, 0.0, 1.0);
}

float smin(float a, float b, float k) {
    float safeK = max(k, 0.0001);
    float h = max(safeK - abs(a - b), 0.0) / safeK;
    return min(a, b) - h * h * safeK * 0.25;
}

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float aaCoverage(float signedDistance) {
    float width = max(fwidth(signedDistance), 0.0012);
    return smoothstep(-width, width, signedDistance);
}

float contactGapMask(float gap, float radius) {
    return 1.0 - smoothstep(0.0, radius, gap);
}

vec3 makeCameraRay(vec2 screenUV) {
    vec2 ndc = screenUV * 2.0 - 1.0;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);

    return normalize(
        u_cameraForward
      + u_cameraRight * ndc.x * aspect * u_cameraTanHalfFovY
      + u_cameraUp * ndc.y * u_cameraTanHalfFovY
    );
}

vec2 skyUvFromDirection(vec3 dir) {
    float y = saturate(dir.y * 0.5 + 0.5);
    vec2 dome = dir.xz / max(dir.y + 0.38, 0.16);
    return vec2(dome.x * 0.18 + 0.5, y);
}

vec3 shadeSkyDirection(vec3 dir, float phase01, vec3 sunCol, vec3 sunDir) {
    vec2 skyUv = skyUvFromDirection(dir);
    float skyY = skyUv.y;
    vec3 sky = skyColor(skyY, phase01);

    float sunAmount = max(dot(dir, sunDir), 0.0);
    float sunCore = pow(sunAmount, 1024.0);
    float sunGlow = pow(sunAmount, 64.0);
    float sunWash = pow(sunAmount, 14.0);
    vec3 sunLight = sunCol * (sunCore * 4.0 + sunGlow * 0.85 + sunWash * 0.22);

    float cloudBase;
    float density = cloudDensity(skyUv, u_time, phase01, cloudBase);
    float cloudBaseLight = smoothstep(0.52, 0.58, cloudBase);
    float sunLitCloud = sunWash * 0.15;
    vec3 warmCloudLight = sunCol * 1.3 + vec3(0.25);
    vec3 cloudLight = mix(vec3(1.0, 1.0, 1.05), warmCloudLight, sunWash);
    cloudLight *= mix(0.72, 1.0, cloudBaseLight);

    return mix(sky + sunLight, cloudLight + sunLight * sunLitCloud, density);
}

bool insideUnitSquare(vec2 uv) {
    return all(greaterThanEqual(uv, vec2(0.0))) &&
           all(lessThanEqual(uv, vec2(1.0)));
}

vec2 waterWorldToRippleUV(vec3 worldPos) {
    return (worldPos.xz - u_rippleWorldRect.xy) / u_rippleWorldRect.zw;
}

bool intersectWater(vec3 ro, vec3 rd, out float t, out vec3 pos) {
    if (rd.y >= -0.0001) {
        return false;
    }

    t = (u_waterLevel - ro.y) / rd.y;
    if (t <= 0.0) {
        return false;
    }

    pos = ro + rd * t;
    return true;
}

const float SHORE_BANK_TOE_OFFSET = 0.028;
const float SHORE_BANK_CREST_SETBACK = 0.020;
const float SHORE_BANK_FOOT_OFFSET_Y = 0.0;

float shorelineHeightAt(float worldX) {
    float x01 = clamp(worldX * 0.16 + 0.5, 0.0, 1.0);
    return u_waterLevel + max((baselineSilhouette(x01) - 0.513) * 1.45, 0.0);
}

float shorelineWaterEdgeZ() {
    return u_shorePlaneZ + SHORE_BANK_TOE_OFFSET;
}

float underwaterShelfHeightAt(float worldX, float worldZ) {
    float shelfDistance = max(worldZ - shorelineWaterEdgeZ(), 0.0);
    float shelfT = smoothstep(0.0, 0.78, shelfDistance);
    float shelfNoise = (shoreFbm(worldX * 0.95 + 21.0, 47.3) - 0.5) * 0.006 * (1.0 - shelfT);
    return min(u_waterLevel - 0.006, u_waterLevel - mix(0.014, 0.072, shelfT) + shelfNoise);
}

float shorelineTransitionSdf(vec2 p) {
    // AI: keep shoreline polishing local — use a tiny SDF union for the wet bank lip + shallow shelf instead of turning the whole pond into an SDF scene.
    float shallowShelf = sdBox(p - vec2(0.11, -0.022), vec2(0.14, 0.026));
    float wetLip = sdBox(p - vec2(-0.004, 0.012), vec2(0.040, 0.016));
    return smin(shallowShelf, wetLip, 0.045);
}

float shorelineTransitionMask(vec2 p, float radius) {
    return 1.0 - smoothstep(0.0, radius, shorelineTransitionSdf(p));
}

float shorelineBankSurfaceYAt(float worldX, float worldZ) {
    float crestY = shorelineHeightAt(worldX);
    float yBase = u_waterLevel + SHORE_BANK_FOOT_OFFSET_Y;
    float zToe = shorelineWaterEdgeZ();
    float zCrest = u_shorePlaneZ - SHORE_BANK_CREST_SETBACK;
    float slopeT = saturate((zToe - worldZ) / max(zToe - zCrest, 0.001));
    return mix(yBase, crestY, slopeT);
}

vec3 bankMaterialBase(float worldX, float hNorm, float phase) {
    float bankNoise = shoreFbm(worldX * 1.35 + 17.0, 61.7);
    float crestMask = smoothstep(0.58, 0.94, hNorm);
    vec3 bankShadow = mix(vec3(0.060, 0.050, 0.052), vec3(0.070, 0.048, 0.046), phase);
    vec3 bankLight = mix(vec3(0.122, 0.112, 0.092), vec3(0.140, 0.104, 0.070), phase);
    vec3 bankGrass = mix(vec3(0.090, 0.102, 0.070), vec3(0.112, 0.096, 0.062), phase);
    vec3 col = mix(bankShadow, bankLight, pow(hNorm, 0.72));
    col *= mix(0.94, 1.06, bankNoise);
    col = mix(col, bankGrass, crestMask * (0.28 + bankNoise * 0.18));
    return col;
}

bool intersectShore(vec3 ro, vec3 rd, out float t, out vec3 pos, out float height) {
    if (abs(rd.z) <= 0.0001) {
        return false;
    }

    float tProbe = (u_shorePlaneZ - ro.z) / rd.z;
    if (tProbe <= 0.0) {
        return false;
    }

    float yBase = u_waterLevel + SHORE_BANK_FOOT_OFFSET_Y;
    float zToe = shorelineWaterEdgeZ();
    float zCrest = u_shorePlaneZ - SHORE_BANK_CREST_SETBACK;
    float sampleX = ro.x + rd.x * tProbe;
    height = shorelineHeightAt(sampleX);

    // AI: solve against a shallow embankment profile rather than a vertical wall, so the opposite bank lands in the pond with a narrower, more natural band.
    for (int i = 0; i < 2; i++) {
        float slope = (zCrest - zToe) / max(height - yBase, 0.012);
        float denom = rd.z - rd.y * slope;
        if (abs(denom) <= 0.0001) {
            return false;
        }

        float rhs = zToe - ro.z + (ro.y - yBase) * slope;
        t = rhs / denom;
        if (t <= 0.0) {
            return false;
        }

        sampleX = ro.x + rd.x * t;
        height = shorelineHeightAt(sampleX);
    }

    pos = ro + rd * t;
    return pos.y >= yBase && pos.y <= height + 0.008;
}

vec2 sceneUVFromScreen(vec2 screenUV) {
    // Height-normalized scene UV:
    // X follows aspect, Y matches screen UV, which keeps the horizon and water split stable.
    return (screenUV - 0.5) * u_sceneScale + 0.5;
}

vec2 sceneCoordFromUV(vec2 sceneUV) {
    return sceneUV * 2.0 - 1.0;
}

// ----------------------------------------------------
// MAIN
// ----------------------------------------------------

out vec4 fragColor;

void main()
{
    vec2 screenUV = gl_FragCoord.xy / u_resolution.xy;
    vec3 ro = u_cameraPos;
    vec3 rd = makeCameraRay(screenUV);
    // AI: Phase 1 keeps the fullscreen pass, but moves the landscape into orbital camera/world-ray space so depth no longer depends only on a screen-space horizon split.
    float phase = clamp(u_scroll, 0.0, 1.0);
    vec3 sunCol = sunColor(phase);
    vec3 sunDir = sunDirection(phase);
    vec3 horizonSky = skyColor(0.5, phase);
    float tWater;
    vec3 waterPos;
    bool hasWater = intersectWater(ro, rd, tWater, waterPos);
    float tShore;
    vec3 shorePos;
    float shoreHeight;
    bool hasShore = intersectShore(ro, rd, tShore, shorePos, shoreHeight);
    float shoreWaterEdgeZ = shorelineWaterEdgeZ();
    bool waterWithinPond = hasWater && waterPos.z > shoreWaterEdgeZ;
    float waterToShoreGap = (hasWater && hasShore && tShore > tWater) ? (tShore - tWater) : 1e5;
    float shoreToWaterGap = (hasWater && hasShore && tWater > tShore) ? (tWater - tShore) : 1e5;
    float shorelineGap = min(waterToShoreGap, shoreToWaterGap);
    float shoreOverlapMask = 0.0;
    if (hasShore && hasWater && waterWithinPond && tShore < tWater) {
        vec2 shoreCrossPre = vec2(shorePos.z - shoreWaterEdgeZ, shorePos.y - u_waterLevel);
        float shorelineSeatMaskPre = shorelineTransitionMask(shoreCrossPre, 0.050);
        float shoreContactMaskPre = contactGapMask(shorelineGap, 0.22);
        float shoreBottomCoveragePre = aaCoverage(shorePos.y - (u_waterLevel + SHORE_BANK_FOOT_OFFSET_Y));
        float shoreRunupWavePre = max(
            waveFieldWithMasks(vec2(shorePos.x, shoreWaterEdgeZ) * 1.1, u_time, 0.16, 0.26, 0.32),
            0.0
        );
        float shoreFilmThicknessPre = max(0.0, (u_waterLevel + shoreRunupWavePre * 0.22 + shorelineSeatMaskPre * 0.007) - shorePos.y);
        float shoreFilmMaskPre = smoothstep(0.0, 0.018, shoreFilmThicknessPre) * shorelineSeatMaskPre;
        shoreOverlapMask = max(
            shoreFilmMaskPre,
            (1.0 - shoreBottomCoveragePre) * (0.88 * shorelineSeatMaskPre + 0.12 * shoreContactMaskPre)
        );
    }
    bool shoreAllowsWaterOverlap = shoreOverlapMask > 0.06;
    bool shoreOccludes = hasShore && (!waterWithinPond || !hasWater || (tShore < tWater && !shoreAllowsWaterOverlap));

#ifdef DEBUG_RIPPLE
    float debugHeight = 0.0;
    if (waterWithinPond) {
        vec2 rippleDebugUv = waterWorldToRippleUV(waterPos);
        if (insideUnitSquare(rippleDebugUv)) {
            debugHeight = texture(u_rippleTex, rippleDebugUv).r;
        }
    }
    fragColor = vec4(vec3(debugHeight * 0.5 + 0.5), 1.0);
    return;
#endif

    if (shoreOccludes)
    {
#ifdef DEBUG_NORMALS
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
#endif

        vec3 skyCol = shadeSkyDirection(rd, phase, sunCol, sunDir);

#ifdef DEBUG_REFLECTION
        fragColor = vec4(tonemap(skyCol), 1.0);
        return;
#endif

        float hNorm = saturate((shorePos.y - u_waterLevel) / max(shoreHeight - u_waterLevel, 0.001));
        float topEdge = exp(-abs(shoreHeight - shorePos.y) * 130.0);
        vec2 shoreCross = vec2(shorePos.z - shoreWaterEdgeZ, shorePos.y - u_waterLevel);
        float shorelineSeatMask = shorelineTransitionMask(shoreCross, 0.050);
        float shoreContactMask = contactGapMask(shoreToWaterGap, 0.22);
        float shoreContactCore = contactGapMask(shoreToWaterGap, 0.08);
        float shoreTopCoverage = aaCoverage(shoreHeight - shorePos.y);
        float shoreBottomCoverage = aaCoverage(shorePos.y - (u_waterLevel + SHORE_BANK_FOOT_OFFSET_Y));
        float shoreFootMask = 1.0 - smoothstep(0.0, 0.18, hNorm);
        float sunFacing = saturate(dot(normalize(vec3(0.0, 0.32, 1.0)), sunDir) * 0.5 + 0.5);
        float crestMask = smoothstep(0.58, 0.94, hNorm);
        float bankNoise = shoreFbm(shorePos.x * 1.35 + 17.0, 61.7);
        vec3 bankShadow = mix(vec3(0.060, 0.050, 0.052), vec3(0.070, 0.048, 0.046), phase);
        vec3 shallowShelfTint = mix(vec3(0.40, 0.31, 0.25), vec3(0.48, 0.28, 0.20), phase);
        vec3 wetEdgeTint = mix(vec3(0.18, 0.13, 0.11), vec3(0.20, 0.11, 0.09), phase);
        vec3 sharedContactCol = mix(
            wetEdgeTint + shallowShelfTint * 0.10,
            horizonSky * 0.58 + shallowShelfTint * 0.42,
            0.58
        );
        vec3 shoreCol = bankMaterialBase(shorePos.x, hNorm, phase);
        shoreCol *= mix(0.86, 1.06, sunFacing * 0.34 + hNorm * 0.22);
        shoreCol = mix(shoreCol, skyCol * 0.66 + vec3(0.032, 0.028, 0.032), crestMask * 0.10);
        shoreCol += (sunCol * 0.09 + skyCol * 0.08) * topEdge;
        shoreCol = mix(
            shoreCol,
            bankShadow * 0.90 + shallowShelfTint * 0.18 + skyCol * 0.04,
            shorelineSeatMask * shoreContactMask * 0.05
        );
        float shoreRunupWave = max(
            waveFieldWithMasks(vec2(shorePos.x, shoreWaterEdgeZ) * 1.1, u_time, 0.16, 0.26, 0.32),
            0.0
        );
        float shoreFilmThickness = max(0.0, (u_waterLevel + shoreRunupWave * 0.22 + shorelineSeatMask * 0.007) - shorePos.y);
        float shoreFilmMask = smoothstep(0.0, 0.018, shoreFilmThickness) * shorelineSeatMask;
        shoreCol += sunCol * shorelineSeatMask * shoreContactCore * 0.010;
        float shoreSharedBand = max(shoreContactMask * shorelineSeatMask, shoreFootMask);
        shoreCol = mix(shoreCol, bankShadow * 0.92 + shallowShelfTint * 0.22, shoreSharedBand * 0.02);
        vec2 shoreFilmP = vec2(shorePos.x, shoreWaterEdgeZ + 0.026) * 1.1;
        vec3 shoreFilmN = waveNormal(shoreFilmP, u_time, 0.16, 0.24, 0.30);
        shoreFilmN = normalize(mix(shoreFilmN, vec3(0.0, 1.0, 0.0), 0.62 + shoreFilmMask * 0.24));
        vec3 shoreFilmViewDir = normalize(ro - vec3(shorePos.x, u_waterLevel + shoreRunupWave * 0.12, shoreWaterEdgeZ + 0.022));
        vec3 shoreFilmReflDir = normalize(reflect(-shoreFilmViewDir, shoreFilmN));
        shoreFilmReflDir.y = max(shoreFilmReflDir.y, 0.001);
        vec3 shoreFilmSky = shadeSkyDirection(shoreFilmReflDir, phase, sunCol, sunDir);
        float shoreFilmCosTheta = clamp(dot(shoreFilmViewDir, shoreFilmN), 0.0, 1.0);
        float shoreFilmFresnel = 0.02 + 0.98 * pow(1.0 - shoreFilmCosTheta, 5.0);
        float shoreFilmSunMirror = max(dot(shoreFilmReflDir, sunDir), 0.0);
        vec3 shoreFilmSun = sunCol * (pow(shoreFilmSunMirror, 180.0) * 2.2 + pow(shoreFilmSunMirror, 42.0) * 0.34);
        vec3 shoreSeenThroughWater = shoreCol * vec3(0.80, 0.89, 0.97) + shallowShelfTint * 0.18;
        vec3 shoreFilmCol = mix(shoreSeenThroughWater, shoreFilmSky + shoreFilmSun, shoreFilmFresnel * 0.74);
        shoreFilmCol = mix(shoreFilmCol, shallowShelfTint * 0.72 + skyCol * 0.16, shoreFilmMask * 0.12);
        float shoreWatercoat = max(shoreFilmMask, (1.0 - shoreBottomCoverage) * (0.88 * shorelineSeatMask + 0.12 * shoreContactMask));
        shoreCol = mix(shoreCol, shoreFilmCol, shoreWatercoat * 0.96);
        shoreCol = mix(skyCol, shoreCol, shoreTopCoverage);

        fragColor = vec4(tonemap(shoreCol), 1.0);
        return;
    }

    if (!waterWithinPond)
    {
#ifdef DEBUG_NORMALS
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
#endif

        vec3 skyCol = shadeSkyDirection(rd, phase, sunCol, sunDir);

#ifdef DEBUG_REFLECTION
        fragColor = vec4(tonemap(skyCol), 1.0);
        return;
#endif

        vec3 titleWarm = sunCol * 1.25 + vec3(0.20, 0.22, 0.28);
        vec3 titleCol = mix(vec3(1.00, 0.97, 0.91), titleWarm, pow(max(dot(rd, sunDir), 0.0), 6.0) * 0.55);
        skyCol = mix(skyCol, titleCol, sampleTextAlpha(screenUV) * 0.90);

        fragColor = vec4(tonemap(skyCol), 1.0);
        return;
    }

    // ----------------------------------------------------
    // WATER
    // ----------------------------------------------------
    float t = u_time;
    // AI: derive water detail from actual camera distance + grazing angle; reusing shore/ripple-rect Z here flattens the whole far field into a fake pastel wall.
    float viewDistance = tWater;
    float farField = smoothstep(7.0, 26.0, viewDistance);
    float horizonGrazing = 1.0 - smoothstep(0.006, 0.05, abs(rd.y));
    float horizonMist = farField * horizonGrazing;
    float nearField = 1.0 - farField;
    float shorelineMask = contactGapMask(shorelineGap, 0.28);
    float shorelineCore = contactGapMask(shorelineGap, 0.10);
    float shelfBottomY = underwaterShelfHeightAt(waterPos.x, waterPos.z);
    float staticWaterDepth = max(u_waterLevel - shelfBottomY, 0.0);
    float shallowWaveDamping = 1.0 - smoothstep(0.006, 0.050, staticWaterDepth);
    float largeWaveMask  = mix(1.0, 0.68, farField) * (1.0 - shallowWaveDamping * 0.42);
    float mediumWaveMask = mix(1.0, 0.44, farField) * (1.0 - shallowWaveDamping * 0.24);
    float rippleWaveMask = mix(1.0, 0.18, farField) * (1.0 - shallowWaveDamping * 0.08);
    float microNoiseMask = mix(1.0, 0.22, farField) * (1.0 - shallowWaveDamping * 0.22);
    vec2 p = waterPos.xz * 1.1;
    float waveHeight = waveFieldWithMasks(p, t, largeWaveMask, mediumWaveMask, rippleWaveMask);

    // НОРМАЛЬ ВОЛН
    vec3 n = waveNormal(p, t, largeWaveMask, mediumWaveMask, rippleWaveMask);

    // ИНТЕРАКТИВНАЯ РЯБЬ
    {
        vec2 rUV = waterWorldToRippleUV(waterPos);
        if (insideUnitSquare(rUV)) {
            float rt  = u_rippleTexel;
            float rxP = texture(u_rippleTex, clamp(rUV + vec2(rt, 0.0), 0.0, 1.0)).r;
            float rxN = texture(u_rippleTex, clamp(rUV - vec2(rt, 0.0), 0.0, 1.0)).r;
            float ryP = texture(u_rippleTex, clamp(rUV + vec2(0.0, rt), 0.0, 1.0)).r;
            float ryN = texture(u_rippleTex, clamp(rUV - vec2(0.0, rt), 0.0, 1.0)).r;
            vec2 rippleGrad = vec2(rxP - rxN, ryP - ryN);
            vec2 rippleEdge = min(rUV, 1.0 - rUV);
            float rippleFade = smoothstep(0.0, 0.065, min(rippleEdge.x, rippleEdge.y));
            // AI: keep ripple perturbation in ripple-texture space, but soften the world-space coupling so interaction reads as water relief instead of crater-like reflection breaks.
            n = normalize(n + vec3(-rippleGrad.x * 2.2, 0.0, -rippleGrad.y * 2.2) * rippleFade);
        }
    }

#ifdef DEBUG_NORMALS
    fragColor = vec4(n * 0.5 + 0.5, 1.0);
    return;
#endif

    // MICRO NORMAL NOISE
    {
        vec2 mn = microNormalDelta(p, t, microNoiseMask);
        n = normalize(n + vec3(mn.x, 0.0, mn.y) * 0.28);
    }

    float bankSurfaceY = shorelineBankSurfaceYAt(waterPos.x, waterPos.z);
    float bankSurfaceNorm = saturate((bankSurfaceY - u_waterLevel) / max(shorelineHeightAt(waterPos.x) - u_waterLevel, 0.001));
    float waterSurfaceY = u_waterLevel + max(waveHeight, 0.0) * 0.22;
    float shallowThickness = max(0.0, waterSurfaceY - shelfBottomY);
    float shallowWaterAlpha = smoothstep(0.014, 0.060, shallowThickness);
    float shallowReveal = 1.0 - shallowWaterAlpha;
    float calmBand = max(shallowReveal * 0.30, shorelineCore * 0.08 + shallowWaveDamping * 0.12);
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), calmBand));

    float rippleStrength = 1.0 - n.y;
    vec3 viewDir = normalize(ro - waterPos);

    // FRESNEL
    float cosTheta = clamp(dot(viewDir,n), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);

    // ОТРАЖЕНИЕ НЕБА + БЕРЕГА
    vec3 reflDir = normalize(reflect(-viewDir, n));
    reflDir.y = max(reflDir.y, 0.001);
    vec3 skyRefl = shadeSkyDirection(reflDir, phase, sunCol, sunDir);

    {
        vec2 reflSkyUv = skyUvFromDirection(reflDir);
        float vegReflH = vegetationProfile(clamp(reflSkyUv.x, 0.0, 1.0));
        float vegReflMask = smoothstep(vegReflH + 0.012, vegReflH - 0.012, reflSkyUv.y);
        if (vegReflMask > 0.0) {
            vec3 vReflBase = mix(vec3(0.022, 0.032, 0.062), vec3(0.030, 0.014, 0.030), phase);
            float vWaterRim = exp(-abs(reflSkyUv.y - vegReflH) * 42.0) * 0.12;
            vReflBase += sunCol * vWaterRim * 0.24;
            skyRefl = mix(skyRefl, vReflBase, vegReflMask * (0.18 + 0.28 * nearField));
        }
    }

#ifdef DEBUG_REFLECTION
    fragColor = vec4(tonemap(skyRefl), 1.0);
    return;
#endif

    // СОЛНЕЧНАЯ ДОРОЖКА
    float sunMirror = max(dot(reflDir, sunDir), 0.0);
    vec3 sunLight = sunCol * (pow(sunMirror, 180.0) * 4.5 + pow(sunMirror, 42.0) * 0.7);
    sunLight *= (1.0 - shorelineCore * 0.72);

    // ЦВЕТ ВОДЫ
    vec3 waterDeep = mix(vec3(0.03,0.10,0.16), skyRefl*0.6, 0.3);
    vec3 waterCol  = mix(waterDeep, skyRefl + sunLight, fresnel);
    vec3 shallowShelfTint = mix(vec3(0.40, 0.31, 0.25), vec3(0.48, 0.28, 0.20), phase);
    vec3 wetEdgeTint = mix(vec3(0.18, 0.13, 0.11), vec3(0.20, 0.11, 0.09), phase);
    vec3 sharedContactCol = mix(
        wetEdgeTint + shallowShelfTint * 0.10,
        horizonSky * 0.58 + shallowShelfTint * 0.42,
        0.58
    );
    float waterSharedBand = max(shorelineCore * 0.18, shallowReveal * 0.24);
    float shelfBottomNoise = 0.92 + 0.08 * shoreFbm(waterPos.x * 1.05 + 9.0, 63.7);
    vec3 bankUnderwaterCol = bankMaterialBase(waterPos.x, max(bankSurfaceNorm, 0.05), phase) * vec3(0.78, 0.88, 0.97);
    vec3 shallowBottomCol = mix(
        shallowShelfTint * 0.80 + wetEdgeTint * 0.22 + skyRefl * 0.04,
        bankUnderwaterCol + shallowShelfTint * 0.10,
        shallowReveal * 0.72
    ) * shelfBottomNoise;
    waterCol = mix(waterCol, waterCol * vec3(0.94, 0.96, 0.90) + shallowShelfTint * 0.12, shorelineMask * 0.18);
    waterCol = mix(shallowBottomCol, waterCol, shallowWaterAlpha);
    waterCol = mix(waterCol, bankUnderwaterCol + skyRefl * 0.08, shallowReveal * 0.18);
    waterCol = mix(waterCol, sharedContactCol, waterSharedBand * 0.015);
    waterCol += (sunCol * 0.05 + vec3(0.015, 0.016, 0.018)) * shorelineCore * (0.10 + 0.24 * rippleStrength);

    // СПЕКУЛЯР + ГЛИНТЫ
    vec3 halfDir  = normalize(sunDir + viewDir);
    float glint = pow(max(dot(n,sunDir),0.0),80.0) * rippleStrength * mix(0.32, 1.0, nearField) * 3.5;
    glint *= (1.0 - shorelineCore * 0.88);
    waterCol += glint*sunCol*1.2;
    waterCol  = mix(waterCol, waterCol*vec3(0.88,0.93,1.05),
                    rippleStrength * 0.28 * mix(0.26, 1.0, nearField));
    waterCol += pow(max(dot(n,halfDir),0.0),52.0) * 0.9 * mix(0.46, 1.0, nearField) * (sunCol*1.5+vec3(0.1));

    vec3 horizonLift = mix(horizonSky, skyRefl, 0.68);
    vec3 col = mix(waterCol, horizonLift, horizonMist * 0.10 * (1.0 - shorelineCore * 0.82));
    col = mix(col, sharedContactCol, waterSharedBand * 0.02);

    // ОТРАЖЕНИЕ НАЗВАНИЯ
    vec2 textRefl = vec2(
        clamp(screenUV.x + n.x * 0.02, 0.0, 1.0),
        clamp(1.0 - screenUV.y + n.z * 0.06, 0.0, 1.0)
    );
    float waterA = sampleTextAlpha(textRefl)
                 * fresnel
                 * (0.55 + 0.45 * nearField)
                 * (0.50+0.50*rippleStrength);
    col += (sunCol*1.6+vec3(0.12,0.15,0.22)) * waterA * 0.78;

    fragColor = vec4(tonemap(col), 1.0);
}
