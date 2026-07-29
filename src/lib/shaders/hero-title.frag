#version 300 es
precision highp float;

in vec2  v_uvAtlas;
in float v_worldY;

uniform sampler2D u_titleAtlas;
uniform vec2  u_titleAtlasSize;
uniform float u_titleAtlasPxRange;
uniform float u_phase;
uniform float u_waterLevel;
// uniform float u_digit;

out vec4 fragColor;

#include "landscape/common/constants.glsl"
#include "landscape/common/title_timing.glsl"
#include "landscape/common/msdf_core.glsl"

float screenPxRange() {
    return msdfScreenPxRange(u_titleAtlasPxRange, u_titleAtlasSize, v_uvAtlas);
}

void main() {
    vec3 msdf = texture(u_titleAtlas, v_uvAtlas).rgb;
    float signedDistance = msdfMedian(msdf.r, msdf.g, msdf.b) - 0.5;
    float opacity = clamp(screenPxRange() * signedDistance + 0.5, 0.0, 1.0);
    if (opacity <= 0.001) {
        discard;
    }

    vec3 directCol = TITLE_DAYGLO_LINEAR;
    float revealDirect = titleReveal(u_phase);

    // Direct rendering path — world-space billboard above water.
    float emergence = smoothstep(u_waterLevel - 0.010, u_waterLevel + 0.030, v_worldY);

    fragColor = vec4(directCol, opacity * emergence * revealDirect);
}
