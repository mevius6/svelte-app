#version 300 es
precision highp float;
precision highp int;

// ====================================================================
//  Phase 5 centralized entry pointUNIFORMS
// All uniforms declared here ONLY. No uniforms in chunks.
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
// Title MSDF parameters
uniform float     u_titleStrokeOffset;
uniform float     u_titleStrokeSoftness;
uniform float     u_titleEdgeGamma;

// Water & terrain
uniform sampler2D u_rippleTex;
uniform float     u_rippleTexel;
uniform sampler2D u_shoreProfileTex;
uniform vec4      u_rippleWorldRect;
uniform float     u_waterLevel;
uniform float     u_shorePlaneZ;

out vec4 fragColor;

// ====================================================================
//  no uniforms, no function dependenciesCommon
// ====================================================================

#include "./common/constants.glsl"
#include "./common/math.glsl"
#include "./common/noise.glsl"

// ====================================================================
//  functions only, use uniforms declared aboveDomains
// Order matters: domains in dependency order.
// ====================================================================

// cloudDensity must be declared before shadeSkyDirection calls it.
#include "./domains/clouds.glsl"
#include "./domains/sky.glsl"
#include "./domains/fog.glsl"
#include "./domains/shore.glsl"
#include "./domains/water_waves.glsl"
#include "./domains/title.glsl"
#include "./domains/water_shade.glsl"

// ====================================================================
// Debug views (optional, ifdef-guarded)
// ====================================================================

#include "./debug/debug_views.glsl"

// ====================================================================
// Main orchestration
// ====================================================================

#include "./main/landscape_main.glsl"
