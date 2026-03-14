#version 300 es
precision highp float;

in vec2  v_uvAtlas;
in float v_height;
in float v_type;

uniform sampler2D u_foliageAtlas;

out vec4 fragColor;

void main() {
    vec4 tex = texture(u_foliageAtlas, v_uvAtlas);
    if (tex.a < 0.05) discard;

    // лёгкая вертикальная градиентная коррекция: темнее у земли
    float shade = mix(0.70, 1.05, v_height);
    vec3 col = tex.rgb * shade;

    fragColor = vec4(col, tex.a);
}
