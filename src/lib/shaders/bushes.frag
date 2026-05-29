#version 300 es
precision highp float;

in vec2  v_uvAtlas;
in float v_height;
in float v_viewDist;
in float v_worldY;
in vec3  v_worldPos;
in float v_sparkleSeed;

uniform vec2  u_resolution;
uniform vec2  u_sceneScale;
uniform vec3  u_cameraPos;
uniform float u_horizon;
uniform float u_phase;
uniform float u_debugView;
uniform float u_time;

uniform sampler2D u_foliageAlbedo;
uniform sampler2D u_foliageAlpha;
uniform sampler2D u_foliageNormal;
uniform sampler2D u_foliageRoughness;
uniform sampler2D u_foliageTranslucency;

out vec4 fragColor;

#define PI 3.14159265359

const float VEGETATION_FOG_DISSIPATE_START = 0.18;
const float VEGETATION_FOG_DISSIPATE_END = 0.36;
const float VEGETATION_FOG_DENSITY = 0.085;
const float VEGETATION_FOG_HEIGHT_FALLOFF = 3.2;

vec3 skyColor(float y, float phase01)
{
    vec3 top = vec3(0.08, 0.18, 0.45);
    vec3 bottomBase = mix(vec3(0.85, 0.52, 0.38), vec3(1.00, 0.35, 0.22),
                          smoothstep(0.65, 1.0, phase01));
    return mix(bottomBase, top, pow(clamp(y, 0.0, 1.0), 1.3));
}

vec3 sunColor(float phase01) {
    return mix(vec3(1.0, 0.7, 0.45), vec3(1.0, 0.55, 0.25), phase01);
}

// Matches landscape/domains/sky.glsl — scroll drives sun azimuth for grass shimmer.
vec3 sunDirection(float phase01) {
    float dayT = clamp((phase01 - 0.15) / 0.85, 0.0, 1.0);
    float azimuth = mix(-0.78, 0.78, dayT);
    float elevation = mix(0.08, 0.34, sin(dayT * PI));
    return normalize(vec3(
        sin(azimuth) * cos(elevation),
        sin(elevation),
        -cos(azimuth) * cos(elevation)
    ));
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

    vec3 sunCol = sunColor(phase);
    vec3 sunDir = sunDirection(phase);
    vec3 viewDir = normalize(u_cameraPos - v_worldPos);
    vec3 lightDir = sunDir;
    vec3 halfDir = normalize(lightDir + viewDir);

    vec3 n = normalize(vec3(normalSample.x, normalSample.y, max(normalSample.z, 0.18)));
    float diffuse = max(dot(n, lightDir), 0.0);
    float backScatter = pow(max(dot(-lightDir, n), 0.0), 1.35);
    float tipMask = smoothstep(0.22, 1.0, v_height);
    float rootMask = 1.0 - smoothstep(0.08, 0.34, v_height);
    float alphaSoft = smoothstep(0.02, 0.10, alpha);

    float specTight = pow(max(dot(n, halfDir), 0.0), mix(52.0, 120.0, tipMask));
    float specWide = pow(max(dot(n, halfDir), 0.0), mix(12.0, 28.0, tipMask));
    float sunFacing = pow(max(dot(n, lightDir), 0.0), 2.4);

    // Scroll-driven shimmer: sun azimuth + per-blade sparkle as phase advances.
    float dayT = clamp((phase - 0.15) / 0.85, 0.0, 1.0);
    float sparklePhase = dayT * 6.2831 + v_worldPos.x * 7.5 + v_sparkleSeed * 9.2;
    float sparkle = 0.55 + 0.45 * sin(sparklePhase + u_time * 0.35);
    float shimmer = (specTight * 0.62 + specWide * 0.28 + sunFacing * 0.18)
                  * tipMask
                  * sparkle;

    float specular = specTight * mix(0.08, 0.22, tipMask) * (0.72 + 0.28 * sparkle);

    vec3 ambientSky = skyColor(u_horizon + v_height * 0.16, phase);
    vec3 shoreColor = mix(vec3(0.090, 0.074, 0.050), vec3(0.066, 0.056, 0.054), phase);
    vec3 ambient = mix(shoreColor * 1.05, ambientSky * vec3(0.64, 0.78, 0.62), 0.70);
    vec3 direct  = sunCol * (0.12 + diffuse * 0.36);
    vec3 trans   = translucency * (sunCol * 0.78 + vec3(0.06, 0.08, 0.05))
                 * backScatter * mix(0.22, 0.42, tipMask);
    vec3 spec    = sunCol * (specular + shimmer * 0.14);

    float shade = mix(0.70, 0.98, v_height);
    vec3 col = albedo * (ambient + direct);
    col += trans + spec;

    vec3 tipHaze = mix(ambientSky, sunCol * 0.30 + ambientSky * 0.70, 0.35);
    col = mix(col, shoreColor * 0.94, rootMask * 0.22);
    col = mix(col, tipHaze, tipMask * 0.22);
    col = mix(col, ambientSky * vec3(0.76, 0.78, 0.72), 0.14 + tipMask * 0.08);

    float distanceFade = smoothstep(2.2, 5.6, v_viewDist);
    float horizonBand = exp(-abs(screenUV.y - u_horizon) * 30.0);
    float atmosphericBlend = clamp(distanceFade * (0.35 + horizonBand * 0.65), 0.0, 1.0);
    vec3 hazeTarget = ambientSky * vec3(0.84, 0.88, 0.82) + sunCol * 0.06;
    if (u_debugView <= 0.5) {
        col = mix(col, hazeTarget, atmosphericBlend * 0.32);
    }

    float dawnMask = 1.0 - smoothstep(
        VEGETATION_FOG_DISSIPATE_START,
        VEGETATION_FOG_DISSIPATE_END,
        phase
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
        (0.06 + tipMask * 0.06) + (u_debugView <= 0.5 ? atmosphericBlend * 0.12 : 0.0)
    );
    col *= mix(shade, shade * 0.94, u_debugView <= 0.5 ? atmosphericBlend : 0.0);

    float distanceAlpha = mix(1.0, 0.72, distanceFade);
    if (u_debugView > 0.5) {
        distanceAlpha = 1.0;
    }

    fragColor = vec4(col, alpha * alphaSoft * (0.78 - tipMask * 0.08) * distanceAlpha);
}
