// ============================================================
// Global constants — no uniforms, no function dependencies
// ============================================================

#define PI 3.14159265359

// Title colors (pre-converted to linear space for composition)
const vec3 TITLE_DAYGLO_LINEAR = vec3(0.584078418, 0.871367119, 0.254152094);

// Direct title + water reflection reveal (scroll phase 0..1).
// Default: END <= START → fully visible from first scroll pixel (section 1).
// Late-sunset only: set e.g. START=0.78, END=0.94.
// Keep in sync with TITLE_REVEAL_* in src/lib/scene/sceneCamera.ts.
const float TITLE_REVEAL_START = 0.0;
const float TITLE_REVEAL_END = 0.0;

// Water title reflection composite (linear space, before tonemap).
const float TITLE_REFLECTION_FILL_BILLBOARD = 0.52;
const float TITLE_REFLECTION_FILL_PHRASE = 0.46;
const float TITLE_REFLECTION_LIME_WEIGHT = 0.72;
const float TITLE_REFLECTION_SKY_BLEND = 0.12;
const float TITLE_REFLECTION_DIST_ATTEN = 0.20;
const float TITLE_REFLECTION_RIPPLE_SUPPRESS = 0.20;

// Wave domain directions (grid sampling for large/medium waves)
const vec2 DIR_L1=vec2( 0.9806, 0.1961), DIR_L2=vec2(-0.5735, 0.8192);
const vec2 DIR_M1=vec2( 0.5145, 0.8575), DIR_M2=vec2(-0.9285, 0.3714), DIR_M3=vec2( 0.5300,-0.8480);
const vec2 DIR_R1=vec2( 0.8000, 0.6000), DIR_R2=vec2(-0.2873, 0.9578), DIR_R3=vec2( 0.1961,-0.9806), DIR_R4=vec2(-0.9479, 0.3159);

// Wave LOD tuning (distance-based detail reduction)
const float WAVE_LOD_NEAR_DIST = 7.0;
const float WAVE_LOD_FAR_DIST = 26.0;

// Ripple fade (ripple texture contribution fades with distance)
const float RIPPLE_FADE_START = 0.58;
const float RIPPLE_FADE_END = 0.82;

// Wave normal epsilon (finite difference step sizes for normal extraction)
const float WAVENORMAL_EPS_NEAR = 0.0018;
const float WAVENORMAL_EPS_FAR = 0.0032;

// Shore profile (sculpting the beach silhouette)
const float SHORE_BANK_TOE_OFFSET = 0.028;
const float SHORE_BANK_CREST_SETBACK = 0.020;
const float SHORE_BANK_FOOT_OFFSET_Y = 0.0;
