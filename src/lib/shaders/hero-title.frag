#version 300 es
precision highp float;

in vec2  v_uvAtlas;
in float v_worldY;
// NOTE: Phase 2 atmospheric perspective — camera depth from vert shader.
in float v_viewDist;

uniform sampler2D u_titleAtlas;
uniform vec2  u_titleAtlasSize;
uniform float u_titleAtlasPxRange;
uniform float u_phase;
uniform float u_waterLevel;
// uniform float u_digit;

out vec4 fragColor;

#include "landscape/common/msdf_core.glsl"

float screenPxRange() {
    return msdfScreenPxRange(u_titleAtlasPxRange, u_titleAtlasSize, v_uvAtlas);
}

float titleReveal(float phase01) {
    return smoothstep(0.78, 0.94, clamp(phase01, 0.0, 1.0));
}

// NOTE: exact display target for title ink:
// DayGlo NightGlo NG200 reference -> #c9f08a (sRGB 201,240,138).
// Since scene composition is linear, keep shader constants in linear space.
const vec3 TITLE_DAYGLO_LINEAR = vec3(0.584078418, 0.871367119, 0.254152094);

void main() {
    vec3 msdf = texture(u_titleAtlas, v_uvAtlas).rgb;
    float signedDistance = msdfMedian(msdf.r, msdf.g, msdf.b) - 0.5;
    float opacity = clamp(screenPxRange() * signedDistance + 0.5, 0.0, 1.0);
    if (opacity <= 0.001) {
        discard;
    }

    vec3 directCol = TITLE_DAYGLO_LINEAR;
    // float revealDirect = titleReveal(u_phase);

    // Direct rendering path — world-space billboard above water.
    float emergence = smoothstep(u_waterLevel - 0.010, u_waterLevel + 0.030, v_worldY);

    // NOTE: Phase 2 atmospheric perspective.
    // Gentle depth fog: title at viewDist≈3.36 fades to ~86% opacity.
    // Starts fading past 1.2 world units depth (near-camera text stays crisp).
    // Ref: IQ "Outdoors Lighting" — atmospheric scattering per distance
    // https://iquilezles.org/articles/outdoorslighting/
    // float atmFade = exp(-max(v_viewDist - 1.2, 0.0) * 0.09);

    // fragColor = vec4(directCol, opacity * emergence * atmFade * revealDirect);
    fragColor = vec4(directCol, opacity * emergence);
    // fragColor = vec4(directCol, opacity);
}
