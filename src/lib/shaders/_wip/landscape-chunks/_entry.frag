#version 300 es
precision highp float;
precision highp int;

// ====================================================================
//  Phase 5 centralized entry pointUNIFORMS 
// ====================================================================

// Camera & viewport
uniform vec2  u_resolution;
uniform vec2  u_sceneScale;
uniform float u_cameraTanHalfFovY;
uniform vec3  u_cameraPos;
uniform vec3  u_cameraRight;
uniform vec3  u_cameraUp;
uniform vec3  u_cameraForward;

// Time & animation
uniform float u_time;
uniform float u_scroll;

// Title resources
uniform sampler2D u_textTex;
uniform float     u_useTitleBillboard;
uniform float     u_useTitlePhraseReflection;
uniform sampler2D u_titlePhraseTex;
uniform vec2      u_titlePhraseTexSize;
uniform float     u_titleAtlasPxRange;
uniform vec2      u_titleLayoutSize;
uniform vec3      u_titleWorldCenter;
uniform vec2      u_titleWorldSize;
uniform vec4      u_titleTexRect;

// Water & terrain
uniform sampler2D u_rippleTex;
uniform float     u_rippleTexel;
uniform sampler2D u_shoreProfileTex;
uniform vec4      u_rippleWorldRect;
uniform float     u_waterLevel;
uniform float     u_shorePlaneZ;

// ====================================================================
// Common constants (no uniforms)
// ====================================================================

#include "./constants.glsl"
#include "./math.glsl"
#include "./noise.glsl"

// ====================================================================
// Domain functions (use uniforms but don't declare them)
// ====================================================================

#include "./domains/night.glsl"
#include "./domains/sky.glsl"
#include "./domains/water_waves.glsl"
#include "./domains/fog.glsl"
#include "./domains/landscape.glsl"

// ====================================================================
// Main orchestration
// ====================================================================

#include "./main/landscape_main.glsl"
