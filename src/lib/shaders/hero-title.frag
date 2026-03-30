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

void main() {
    vec3 msdf = texture(u_titleAtlas, v_uvAtlas).rgb;
    float signedDistance = median3(msdf) - 0.5;
    float opacity = clamp(screenPxRange() * signedDistance + 0.5, 0.0, 1.0);
    if (opacity <= 0.001) {
        discard;
    }

    // Lime-green color matching original project design language.
    // Both passMode paths use variants of this base color.
    vec3 directCol = vec3(0.7882353, 0.9411765, 0.5411765);
    vec3 reflectionCol = mix(directCol, vec3(0.84, 0.96, 0.74), 0.24);

    if (v_passMode > 0.5) {
        // Reflection geometry path (mirrored billboard under water).
        float reflectionDepth = clamp((u_waterLevel - v_worldY) / 0.24, 0.0, 1.0);
        float reflectionAlpha = opacity * smoothstep(0.03, 0.22, reflectionDepth) * 0.28;
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

    fragColor = vec4(directCol, opacity * emergence * atmFade);
}
