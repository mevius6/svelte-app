#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec4 a_localBounds;
layout(location = 2) in vec4 a_atlasRect;

uniform vec2  u_resolution;
uniform vec3  u_cameraPos;
uniform vec3  u_cameraRight;
uniform vec3  u_cameraUp;
uniform vec3  u_cameraForward;
uniform float u_cameraTanHalfFovY;
uniform vec3  u_titleWorldCenter;
uniform vec2  u_titleWorldSize;
uniform vec2  u_titleLayoutSize;

out vec2  v_uvAtlas;
out float v_worldY;
// NOTE: Phase 2 atmospheric perspective — camera-space depth for fragment distance fog.
// viewZ = dot(worldPos - cameraPos, cameraForward): positive forward, increases with depth.
out float v_viewDist;

vec3 titleBillboardRight() {
    vec3 right = vec3(u_cameraRight.x, 0.0, u_cameraRight.z);
    float len = length(right);
    if (len <= 0.0001) {
        return vec3(1.0, 0.0, 0.0);
    }

    return right / len;
}

void main() {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);

    // 1) Интерполируем local bounds по вершине квада
    vec2 localMetric = mix(a_localBounds.xy, a_localBounds.zw, a_position);

    // 2) Нормализуем в [0..1] по макету активной строки
    vec2 localNorm = vec2(
        localMetric.x / max(u_titleLayoutSize.x, 0.001),
        localMetric.y / max(u_titleLayoutSize.y, 0.001)
    );

    // 3) Центрируем вокруг (0,0): [-0.5..0.5]
    // vec2 centered = localNorm - 0.5;

    // 4) Билборд-ориентация
    vec3 titleRight = titleBillboardRight();
    vec3 titleUp = vec3(0.0, 1.0, 0.0);

    // 5) Мировые размеры УЖЕ правильно вычислены в CPU через textAspect
    // НЕ ПЕРЕВЫЧИСЛЯЙ через layoutAspect — используй как-есть!
    float worldWidth = u_titleWorldSize.x;
    float worldHeight = u_titleWorldSize.y;

    // 6) Масштабируем по X/Y
    vec3 worldPos = u_titleWorldCenter
                  + titleRight * (localNorm.x * worldWidth)
                  + titleUp * (localNorm.y * worldHeight);

    // считаем точку в мире, где висит текст.
    vec3 relative = worldPos - u_cameraPos;
    // переводим точку в пространство камеры: оси X/Y/Z уже относительно камеры.
    float viewX = dot(relative, u_cameraRight);
    float viewY = dot(relative, u_cameraUp);
    float viewZ = dot(relative, u_cameraForward);

    // перспективная проекция в NDC
    // «универсальные экранные координаты» до перевода в пиксели
    if (viewZ <= 0.0001) {
        gl_Position = vec4(2.0, 2.0, 1.0, 1.0);
    } else {
        vec2 ndc = vec2(
            viewX / (viewZ * u_cameraTanHalfFovY * aspect),
            viewY / (viewZ * u_cameraTanHalfFovY)
        );
        gl_Position = vec4(ndc, 0.0, 1.0);
    }
    // https://paroj.github.io/gltut/Positioning/Tut05%20Overlap%20and%20Depth%20Buffering.html
    // https://apoorvaj.io/ndc-clip

    v_uvAtlas  = a_atlasRect.xy + a_position * a_atlasRect.zw;
    v_worldY   = worldPos.y;
    v_viewDist = viewZ;
}
