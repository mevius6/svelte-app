#version 300 es
precision highp float;

uniform sampler2D u_sceneColor;
uniform vec2 u_resolution;
uniform float u_useExactSrgb;

out vec4 fragColor;

vec3 linearToSrgbExact(vec3 linearCol) {
    vec3 safe = max(linearCol, vec3(0.0));
    vec3 low = safe * 12.92;
    vec3 high = 1.055 * pow(safe, vec3(1.0 / 2.4)) - 0.055;
    return mix(high, low, vec3(lessThanEqual(safe, vec3(0.0031308))));
}

vec3 linearToSrgbFast(vec3 linearCol) {
    return pow(max(linearCol, vec3(0.0)), vec3(1.0 / 2.2));
}

void main() {
    vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
    vec3 linearCol = texture(u_sceneColor, uv).rgb;

    vec3 displayCol = u_useExactSrgb > 0.5
        ? linearToSrgbExact(linearCol)
        : linearToSrgbFast(linearCol);

    fragColor = vec4(displayCol, 1.0);
}
