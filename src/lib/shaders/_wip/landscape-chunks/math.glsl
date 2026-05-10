// Math utilities (no uniforms)

float smootherStep(float t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float expSafe(float x) {
  return exp(clamp(x, -60.0, 60.0));
}

vec3 tonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  // Keep tonemapping in linear space; final display transfer in FinalColorPass
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
