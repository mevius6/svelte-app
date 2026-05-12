// ============================================================
// Water waves domain — procedural wave simulation
// Depends on constants.glsl (DIR_*, WAVE_LOD_*, RIPPLE_FADE_*, WAVENORMAL_EPS_*)
// ============================================================

float wave(vec2 p, vec2 dir, float freq, float speed, float t)
{ return sin(dot(p,dir)*freq+t*speed); }

float largeWaves(vec2 p,float t,float depthMask){
    return(wave(p,DIR_L1,1.2,0.25,t)*0.022+wave(p,DIR_L2,1.0,0.20,t)*0.016)*depthMask;}

float mediumWaves(vec2 p,float t,float depthMask){
    return(wave(p,DIR_M1,3.0,0.55,t)*0.040+wave(p,DIR_M2,3.8,0.50,t)*0.032+wave(p,DIR_M3,2.6,0.42,t)*0.025)*depthMask;}

float ripples(vec2 p,float t,float depthMask){
    return(wave(p,DIR_R1,10.0,1.10,t)*0.018+wave(p,DIR_R2,14.0,1.30,t)*0.015
          +wave(p,DIR_R3,18.0,1.60,t)*0.011+wave(p,DIR_R4,11.5,0.95,t)*0.013)*depthMask;}

// AI: Extract warp computation to avoid redundant sin() calls when sampling wave field multiple times.
vec2 computeWarp(vec2 p, float t) {
    return vec2(
        sin(p.x*0.7 + t*0.15)*0.12 + sin(p.y*0.5 + t*0.11)*0.08,
        sin(p.y*0.6 + t*0.13)*0.12 + sin(p.x*0.4 + t*0.09)*0.08
    );
}

// AI: waveFieldWithMasks expects pw (already warped position), not raw p.
// This allows warp computation to be amortized across multiple samples in waveNormal.
float waveFieldWithMasks(
    vec2 pw,
    float t,
    float largeMask,
    float mediumMask,
    float rippleMask
) {
    float baseWaves = largeWaves(pw, t, largeMask) + mediumWaves(pw, t, mediumMask);
    // AI: Phase D — skip high-frequency ripple trig when rippleMask is effectively zero in far field.
    if (rippleMask <= 0.0001) {
        return baseWaves;
    }
    return baseWaves + ripples(pw*1.8, t, rippleMask)*0.8;
}

vec3 waveNormal(
    vec2 p,
    float t,
    float largeMask,
    float mediumMask,
    float rippleMask,
    float viewDistance
) {
    // AI: Phase D — scale finite-difference step with distance to stabilize far-field normals
    // and reduce high-frequency normal jitter on the horizon.
    float distanceLod = smoothstep(WAVE_LOD_NEAR_DIST, WAVE_LOD_FAR_DIST, viewDistance);
    // AI: slightly widen finite-diff step in the far field to reduce tiny derivative noise.
    float eps = mix(WAVENORMAL_EPS_NEAR, WAVENORMAL_EPS_FAR, distanceLod);
    // AI: compute warp once and reuse for all four finite-difference samples.
    vec2 pw = p + computeWarp(p, t);
    // AI: reuse the same depth attenuation across the four finite-difference wave samples; depth is constant for this fragment.
    float waveXp = waveFieldWithMasks(pw + vec2(eps, 0.0), t, largeMask, mediumMask, rippleMask);
    float waveXn = waveFieldWithMasks(pw - vec2(eps, 0.0), t, largeMask, mediumMask, rippleMask);
    float waveYp = waveFieldWithMasks(pw + vec2(0.0, eps), t, largeMask, mediumMask, rippleMask);
    float waveYn = waveFieldWithMasks(pw - vec2(0.0, eps), t, largeMask, mediumMask, rippleMask);

    return normalize(vec3(
        -(waveXp - waveXn) * 5.0,
        1.0,
        -(waveYp - waveYn) * 5.0
    ));
}
