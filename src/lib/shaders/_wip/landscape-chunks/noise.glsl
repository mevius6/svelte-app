// Noise functions (no uniforms)
// Placeholder for Phase  will extract Perlin/simplex from landscape.frag5 

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float noise1d(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), u);
}
