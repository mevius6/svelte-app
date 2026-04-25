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
// AI: Phase 2 atmospheric perspective — camera-space depth for fragment distance fog.
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
    vec2 localMetric = mix(a_localBounds.xy, a_localBounds.zw, a_position);
    vec2 localNorm = vec2(
        localMetric.x / max(u_titleLayoutSize.x, 0.001),
        localMetric.y / max(u_titleLayoutSize.y, 0.001)
    );

    vec3 titleRight = titleBillboardRight();
    vec3 titleUp = vec3(0.0, 1.0, 0.0);
    vec3 worldPos = u_titleWorldCenter
                  + titleRight * (localNorm.x * u_titleWorldSize.x)
                  + titleUp * (localNorm.y * u_titleWorldSize.y);

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

    v_uvAtlas  = a_atlasRect.xy + a_position * a_atlasRect.zw;
    v_worldY   = worldPos.y;
    // AI: pass camera-forward depth to fragment for atmospheric perspective fade.
    // Current title anchor is near pond center (sceneCamera TITLE_WORLD_Z_NEAR=+0.35),
    // so atmospheric fade remains subtle while preserving crisp near-camera readability.
    v_viewDist = viewZ;
}
