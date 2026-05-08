// ============================================================
// Title  hero text rendering, billboarding, MSDF samplingdomain
// Depends on constants.glsl (TITLE_*)
// ============================================================

float sampleTitleTextureAlpha(vec2 uv) {
    float inBounds = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    vec2 texUv = u_titleTexRect.xy + clamp(uv, 0.0, 1.0) * u_titleTexRect.zw;
    float edge = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
    float edgeFade = smoothstep(0.0, 0.035, edge);
    float rawAlpha = texture(u_textTex, texUv).a * inBounds * edgeFade;
    return smoothstep(0.42, 0.82, rawAlpha);
}

float median3(vec3 sampleValue) {
    return max(min(sampleValue.r, sampleValue.g), min(max(sampleValue.r, sampleValue.g), sampleValue.b));
}

vec2 titlePhraseUvFromLocalMetric(vec2 localMetric) {
    return vec2(
        localMetric.x / max(u_titleLayoutSize.x, 0.001) + 0.5,
        localMetric.y / max(u_titleLayoutSize.y, 0.001) + 0.5
    );
}

float titlePhraseScreenPxRange(vec2 phraseUv) {
    vec2 unitRange = vec2(u_titleAtlasPxRange) / max(u_titlePhraseTexSize, vec2(1.0));
    vec2 screenTexSize = vec2(1.0) / max(fwidth(phraseUv), vec2(1e-5));
    return max(0.5 * dot(unitRange, screenTexSize), 1.0);
}

float sampleTitlePhraseAlpha(vec2 localMetric) {
    vec2 phraseUv = titlePhraseUvFromLocalMetric(localMetric);
    bool inBounds = all(greaterThanEqual(phraseUv, vec2(0.0))) &&
                    all(lessThanEqual(phraseUv, vec2(1.0)));
    if (!inBounds) {
        return 0.0;
    }
    vec3 msdf = texture(u_titlePhraseTex, phraseUv).rgb;
    float signedDistance = median3(msdf) - 0.5;
    // AI: reflection hit-test must not depend on fwidth(phraseUv):
    // grazing-angle derivatives are unstable and create comb-like early-out artifacts.
    const float REFL_MSDF_HIT_SOFT_RADIUS = 2.8;
    float screenDistance = signedDistance * REFL_MSDF_HIT_SOFT_RADIUS;
    float fillAlpha = clamp(screenDistance + 0.5, 0.0, 1.0);
    float glyphProximity = smoothstep(-0.38, 0.0, signedDistance);
    return fillAlpha * glyphProximity;
}

void sampleTitlePhraseReflectionCoverage(vec2 localMetric, out float fillAlpha, out float haloAlpha) {
    vec2 phraseUv = titlePhraseUvFromLocalMetric(localMetric);
    bool inBounds = all(greaterThanEqual(phraseUv, vec2(0.0))) &&
                    all(lessThanEqual(phraseUv, vec2(1.0)));
    if (!inBounds) {
        fillAlpha = 0.0;
        haloAlpha = 0.0;
        return;
    }
    vec3 msdf = texture(u_titlePhraseTex, phraseUv).rgb;
    float signedDistance = median3(msdf) - 0.5;

    // AI: in reflection contexts fwidth(phraseUv) is unstable:
    // at grazing angles phrase UV changes rapidly -> derivatives inflate
    // -> pxRange collapses -> MSDF turns into a hard step() -> comb-like aliasing.
    // Fixed soft radius gives stable smoothing without reflection artifacts.
    const float REFL_MSDF_SOFT_RADIUS = 2.8;
    float screenDistance = signedDistance * REFL_MSDF_SOFT_RADIUS;
    fillAlpha = clamp(screenDistance + 0.5, 0.0, 1.0);

    // AI: wider UV edge fade removes thin phrase-rect frame.
    float edgeUv = min(min(phraseUv.x, phraseUv.y), min(1.0 - phraseUv.x, 1.0 - phraseUv.y));
    float uvEdgeFade = smoothstep(0.025, 0.090, edgeUv);

    float contourBand = smoothstep(0.85, 0.06, abs(screenDistance));
    float interiorSuppress = 1.0 - smoothstep(0.20, 0.82, fillAlpha);

    // AI: glyphProximity suppresses halo in background space between letters
    // inside phrase-rect. Without it contourBand ~= 1.0 even where no glyph exists
    // -> rectangular glow field between symbols.
    float glyphProximity = smoothstep(-0.38, 0.0, signedDistance);
    haloAlpha = contourBand * interiorSuppress * uvEdgeFade * glyphProximity;
}

vec3 titleBillboardRight() {
    vec3 right = vec3(u_cameraRight.x, 0.0, u_cameraRight.z);
    float len = length(right);
    if (len <= 0.0001) {
        return vec3(1.0, 0.0, 0.0);
    }

    return right / len;
}

bool insideUnitSquare(vec2 uv) {
    return all(greaterThanEqual(uv, vec2(0.0))) &&
           all(lessThanEqual(uv, vec2(1.0)));
}

bool intersectTitleBillboard(
    vec3 rayOrigin,
    vec3 rayDir,
    out float t,
    out vec2 uv,
    out vec3 hitPos,
    out float alpha
) {
    vec3 titleRight = titleBillboardRight();
    vec3 titleUp = vec3(0.0, 1.0, 0.0);
    vec3 titleNormal = normalize(cross(titleRight, titleUp));
    float denom = dot(rayDir, titleNormal);

    if (abs(denom) <= 0.0001) {
        return false;
    }

    t = dot(u_titleWorldCenter - rayOrigin, titleNormal) / denom;
    if (t <= 0.0) {
        return false;
    }

    hitPos = rayOrigin + rayDir * t;
    vec3 local = hitPos - u_titleWorldCenter;
    uv = vec2(
        dot(local, titleRight) / max(u_titleWorldSize.x, 0.001) + 0.5,
        dot(local, titleUp) / max(u_titleWorldSize.y, 0.001) + 0.5
    );

    if (!insideUnitSquare(uv)) {
        return false;
    }

    alpha = sampleTitleTextureAlpha(uv);
    return alpha > 0.012;
}

vec2 titleLocalMetricFromHitPos(vec3 hitPos) {
    vec3 titleRight = titleBillboardRight();
    vec3 titleUp = vec3(0.0, 1.0, 0.0);
    vec3 local = hitPos - u_titleWorldCenter;
    return vec2(
        dot(local, titleRight) / max(u_titleWorldSize.x, 0.001) * u_titleLayoutSize.x,
        dot(local, titleUp) / max(u_titleWorldSize.y, 0.001) * u_titleLayoutSize.y
    );
}

bool intersectTitleAtlas(
    vec3 rayOrigin,
    vec3 rayDir,
    out float t,
    out vec3 hitPos,
    out float alpha
) {
    vec3 titleRight = titleBillboardRight();
    vec3 titleUp = vec3(0.0, 1.0, 0.0);
    vec3 titleNormal = normalize(cross(titleRight, titleUp));
    float denom = dot(rayDir, titleNormal);

    if (abs(denom) <= 0.0001) {
        return false;
    }

    t = dot(u_titleWorldCenter - rayOrigin, titleNormal) / denom;
    if (t <= 0.0) {
        return false;
    }

    hitPos = rayOrigin + rayDir * t;
    vec2 localMetric = titleLocalMetricFromHitPos(hitPos);

    alpha = sampleTitlePhraseAlpha(localMetric);
    return alpha > 0.001;
}

float titleAboveWaterAlpha(vec3 hitPos, float alpha) {
    float emergence = smoothstep(u_waterLevel - 0.010, u_waterLevel + 0.018, hitPos.y);
    return alpha * emergence;
}

vec3 titleHeroColor(vec3 rayDir, vec3 sunCol, vec3 sunDir) {
    // AI: keep direct title ink locked to target display hue (#c9f08a).
    return TITLE_DAYGLO_LINEAR;
}

vec3 compositeTitle(vec3 baseCol, vec3 titleCol, float alpha) {
    return mix(baseCol, titleCol, alpha * 0.96);
}

float titleReveal(float phase01) {
    // Phase 6: title appears at dusk (phase 0.78), fully visible by 0.94
    return smoothstep(0.78, 0.94, clamp(phase01, 0.0, 1.0));
}

float titleReflectionReveal(float phase01) {
    // Reflection emerges slightly after direct text (phase 0.82-0.98)
    return smoothstep(0.82, 0.98, clamp(phase01, 0.0, 1.0));
}
