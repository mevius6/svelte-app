#version 300 es
precision highp float;

in vec2  v_uvAtlas;
in float v_height;
in float v_viewDist;
in float v_worldY;

uniform vec2  u_resolution;
uniform vec2  u_sceneScale;
uniform float u_horizon;
uniform float u_phase;
uniform float u_debugView;

uniform sampler2D u_foliageAlbedo;
uniform sampler2D u_foliageAlpha;
uniform sampler2D u_foliageNormal;
uniform sampler2D u_foliageRoughness;
uniform sampler2D u_foliageTranslucency;

out vec4 fragColor;

#define PI 3.14159265359
const float VEGETATION_FOG_DISSIPATE_START = 0.38;
const float VEGETATION_FOG_DISSIPATE_END = 0.58;
const float VEGETATION_FOG_DENSITY = 0.085;
const float VEGETATION_FOG_HEIGHT_FALLOFF = 3.2;

vec3 skyColor(float y, float phase01)
{
    vec3 top    = mix(vec3(0.08,0.18,0.45), vec3(0.02,0.02,0.08), phase01);
    vec3 bottom = mix(vec3(0.85,0.52,0.38), vec3(1.00,0.35,0.22), phase01);
    return mix(bottom, top, pow(clamp(y,0.0,1.0), 1.3));
}

void sun(in float phase01, out vec2 pos, out vec3 col)
{
    float sunY = mix(0.52, 0.68, sin(phase01 * PI));
    pos = vec2(mix(0.25, 0.75, phase01), sunY);
    col = mix(vec3(1.0, 0.7, 0.45), vec3(1.0, 0.55, 0.25), phase01);
}

void main() {
    vec3  albedo       = texture(u_foliageAlbedo, v_uvAtlas).rgb;
    float alpha        = texture(u_foliageAlpha, v_uvAtlas).r;
    vec3  normalSample = texture(u_foliageNormal, v_uvAtlas).xyz * 2.0 - 1.0;
    float roughness    = clamp(texture(u_foliageRoughness, v_uvAtlas).r, 0.06, 1.0);
    vec3  translucency = texture(u_foliageTranslucency, v_uvAtlas).rgb;

    if (alpha < 0.02) discard;

    float phase = clamp(u_phase, 0.0, 1.0);
    vec2 screenUV = gl_FragCoord.xy / u_resolution.xy;
    vec2 uv = (screenUV - 0.5) * u_sceneScale + 0.5;

    vec2 sunPos;
    vec3 sunCol;
    sun(phase, sunPos, sunCol);

    vec2 sunDir2D = normalize(sunPos - vec2(uv.x, u_horizon));
    vec3 lightDir = normalize(vec3(sunDir2D.x * 0.85, 0.72, sunDir2D.y));
    vec3 viewDir  = normalize(vec3(0.0, 0.32, 1.0));
    vec3 halfDir  = normalize(lightDir + viewDir);

    vec3 n = normalize(vec3(normalSample.x, normalSample.y, max(normalSample.z, 0.18)));
    float diffuse = max(dot(n, lightDir), 0.0);
    float backScatter = pow(max(dot(-lightDir, n), 0.0), 1.35);
    float specular = pow(max(dot(n, halfDir), 0.0), mix(40.0, 10.0, roughness))
                   * mix(0.24, 0.05, roughness);

    float tipMask = smoothstep(0.28, 1.0, v_height);
    float rootMask = 1.0 - smoothstep(0.08, 0.34, v_height);
    float alphaSoft = smoothstep(0.02, 0.10, alpha);

    vec3 ambientSky = skyColor(u_horizon + v_height * 0.16, phase);
    vec3 shoreColor = mix(vec3(0.090, 0.074, 0.050), vec3(0.066, 0.056, 0.054), phase);
    vec3 ambient = mix(shoreColor * 1.05, ambientSky * vec3(0.64, 0.78, 0.62), 0.70);
    vec3 direct  = sunCol * (0.10 + diffuse * 0.32);
    vec3 trans   = translucency * (sunCol * 0.62 + vec3(0.08, 0.10, 0.06)) * backScatter * 0.26;
    vec3 spec    = sunCol * specular * 0.07;

    // лёгкая вертикальная градиентная коррекция: темнее у земли
    float shade = mix(0.68, 0.96, v_height);
    vec3 col = albedo * (ambient + direct);
    col += trans + spec;

    vec3 tipHaze = mix(ambientSky, sunCol * 0.30 + ambientSky * 0.70, 0.35);
    col = mix(col, shoreColor * 0.94, rootMask * 0.22);
    col = mix(col, tipHaze, tipMask * 0.24);
    col = mix(col, ambientSky * vec3(0.76, 0.78, 0.72), 0.14 + tipMask * 0.08);

    // AI: PoC tuning — soften far-horizon grass into atmosphere to avoid hard
    // "saw" silhouette and reduce alpha-overdraw dominance near horizon.
    float distanceFade = smoothstep(2.2, 5.6, v_viewDist);
    float horizonBand = exp(-abs(screenUV.y - u_horizon) * 30.0);
    float atmosphericBlend = clamp(distanceFade * (0.35 + horizonBand * 0.65), 0.0, 1.0);
    vec3 hazeTarget = ambientSky * vec3(0.84, 0.88, 0.82) + sunCol * 0.06;
    if (u_debugView <= 0.5) {
        col = mix(col, hazeTarget, atmosphericBlend * 0.32);
    }

    // AI: make grass participate in dawn fog so it does not read as "over" atmosphere.
    // Uses a cheap exponential-height approximation in the vegetation pass.
    float dawnMask = 1.0 - smoothstep(
        VEGETATION_FOG_DISSIPATE_START,
        VEGETATION_FOG_DISSIPATE_END,
        clamp(u_phase, 0.0, 1.0)
    );
    float fogDistance = max(v_viewDist - 0.35, 0.0);
    float fogHeight = max(v_worldY, -0.02);
    float fogTau = VEGETATION_FOG_DENSITY * dawnMask * exp(-VEGETATION_FOG_HEIGHT_FALLOFF * fogHeight) * fogDistance;
    float fogAmount = 1.0 - exp(-fogTau);
    vec3 dawnFogCol = vec3(0.90, 0.86, 0.84);
    vec3 vegetationFogCol = mix(dawnFogCol, ambientSky * vec3(0.92, 0.95, 0.90), 0.38);
    if (u_debugView <= 0.5) {
        col = mix(col, vegetationFogCol, fogAmount * 0.78);
    }

    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(
        col,
        vec3(luma),
        (0.08 + tipMask * 0.08) + (u_debugView <= 0.5 ? atmosphericBlend * 0.12 : 0.0)
    );
    col *= mix(shade, shade * 0.94, u_debugView <= 0.5 ? atmosphericBlend : 0.0);

    float distanceAlpha = mix(1.0, 0.72, distanceFade);
    if (u_debugView > 0.5) {
        distanceAlpha = 1.0;
    }

    fragColor = vec4(col, alpha * alphaSoft * (0.76 - tipMask * 0.10) * distanceAlpha);
}
