#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;      // локальные координаты карточки [-0.5..0.5]x[0..1]
layout(location = 1) in vec3 a_instanceRoot;  // world-space root position on the shoreline bank
layout(location = 2) in vec2 a_instanceScale; // world-space (width, height)
layout(location = 3) in vec4 a_atlasRect;     // atlas rect: (uMin, vMin, uSize, vSize)
layout(location = 4) in float a_cardIndex;    // 0,1,2,... номер карточки куста
layout(location = 5) in vec2 a_instanceRand;  // случайность [0..1]

uniform vec2  u_resolution;
uniform vec3  u_cameraPos;
uniform vec3  u_cameraRight;
uniform vec3  u_cameraUp;
uniform vec3  u_cameraForward;
uniform float u_cameraTanHalfFovY;
uniform float u_time;

out vec2 v_uvAtlas;
out float v_height;

void main() {
    const vec3 worldUp = vec3(0.0, 1.0, 0.0);
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);

    // AI: Phase 1.6 anchors shoreline cards in world space first, then projects them through the same camera basis as LandscapePass to remove horizon-locked overlay drift.
    vec3 root = a_instanceRoot;
    vec3 toCameraFlat = vec3(u_cameraPos.x - root.x, 0.0, u_cameraPos.z - root.z);
    float toCameraLen = length(toCameraFlat);
    vec3 facing = toCameraLen > 1e-5
        ? toCameraFlat / toCameraLen
        : normalize(vec3(u_cameraForward.x, 0.0, u_cameraForward.z));
    vec3 baseRight = normalize(vec3(facing.z, 0.0, -facing.x));

    float cardCount = 3.0;
    float baseAngle = (a_cardIndex - (cardCount - 1.0) * 0.5) * 0.35;
    float jitter = (a_instanceRand.x - 0.5) * 0.15;
    float angle = baseAngle + jitter;
    float s = sin(angle);
    float c = cos(angle);
    vec3 rotatedRight = normalize(baseRight * c + facing * s);

    vec2 local = vec2(a_position.x * a_instanceScale.x, a_position.y * a_instanceScale.y);
    float h = clamp(a_position.y, 0.0, 1.0);
    float windPhase = root.x * 2.7 + root.z * 8.0 + u_time * 1.4 + a_instanceRand.y * 6.2831;
    float sway = sin(windPhase) * 0.010 * h;

    vec3 worldPos = root
                  + rotatedRight * (local.x + sway)
                  + worldUp * local.y;

    vec3 relative = worldPos - u_cameraPos;
    float viewX = dot(relative, u_cameraRight);
    float viewY = dot(relative, u_cameraUp);
    float viewZ = dot(relative, u_cameraForward);

    if (viewZ <= 0.0001) {
        gl_Position = vec4(2.0, 2.0, 1.0, 1.0);
    } else {
        vec2 ndc = vec2(
            viewX / (viewZ * u_cameraTanHalfFovY * aspect),
            viewY / (viewZ * u_cameraTanHalfFovY)
        );
        gl_Position = vec4(ndc, 0.0, 1.0);
    }

    // UV внутри атласа строятся из явного rect, выбранного на CPU для каждого куста.
    vec2 baseUVAtlas = vec2(a_position.x + 0.5, a_position.y); // [0..1]x[0..1]
    float atlasFlip = step(0.5, fract(a_instanceRand.x * 13.17 + a_instanceRand.y * 7.31));
    baseUVAtlas.x = mix(baseUVAtlas.x, 1.0 - baseUVAtlas.x, atlasFlip);
    v_uvAtlas = a_atlasRect.xy + baseUVAtlas * a_atlasRect.zw;

    v_height = h;
}
