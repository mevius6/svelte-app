// ============================================================
// Clouds domain — depends on noise.glsl
// ============================================================

// AI: Phase A+B cloudDensity:
//   detailLOD=1.0 for direct sky, 0.0 for water reflection (saves 3 vnoise/pix).
//   solarDrift: clouds follow sun across day — phase01*0.42 ≈ 1/8 tile per cycle.
// Ref: Book of Shaders ch.13 fBM, IQ "Outdoors Lighting"
float cloudDensity(vec2 uv, float t, float phase01, out float base, float detailLOD) {
    vec2 solarDrift = vec2(phase01 * 0.42, phase01 * 0.06);
    vec2 wind = vec2(t * 0.012, t * 0.004) + solarDrift;
    vec2 baseUv = uv * vec2(3.2, 5.5) + wind;
    base = cloudBaseFbm(baseUv);
    float cloud = base + cloudDetailFbm(uv * vec2(6.5, 9.0) + wind * 1.4) * 0.38 * detailLOD;
    float phaseFade    = 1.0 - min(phase01 * 1.4, 1.0) * 0.5;
    float verticalFade = smoothstep(1.0, 0.52, uv.y);
    return cloud * verticalFade * phaseFade * 0.55;
}
