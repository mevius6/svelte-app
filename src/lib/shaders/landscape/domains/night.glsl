// ============================================================
// Night cycle — TEMPORALLY DISABLED (stub mode for Phase 6)
// To reactivate: uncomment NIGHT_IMPL_ARCHIVE below and swap function bodies.
// Real implementations preserved in comment.
// ============================================================

// STUB: night phase = 0, all night-dependent code becomes dead code
float nightPhase(float phase01) {
  return 0.0;
}

// STUB: moon phase = 0
float moonPhase(float phase01) {
  return 0.0;
}

// STUB: night grading = identity (color unchanged)
vec3 applyNightGrade(vec3 color, float nightMask, vec3 tint) {
  return color;
}

/* NIGHT_IMPL_ARCHIVE — uncomment to reactivate night rendering:

float nightPhase(float phase01) {
    return smoothstep(0.92, 1.0, clamp(phase01, 0.0, 1.0));
}

float moonPhase(float phase01) {
    float gate = smoothstep(0.945, 1.0, clamp(phase01, 0.0, 1.0));
    return smoothstep(0.0, 1.0, gate);
}

vec3 applyNightGrade(vec3 color, float nightMask, vec3 tint) {
    vec3 darkened = color * vec3(0.52, 0.56, 0.64);
    vec3 cooled   = darkened + tint * 0.08;
    return mix(color, cooled, nightMask);
}
*/
