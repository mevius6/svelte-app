#version 300 es
precision highp float;
precision highp int;

// Camera
uniform vec2  u_resolution;
uniform vec3  u_cameraPos;
uniform vec3  u_cameraRight;
uniform vec3  u_cameraUp;
uniform vec3  u_cameraForward;
uniform float u_cameraTanHalfFovY;

// Title billboard
uniform vec3  u_titleWorldCenter;
uniform vec2  u_titleWorldSize;
uniform vec2  u_titleLayoutSize;

// MSDF phrase texture
uniform sampler2D u_titlePhraseTex;
uniform vec2      u_titlePhraseTexSize;
uniform float     u_titleAtlasPxRange;
// Glow MSDF parameters
uniform float     u_glowStrokeOffset;
uniform float     u_glowSoftness;
uniform float     u_glowGamma;

// Scene state
uniform float u_phase;
uniform float u_waterLevel;

out vec4 fragColor;

#include "landscape/common/msdf_core.glsl"

// Scroll phase: 0.0=start, 0.2=dawn, 0.5=day, 1.0=late-sunset.
// DayGlo NG200 #c9f08a -> linear.
const vec3 LIME_LINEAR = vec3(0.584078418, 0.871367119, 0.254152094);
const vec3 AMBER_LINEAR = vec3(1.0, 0.552, 0.212);
const vec3 SKY_COOL = vec3(0.84, 0.96, 0.68);

float median3(vec3 v) {
    return msdfMedian(v.r, v.g, v.b);
}

vec3 glowBillboardRight() {
    vec3 r = vec3(u_cameraRight.x, 0.0, u_cameraRight.z);
    float l = length(r);
    return l > 0.0001 ? r / l : vec3(1.0, 0.0, 0.0);
}

// адаптированная версия из title.glsl
vec2 titlePhraseUvFromLocalMetric(vec2 localMetric) {
    return vec2(
        localMetric.x / max(u_titleLayoutSize.x, 0.001) + 0.5,
        localMetric.y / max(u_titleLayoutSize.y, 0.001) + 0.5
    );
}

vec2 titleLocalMetricFromHitPos(vec3 hitPos) {
    // 0) Локальные оси и вектор от центра титра
    vec3 titleRight = glowBillboardRight();
    vec3 titleUp = vec3(0.0, 1.0, 0.0);
    vec3 local = hitPos - u_titleWorldCenter;

    // 1) Aspect активного layout'а (фраза/цифры)
    float layoutAspect = u_titleLayoutSize.x / max(u_titleLayoutSize.y, 0.001);

    // 2) Мировая высота титра — как в hero-title.vert
    float worldHeight = u_titleWorldSize.y;

    // 3) Мировая ширина = высота * aspect (так же, как в hero-title.vert)
    float worldWidth = worldHeight * layoutAspect;

    // 4) Нормализуем local в [-0.5 .. 0.5] по world-рамке титра
    float nx = dot(local, titleRight) / max(worldWidth, 0.001);
    float ny = dot(local, titleUp)    / max(worldHeight, 0.001);

    // 5) Переводим в метрику layout'а через активный u_titleLayoutSize
    //    (nx, ny) ~ [-0.5..0.5], умножение даёт координаты в единицах layout'а
    return vec2(
        nx * u_titleLayoutSize.x,
        ny * u_titleLayoutSize.y
    );
}

float titlePhraseScreenPxRange(vec2 phraseUv) {
    return msdfScreenPxRange(u_titleAtlasPxRange, u_titlePhraseTexSize, phraseUv);
}

void main() {
    vec2 screenUV = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
    vec2 ndc = screenUV * 2.0 - 1.0;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec3 rayDir = normalize(
        u_cameraForward
        + u_cameraRight * ndc.x * aspect * u_cameraTanHalfFovY
        + u_cameraUp    * ndc.y          * u_cameraTanHalfFovY
    );

    vec3 billboardRight = glowBillboardRight();
    vec3 billboardUp = vec3(0.0, 1.0, 0.0);
    vec3 billboardNormal = normalize(cross(billboardRight, billboardUp));
    float denom = dot(rayDir, billboardNormal);
    if (abs(denom) <= 0.0001) {
        fragColor = vec4(0.0);
        return;
    }

    float t = dot(u_titleWorldCenter - u_cameraPos, billboardNormal) / denom;
    if (t <= 0.0) {
        fragColor = vec4(0.0);
        return;
    }

    // 1) Точка попадания луча в плоскость текста (в мире)
    vec3 hitPos = u_cameraPos + rayDir * t;

    // 2) Local metric в координатах макета текста —
    //    та же система, что использует hero-title/title.glsl
    //    (функция определена в title.glsl, который подключается в landscape/_entry.frag, но без прямого доступа к titleGlow.frag, поэтому дублируем её здесь)
    vec2 localMetric = titleLocalMetricFromHitPos(hitPos);

    // 3) UV внутри phraseTexture (0..1) через размер макета
    vec2 phraseUv = titlePhraseUvFromLocalMetric(localMetric);

    // 4) Клип по UV, чтобы свечение не выходило за рамки прямоугольника фразы
    bool inBounds = all(greaterThanEqual(phraseUv, vec2(0.0))) &&
                    all(lessThanEqual(phraseUv, vec2(1.0)));
    if (!inBounds) {
        fragColor = vec4(0.0);
        return;
    }

    // 5) MSDF-сэмпл и signed distance в той же системе, что и основная фраза в hero-title.frag, но с учётом активного u_titleLayoutSize
    float signedDistance = msdfSignedDistance(u_titlePhraseTex, phraseUv);
    float pxRange = titlePhraseScreenPxRange(phraseUv);
    float sdPx = signedDistance * pxRange; // >0 inside, <0 outside
    
    float fill = msdfCoverage(signedDistance, pxRange,
                              u_glowStrokeOffset,
                              u_glowSoftness,
                              u_glowGamma);

    float emergence = smoothstep(u_waterLevel - 0.012, u_waterLevel + 0.034, hitPos.y);
    float mask = emergence;
    if (mask <= 0.001) {
        fragColor = vec4(0.0);
        return;
    }

    // MSDF-space contour band and near-glyph gating:
    // this prevents bloom energy from appearing in empty phrase-rect background.
    float nearGlyph = smoothstep(-0.18, 0.02, signedDistance);
    float edgeBand = 1.0 - smoothstep(0.01, 0.16, abs(signedDistance));
    float outerBand = (1.0 - smoothstep(-0.34, -0.08, signedDistance)) * exp(min(sdPx, 0.0) * 0.85);
    float edge = clamp(edgeBand + outerBand * 0.5, 0.0, 1.0);
    float sunsetT = smoothstep(0.70, 1.0, u_phase);
    vec3 coreCol = LIME_LINEAR;
    vec3 warmCol = mix(
        LIME_LINEAR * vec3(0.90, 0.96, 0.78),
        LIME_LINEAR * 0.46 + AMBER_LINEAR * 0.54,
        sunsetT
    );
    vec3 rimCol = mix(
        coreCol * 0.76,
        SKY_COOL * 0.78 + AMBER_LINEAR * 0.22,
        edge * 0.72
    );
    vec3 seedCol = mix(
        coreCol * 0.84,
        warmCol * 0.96,
        0.34 + edge * 0.44
    ) * 0.60 + rimCol * 0.40;
    float coreSeed = pow(fill, 3.1) * 0.018;
    float rimSeed = edgeBand * 0.32;
    float outerSeed = outerBand * 0.16;
    float seedAlpha = clamp((coreSeed + rimSeed + outerSeed) * nearGlyph * mask, 0.0, 0.42);
    fragColor = vec4(seedCol * seedAlpha, clamp(seedAlpha, 0.0, 1.0));
}
