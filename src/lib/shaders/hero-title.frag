#version 300 es
precision highp float;

in vec2  v_uvAtlas;
in float v_worldY;
in float v_passMode;
// AI: Phase 2 atmospheric perspective — camera depth from vert shader.
in float v_viewDist;

uniform sampler2D u_titleAtlas;
uniform vec2  u_titleAtlasSize;
uniform float u_titleAtlasPxRange;
uniform float u_phase;
uniform float u_waterLevel;

out vec4 fragColor;

float median3(vec3 sampleValue) {
    return max(min(sampleValue.r, sampleValue.g), min(max(sampleValue.r, sampleValue.g), sampleValue.b));
}

float screenPxRange() {
    vec2 unitRange = vec2(u_titleAtlasPxRange) / max(u_titleAtlasSize, vec2(1.0));
    vec2 screenTexSize = vec2(1.0) / max(fwidth(v_uvAtlas), vec2(1e-5));
    return max(0.5 * dot(unitRange, screenTexSize), 1.0);
}

float titleReveal(float phase01) {
    return smoothstep(0.62, 0.88, clamp(phase01, 0.0, 1.0));
}

float titleReflectionReveal(float phase01) {
    // AI: reflection lags direct title slightly, matching late-sunset readability.
    return smoothstep(0.67, 0.93, clamp(phase01, 0.0, 1.0));
}

// AI: exact display target for title ink:
// DayGlo NightGlo NG200 reference -> #c9f08a (sRGB 201,240,138).
// Since scene composition is linear, keep shader constants in linear space.
const vec3 TITLE_DAYGLO_LINEAR = vec3(0.584078418, 0.871367119, 0.254152094);
const vec3 TITLE_DAYGLO_REFLECTION_TINT_LINEAR = vec3(0.673859541, 0.911407500, 0.507078510);

void main() {
    vec3 msdf = texture(u_titleAtlas, v_uvAtlas).rgb;
    float signedDistance = median3(msdf) - 0.5;
    float opacity = clamp(screenPxRange() * signedDistance + 0.5, 0.0, 1.0);
    if (opacity <= 0.001) {
        discard;
    }

    vec3 directCol = TITLE_DAYGLO_LINEAR;
    vec3 reflectionCol = mix(directCol, TITLE_DAYGLO_REFLECTION_TINT_LINEAR, 0.24);
    float revealDirect = titleReveal(u_phase);
    float revealReflection = titleReflectionReveal(u_phase);

    if (v_passMode > 0.5) {
        // Reflection geometry path (mirrored billboard under water).
        float reflectionDepth = clamp((u_waterLevel - v_worldY) / 0.24, 0.0, 1.0);
        float reflectionAlpha = opacity * smoothstep(0.03, 0.22, reflectionDepth) * 0.28 * revealReflection;
        fragColor = vec4(reflectionCol, reflectionAlpha);
        return;
    }

    // Direct rendering path — world-space billboard above water.
    float emergence = smoothstep(u_waterLevel - 0.010, u_waterLevel + 0.030, v_worldY);

    // AI: Phase 2 atmospheric perspective.
    // Gentle depth fog: title at viewDist≈3.36 fades to ~86% opacity.
    // Starts fading past 1.2 world units depth (near-camera text stays crisp).
    // Ref: IQ "Outdoors Lighting" — atmospheric scattering per distance
    // https://iquilezles.org/articles/outdoorslighting/
    float atmFade = exp(-max(v_viewDist - 1.2, 0.0) * 0.09);

    fragColor = vec4(directCol, opacity * emergence * atmFade * revealDirect);
}
