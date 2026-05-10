// Constants (no uniforms, no functions)

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// Title display reference: DayGlo NightGlo NG200 (#c9f08a sRGB 201,240,138) -> linear
const vec3 TITLE_DAYGLO_LINEAR = vec3(0.584078418, 0.871367119, 0.254152094);
const vec3 TITLE_GLOW_AMBER_LINEAR = vec3(0.86, 0.50, 0.20);
const vec3 MOONLIGHT_LINEAR = vec3(0.58, 0.66, 0.92);

// Morning fog parameters
const float MORNING_FOG_DISSIPATE_START = 0.38;
const float MORNING_FOG_DISSIPATE_END = 0.58;
const float MORNING_FOG_DENSITY = 0.10;
const float MORNING_FOG_HEIGHT_FALLOFF = 3.6;
const float MORNING_FOG_SKY_DISTANCE = 12.0;
