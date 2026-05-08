// ============================================================
// Night cycle helpers — no dependencies
// Used widely: needed in sky, clouds, fog, shore
// Phase 6 semantics: 0.0=night, 0.2=dawn, 0.5=day, 0.8=dusk, 1.0=late-sunset
// ============================================================

float nightPhase(float phase01) {
    // Night is strong at phase=0, fades out by phase=0.12 (dawn begins)
    return smoothstep(0.12, 0.0, clamp(phase01, 0.0, 1.0));
}

float moonPhase(float phase01) {
    // Moon appears only in deep night (phase < 0.10), gateable for smooth appearance
    float gate = smoothstep(0.10, 0.0, clamp(phase01, 0.0, 1.0));
    return smoothstep(0.0, 1.0, gate);
}

vec3 applyNightGrade(vec3 color, float nightMask, vec3 tint) {
    // AI: compact night-grade helper to avoid sandy/warm carry-over after sunset.
    vec3 darkened = color * vec3(0.52, 0.56, 0.64);
    vec3 cooled = darkened + tint * 0.08;
    return mix(color, cooled, nightMask);
}
