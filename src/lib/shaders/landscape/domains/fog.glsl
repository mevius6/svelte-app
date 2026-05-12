// ============================================================
// Morning fog domain — analytic height fog
// Depends on constants.glsl (MORNING_FOG_*)
// Ref: https://forwardscattering.org/post/72
// Ref: https://iquilezles.org/articles/fog/
// ============================================================

float expSafe(float x) {
    return exp(clamp(x, -60.0, 60.0));
}

float morningFogDawnMask(float phase01) {
    return 1.0 - smoothstep(
        MORNING_FOG_DISSIPATE_START,
        MORNING_FOG_DISSIPATE_END,
        clamp(phase01, 0.0, 1.0)
    );
}

float expHeightFogOpticalDepth(
    float distance,
    float rayOriginHeight,
    float rayDirY,
    float density,
    float heightFalloff
) {
    float safeDistance = max(distance, 0.0);
    float safeFalloff = max(heightFalloff, 1e-4);
    float startExp = expSafe(-safeFalloff * rayOriginHeight);

    if (abs(rayDirY) <= 1e-4) {
        return max(density * startExp * safeDistance, 0.0);
    }

    float endHeight = rayOriginHeight + rayDirY * safeDistance;
    float endExp = expSafe(-safeFalloff * endHeight);
    float tau = density * (startExp - endExp) / (safeFalloff * rayDirY);
    return max(tau, 0.0);
}

vec3 morningFogColor(vec3 rayDir, float phase01, vec3 horizonCol, vec3 sunCol, vec3 sunDir) {
    float dayFade = smoothstep(0.0, 0.65, phase01);
    vec3 dawnFog = vec3(0.94, 0.88, 0.84);
    vec3 lateFog = vec3(0.88, 0.84, 0.82);
    vec3 baseFog = mix(dawnFog, lateFog, dayFade);
    float sunForward = pow(max(dot(rayDir, sunDir), 0.0), 10.0);
    vec3 sunFog = sunCol * 0.72 + vec3(0.22, 0.18, 0.16);
    vec3 fogCol = mix(baseFog, sunFog, sunForward * 0.24);
    return mix(fogCol, horizonCol, 0.28);
}

vec3 applyMorningHeightFog(
    vec3 sceneCol,
    vec3 rayOrigin,
    vec3 rayDir,
    float rayDistance,
    float phase01,
    vec3 horizonCol,
    vec3 sunCol,
    vec3 sunDir
) {
    float dawnMask = morningFogDawnMask(phase01);
    if (dawnMask <= 0.0001 || rayDistance <= 0.0) {
        return sceneCol;
    }

    float distanceClamped = min(max(rayDistance, 0.0), MORNING_FOG_SKY_DISTANCE);
    float rayOriginHeight = rayOrigin.y - u_waterLevel;
    float tau = expHeightFogOpticalDepth(
        distanceClamped,
        rayOriginHeight,
        rayDir.y,
        MORNING_FOG_DENSITY * dawnMask,
        MORNING_FOG_HEIGHT_FALLOFF
    );
    float transmittance = expSafe(-tau);
    vec3 fogCol = morningFogColor(rayDir, phase01, horizonCol, sunCol, sunDir);
    return sceneCol * transmittance + fogCol * (1.0 - transmittance);
}
