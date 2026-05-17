#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_glowResolution;
uniform sampler2D u_glowTex;
uniform float u_phase;
uniform float u_time;
uniform float u_debugIsolate;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
    vec2 glowTexel = vec2(1.0) / max(u_glowResolution, vec2(1.0));

    // AI: extra wide taps emulate bloom layering richness without introducing boxy artifacts.
    vec4 blurA = texture(u_glowTex, uv);
    vec4 blurB =
        texture(u_glowTex, uv + vec2(glowTexel.x * 2.5, 0.0)) +
        texture(u_glowTex, uv - vec2(glowTexel.x * 2.5, 0.0)) +
        texture(u_glowTex, uv + vec2(0.0, glowTexel.y * 2.5)) +
        texture(u_glowTex, uv - vec2(0.0, glowTexel.y * 2.5));
    blurB *= 0.25;

    vec4 blurC =
        texture(u_glowTex, uv + vec2(glowTexel.x * 6.0, glowTexel.y * 6.0)) +
        texture(u_glowTex, uv + vec2(-glowTexel.x * 6.0, glowTexel.y * 6.0)) +
        texture(u_glowTex, uv + vec2(glowTexel.x * 6.0, -glowTexel.y * 6.0)) +
        texture(u_glowTex, uv + vec2(-glowTexel.x * 6.0, -glowTexel.y * 6.0));
    blurC *= 0.25;

    float sunsetBoost = mix(0.92, 1.08, smoothstep(0.70, 1.0, u_phase));
    float pulse = 0.98 + 0.02 * sin(u_time * 0.85);

    vec3 glowRgb = (blurA.rgb * 1.08 + blurB.rgb * 0.72 + blurC.rgb * 0.32)
        * sunsetBoost * 0.96 * pulse;
    float energy = blurA.a * 0.80 + blurB.a * 0.52 + blurC.a * 0.24;
    float softMask = smoothstep(0.01, 0.26, energy);
    glowRgb *= mix(0.58, 1.0, softMask);

    float glowAlpha = (blurA.a * 0.52 + blurB.a * 0.34 + blurC.a * 0.15)
        * sunsetBoost * 0.94 * pulse;
    glowAlpha = clamp(glowAlpha * mix(0.72, 1.0, softMask), 0.0, 0.56);
    glowRgb = min(glowRgb, vec3(0.82));

    float isolateBoost = mix(1.0, 1.08, step(0.5, u_debugIsolate));
    fragColor = vec4(glowRgb * isolateBoost, clamp(glowAlpha * isolateBoost, 0.0, 1.0));
}
