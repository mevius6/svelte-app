// ============================================================
// Water shading  ray-tracing, water/shore intersectiondomain 
// Depends on sky.glsl, math.glsl, shore.glsl, water_waves.glsl, title.glsl
// ============================================================

vec3 makeCameraRay(vec2 screenUV) {
    vec2 ndc = screenUV * 2.0 - 1.0;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);

    return normalize(
        u_cameraForward
      + u_cameraRight * ndc.x * aspect * u_cameraTanHalfFovY
      + u_cameraUp * ndc.y * u_cameraTanHalfFovY
    );
}

vec2 waterWorldToRippleUV(vec3 worldPos) {
    return (worldPos.xz - u_rippleWorldRect.xy) / u_rippleWorldRect.zw;
}

bool intersectWater(vec3 ro, vec3 rd, out float t, out vec3 pos) {
    if (rd.y >= -0.0001) {
        return false;
    }

    t = (u_waterLevel - ro.y) / rd.y;
    if (t <= 0.0) {
        return false;
    }

    pos = ro + rd * t;
    return true;
}

vec2 sceneUVFromScreen(vec2 screenUV) {
    // Height-normalized scene UV:
    // X follows aspect, Y matches screen UV, which keeps the horizon and water split stable.
    return (screenUV - 0.5) * u_sceneScale + 0.5;
}

vec2 sceneCoordFromUV(vec2 sceneUV) {
    return sceneUV * 2.0 - 1.0;
}
