#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform vec2      u_texelSize;

uniform vec2  u_dropPos;
uniform float u_dropRadius;
uniform float u_dropStrength;
uniform float u_dropActive;

out vec4 fragColor;

void main()
{
    vec2  uv   = gl_FragCoord.xy * u_texelSize;
    vec2  rg   = texture(u_state, uv).rg;
    float curr = rg.r;
    float prev = rg.g;

    float n = texture(u_state, uv + vec2(0.0,           u_texelSize.y)).r;
    float s = texture(u_state, uv - vec2(0.0,           u_texelSize.y)).r;
    float e = texture(u_state, uv + vec2(u_texelSize.x, 0.0          )).r;
    float w = texture(u_state, uv - vec2(u_texelSize.x, 0.0          )).r;

    // Точный дискретный wave solver (вместо упрощённого (n+s+e+w)*0.5 - prev):
    //   Laplacian = n + s + e + w - 4·curr   (конечно-разностная аппроксимация ∇²h)
    //   next = 2·curr - prev + c²·Laplacian
    // При c²=0.5 (Courant = 1/√2 < 1 → численно стабилен):
    //   next = curr + (curr - prev) + Laplacian * 0.5
    //
    // Разница с (n+s+e+w)*0.5 - prev:
    //   старая формула: (n+s+e+w)*0.5 - prev
    //                 = (Laplacian + 4·curr)*0.5 - prev
    //                 = 2·curr - prev + Laplacian*0.5 - 0  ← то же самое,
    // ...кроме того что curr там не вычитается явно из Laplacian.
    // Явная форма читаемее и согласована с литературой.
    // Ref: Tessendorf "Simulating Ocean Water" §2; Finch "Effective Water Simulation"
    float laplacian = n + s + e + w - 4.0 * curr;
    float next = curr + (curr - prev) + laplacian * 0.5;
    next *= 0.988; // damping: T½ ≈ 57 кадров при 60fps

    // Инжекция капли: smoothstep даёт гауссоподобный импульс давления
    float dropMask = step(0.5, u_dropActive);
    float dist     = length(uv - u_dropPos);
    next += smoothstep(u_dropRadius, 0.0, dist) * u_dropStrength * dropMask;

    // R = новое состояние (t+1), G = текущее (t) → станет prev на следующем кадре
    fragColor = vec4(next, curr, 0.0, 1.0);
}
