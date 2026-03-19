#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;      // локальные координаты карточки [-0.5..0.5]x[0..1]
layout(location = 1) in vec2 a_instancePos;   // позиция куста в UV (x∈[0..1], y≈horizon)
layout(location = 2) in vec2 a_instanceScale; // (widthUV, heightUV)
layout(location = 3) in vec4 a_atlasRect;     // atlas rect: (uMin, vMin, uSize, vSize)
layout(location = 4) in float a_cardIndex;    // 0,1,2,... номер карточки куста
layout(location = 5) in vec2 a_instanceRand;  // случайность [0..1]

uniform vec2  u_sceneScale;
uniform float u_horizon;
uniform float u_time;

out vec2 v_uvAtlas;
out float v_height;

void main() {
    // Height-normalized scene space: X expands/contracts with aspect, Y stays stable.
    vec2 frameScale = max(u_sceneScale, vec2(0.0001));

    // Базовая точка куста
    vec2 baseUV = vec2(a_instancePos.x, u_horizon);

    // Поворот карточки вокруг центра куста
    // каждая карточка получает свой угол (веер)
    float cardId = a_cardIndex;       // 0..N
    float cardCount = 3.0;            // три карточки на куст
    float baseAngle = (cardId - (cardCount - 1.0) * 0.5) * 0.35; // веер ± ~20°
    float jitter = (a_instanceRand.x - 0.5) * 0.15;
    float angle = baseAngle + jitter;

    float s = sin(angle);
    float c = cos(angle);

    // локальная позиция вершины в пространстве куста
    vec2 local = vec2(a_position.x, a_position.y);
    // масштаб по UV
    local.x *= a_instanceScale.x;
    local.y *= a_instanceScale.y;

    // вращаем только по XZ (на экране это даст перекрытие карточек)
    vec2 rotated = vec2(
        local.x * c,
        local.y
    );

    // лёгкий ветер: загибаем верх
    float h = clamp(a_position.y, 0.0, 1.0);
    float windPhase = a_instancePos.x * 7.0 + u_time * 1.4 + a_instanceRand.y * 6.2831;
    float sway = sin(windPhase) * 0.015 * h;
    rotated.x += sway;

    // финальные UV в scene space -> screen space
    vec2 sceneUV = baseUV + rotated;
    vec2 uv = (sceneUV - 0.5) / frameScale + 0.5;

    // перевод в NDC
    vec2 ndc = vec2(uv.x * 2.0 - 1.0,
                    uv.y * 2.0 - 1.0);

    gl_Position = vec4(ndc, 0.0, 1.0);

    // UV внутри атласа строятся из явного rect, выбранного на CPU для каждого куста.
    vec2 baseUVAtlas = vec2(a_position.x + 0.5, a_position.y); // [0..1]x[0..1]
    float atlasFlip = step(0.5, fract(a_instanceRand.x * 13.17 + a_instanceRand.y * 7.31));
    baseUVAtlas.x = mix(baseUVAtlas.x, 1.0 - baseUVAtlas.x, atlasFlip);
    v_uvAtlas = a_atlasRect.xy + baseUVAtlas * a_atlasRect.zw;

    v_height = h;
}
