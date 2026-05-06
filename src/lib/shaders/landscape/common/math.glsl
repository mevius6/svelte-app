// ============================================================
// Math utilities — no uniforms, no dependencies
// ============================================================

float saturate(float v) {
    return clamp(v, 0.0, 1.0);
}

float smin(float a, float b, float k) {
    float safeK = max(k, 0.0001);
    float h = max(safeK - abs(a - b), 0.0) / safeK;
    return min(a, b) - h * h * safeK * 0.25;
}

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float aaCoverage(float signedDistance) {
    float width = max(fwidth(signedDistance), 0.0012);
    return smoothstep(-width, width, signedDistance);
}

float contactGapMask(float gap, float radius) {
    return 1.0 - smoothstep(0.0, radius, gap);
}

// Safe math wrappers to prevent NaN propagation
float safeSqrt(float x) {
    return sqrt(max(x, 0.0));
}

float safeAcos(float x) {
    return acos(clamp(x, -1.0, 1.0));
}
