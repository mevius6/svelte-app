// ============================================================
// Clouds domain — depends on noise.glsl
// Phase 6 semantics: 0.0=night, 0.2=dawn, 0.5=day, 1.0=late-sunset.
// ============================================================

// AI: Phase A+B cloudDensity:
//   detailLOD=1.0 for direct sky, 0.0 for water reflection (saves 3 vnoise/pix).
//   solarDrift: clouds follow sun across day — phase01*0.42 ≈ 1/8 tile per cycle.
//   Phase 6: phaseFade — more clouds day/dusk, less clouds night/dawn
// Ref: Book of Shaders ch.13 fBM, IQ "Outdoors Lighting"
float cloudDensity(vec2 uv, float t, float phase01, out float base, float detailLOD) {
    vec2 solarDrift = vec2(phase01 * 0.42, phase01 * 0.06);
    vec2 wind = vec2(t * 0.012, t * 0.004) + solarDrift;
    vec2 baseUv = uv * vec2(3.2, 5.5) + wind;
    base = cloudBaseFbm(baseUv);
    float cloud = base + cloudDetailFbm(uv * vec2(6.5, 9.0) + wind * 1.4) * 0.38 * detailLOD;
    // Phase 6: cloud density: low at night/dawn (0.15), high at day/dusk (1.0), slightly less at very end
    float phaseFade = smoothstep(0.05, 0.60, phase01)
        * mix(1.0, 0.72, smoothstep(0.80, 1.0, phase01));
    float verticalFade = smoothstep(1.0, 0.52, uv.y);
    return cloud * verticalFade * phaseFade * 0.55;
}
