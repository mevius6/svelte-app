// ============================================================
// Night cycle helpers — no dependencies
// Used widely: needed in sky, clouds, fog, shore
// ============================================================

float nightPhase(float phase01) {
    // AI: keep late-sunset palette intact; enter night only in the final scroll tail.
    return smoothstep(0.92, 1.0, clamp(phase01, 0.0, 1.0));
}

float moonPhase(float phase01) {
    // AI: moon appears a touch later than generic night grade and ramps more gently.
    float gate = smoothstep(0.945, 1.0, clamp(phase01, 0.0, 1.0));
    return smoothstep(0.0, 1.0, gate);
}

vec3 applyNightGrade(vec3 color, float nightMask, vec3 tint) {
    // AI: compact night-grade helper to avoid sandy/warm carry-over after sunset.
    vec3 darkened = color * vec3(0.52, 0.56, 0.64);
    vec3 cooled = darkened + tint * 0.08;
    return mix(color, cooled, nightMask);
}
