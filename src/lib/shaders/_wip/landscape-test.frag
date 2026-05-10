// Test shader for #include resolution
// This shader tests the Vite GLSL include plugin

#include "./landscape-chunks/sky.glsl"

precision highp float;

uniform float u_phase;

void main() {
  vec3 sunCol = sunColor(u_phase);
  vec3 sunDir = sunDirection(u_phase);

  gl_FragColor = vec4(sunCol, 1.0);
}
