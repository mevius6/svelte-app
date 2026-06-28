#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform sampler2D u_sourceTex;
uniform vec2 u_texelSize;
uniform vec2 u_direction;
uniform float u_radius;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
    vec2 stepVec = u_direction * u_texelSize * u_radius;

    // NOTE: separable 9-tap Gaussian approximation (Blur Philosophy / Bloom layering).
    vec4 sum = texture(u_sourceTex, uv) * 0.2270270270;
    sum += texture(u_sourceTex, uv + stepVec * 1.0) * 0.1945945946;
    sum += texture(u_sourceTex, uv - stepVec * 1.0) * 0.1945945946;
    sum += texture(u_sourceTex, uv + stepVec * 2.0) * 0.1216216216;
    sum += texture(u_sourceTex, uv - stepVec * 2.0) * 0.1216216216;
    sum += texture(u_sourceTex, uv + stepVec * 3.0) * 0.0540540541;
    sum += texture(u_sourceTex, uv - stepVec * 3.0) * 0.0540540541;
    sum += texture(u_sourceTex, uv + stepVec * 4.0) * 0.0162162162;
    sum += texture(u_sourceTex, uv - stepVec * 4.0) * 0.0162162162;
    fragColor = sum;
}
