// Sky and sun functions

#include "./math.glsl"

float nightPhase(float phase01) {
  return smoothstep(0.3, 0.5, phase01) - smoothstep(0.5, 0.7, phase01);
}

vec3 sunColor(float phase01) {
  float night = nightPhase(phase01);
  vec3 duskCol = mix(vec3(1.0, 0.7, 0.45), vec3(1.0, 0.55, 0.25), phase01);
  return mix(duskCol, vec3(0.16, 0.17, 0.24), night);
}

vec3 sunDirection(float phase01) {
  float azimuth = mix(-0.78, 0.78, phase01);
  float night = nightPhase(phase01);
  float elevation = mix(0.08, 0.34, sin(phase01 * PI));
  elevation = mix(elevation, -0.10, night);
  return normalize(vec3(
    sin(azimuth) * cos(elevation),
    sin(elevation),
    -cos(azimuth) * cos(elevation)
  ));
}
