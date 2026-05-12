// ============================================================
// Shore domain — beach/bank sculpting and material shading
// Depends on math.glsl, night.glsl, constants.glsl
// ============================================================

float baselineSilhouette(float x) {
    // AI: Phase A — 2×5-octave shoreFbm (10 vnoise calls) → 1 texture fetch.
    // x is [0..1] normalised worldX → direct UV.  R channel: [~0.518..0.586].
    return texture(u_shoreProfileTex, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
}

float vegetationProfile(float x) {
    return baselineSilhouette(x);
}

float shorelineHeightAt(float worldX) {
    float x01 = clamp(worldX * 0.16 + 0.5, 0.0, 1.0);
    return u_waterLevel + max((baselineSilhouette(x01) - 0.513) * 1.45, 0.0);
}

float shorelineWaterEdgeZ() {
    return u_shorePlaneZ + SHORE_BANK_TOE_OFFSET;
}

float underwaterShelfHeightAt(float worldX, float worldZ) {
    float shelfDistance = max(worldZ - shorelineWaterEdgeZ(), 0.0);
    float shelfT = smoothstep(0.0, 0.78, shelfDistance);
    // AI: Phase A — B channel; raw [0..~0.94], offset -0.5 applied here as original.
    float shelfNoise = (texture(u_shoreProfileTex,
        vec2(clamp(worldX * 0.16 + 0.5, 0.0, 1.0), 0.5)).b - 0.5) * 0.006 * (1.0 - shelfT);
    return min(u_waterLevel - 0.006, u_waterLevel - mix(0.014, 0.072, shelfT) + shelfNoise);
}

float shorelineTransitionSdf(vec2 p) {
    // AI: keep shoreline polishing local — use a tiny SDF union for the wet bank lip + shallow shelf instead of turning the whole pond into an SDF scene.
    float shallowShelf = sdBox(p - vec2(0.11, -0.022), vec2(0.14, 0.026));
    float wetLip = sdBox(p - vec2(-0.004, 0.012), vec2(0.040, 0.016));
    return smin(shallowShelf, wetLip, 0.045);
}

float shorelineTransitionMask(vec2 p, float radius) {
    return 1.0 - smoothstep(0.0, radius, shorelineTransitionSdf(p));
}

float shorelineBankSurfaceYAt(float worldX, float worldZ) {
    float crestY = shorelineHeightAt(worldX);
    float yBase = u_waterLevel + SHORE_BANK_FOOT_OFFSET_Y;
    float zToe = shorelineWaterEdgeZ();
    float zCrest = u_shorePlaneZ - SHORE_BANK_CREST_SETBACK;
    float slopeT = saturate((zToe - worldZ) / max(zToe - zCrest, 0.001));
    return mix(yBase, crestY, slopeT);
}

vec3 bankMaterialBase(float worldX, float hNorm, float phase) {
    // AI: Phase A — G channel of shore profile texture (same UV mapping as R).
    float bankNoise = texture(u_shoreProfileTex,
        vec2(clamp(worldX * 0.16 + 0.5, 0.0, 1.0), 0.5)).g;
    float crestMask = smoothstep(0.58, 0.94, hNorm);
    vec3 bankShadow = mix(vec3(0.060, 0.050, 0.052), vec3(0.070, 0.048, 0.046), phase);
    vec3 bankLight = mix(vec3(0.122, 0.112, 0.092), vec3(0.140, 0.104, 0.070), phase);
    vec3 bankGrass = mix(vec3(0.090, 0.102, 0.070), vec3(0.112, 0.096, 0.062), phase);
    vec3 col = mix(bankShadow, bankLight, pow(hNorm, 0.72));
    col *= mix(0.94, 1.06, bankNoise);
    col = mix(col, bankGrass, crestMask * (0.28 + bankNoise * 0.18));
    float night = nightPhase(phase);
    return applyNightGrade(col, night, vec3(0.05, 0.08, 0.14));
}

bool intersectShore(vec3 ro, vec3 rd, out float t, out vec3 pos, out float height) {
    if (abs(rd.z) <= 0.0001) {
        return false;
    }

    float tProbe = (u_shorePlaneZ - ro.z) / rd.z;
    if (tProbe <= 0.0) {
        return false;
    }

    float yBase = u_waterLevel + SHORE_BANK_FOOT_OFFSET_Y;
    float zToe = shorelineWaterEdgeZ();
    float zCrest = u_shorePlaneZ - SHORE_BANK_CREST_SETBACK;
    float sampleX = ro.x + rd.x * tProbe;
    height = shorelineHeightAt(sampleX);

    // AI: solve against a shallow embankment profile rather than a vertical wall, so the opposite bank lands in the pond with a narrower, more natural band.
    for (int i = 0; i < 2; i++) {
        float slope = (zCrest - zToe) / max(height - yBase, 0.012);
        float denom = rd.z - rd.y * slope;
        if (abs(denom) <= 0.0001) {
            return false;
        }

        float rhs = zToe - ro.z + (ro.y - yBase) * slope;
        t = rhs / denom;
        if (t <= 0.0) {
            return false;
        }

        sampleX = ro.x + rd.x * t;
        height = shorelineHeightAt(sampleX);
    }

    pos = ro + rd * t;
    return pos.y >= yBase && pos.y <= height + 0.008;
}
