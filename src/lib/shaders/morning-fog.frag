#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_phase;
uniform float u_time;
uniform float u_debugDensity;

out vec4 fragColor;

// AI: POC tuning notes:
// - Keep fog mostly in early day and fully dissipated before title reveal starts (0.62).
// - Physical/base dawn fog now lives in landscape.frag (analytic height fog).
// - This pass is a secondary artistic wisp layer; keep density conservative.
// - For denser dawn mood: lower FOG_DISSIPATE_START and/or increase FOG_DENSITY.
const float FOG_DISSIPATE_START = 0.38;
const float FOG_DISSIPATE_END = 0.58;
const float FOG_DENSITY = 0.05;
const float FOG_HORIZON_Y = 0.50;
const float FOG_HORIZON_WIDTH = 0.17;
const float FOG_LOW_FALLOFF = 4.0;
const float FOG_WISP_MIN = 0.32;
const float FOG_WISP_MAX = 0.86;
const float FOG_TOP_FADE_START = 0.60;
const float FOG_TOP_FADE_END = 0.92;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm3(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 3; i++) {
        sum += valueNoise(p) * amp;
        p = p * 2.03 + vec2(17.0, 11.0);
        amp *= 0.5;
    }
    return sum;
}

void main() {
    vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
    float phase = clamp(u_phase, 0.0, 1.0);

    float dawnMask = 1.0 - smoothstep(FOG_DISSIPATE_START, FOG_DISSIPATE_END, phase);
    float horizonBand = exp(-pow((uv.y - FOG_HORIZON_Y) / FOG_HORIZON_WIDTH, 2.0));
    // AI: suppress narrow bright ridge exactly at horizon center, while keeping
    // broad atmospheric band around it.
    float horizonCore = exp(-pow((uv.y - FOG_HORIZON_Y) / (FOG_HORIZON_WIDTH * 0.34), 2.0));
    horizonBand = max(horizonBand - horizonCore * 0.30, 0.0);
    float lowLayer = exp(-uv.y * FOG_LOW_FALLOFF);
    float topFade = 1.0 - smoothstep(FOG_TOP_FADE_START, FOG_TOP_FADE_END, uv.y);

    vec2 flowUv = vec2(
        uv.x * 2.35 + u_time * 0.016,
        uv.y * 4.20 - u_time * 0.010
    );
    float fogNoise = fbm3(flowUv);
    float wisp = smoothstep(FOG_WISP_MIN, FOG_WISP_MAX, fogNoise);
    float horizonBreak = 0.78 + 0.22 * fbm3(vec2(uv.x * 10.0 + u_time * 0.006, 2.7));
    horizonBand *= horizonBreak;

    float density = (horizonBand * 0.56 + lowLayer * 0.44) * mix(0.58, 1.02, wisp);
    density *= dawnMask * FOG_DENSITY * topFade;
    density = clamp(density, 0.0, 0.9);

    if (u_debugDensity > 0.5) {
        float densityVis = clamp(density * 18.0, 0.0, 1.0);
        vec3 lowVis = vec3(0.02, 0.04, 0.08);
        vec3 highVis = vec3(0.92, 0.96, 1.0);
        fragColor = vec4(mix(lowVis, highVis, densityVis), 1.0);
        return;
    }

    vec3 dawnFog = vec3(0.91, 0.86, 0.84);
    vec3 lateFog = vec3(0.87, 0.83, 0.82);
    vec3 fogColor = mix(dawnFog, lateFog, smoothstep(0.0, 0.65, phase));

    fragColor = vec4(fogColor, density);
}
