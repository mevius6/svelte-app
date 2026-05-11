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

// MSDF phrase texture
uniform sampler2D u_titlePhraseTex;
uniform vec2      u_titlePhraseTexSize;
uniform float     u_titleAtlasPxRange;

// Scene state
uniform float u_phase;
uniform float u_waterLevel;

out vec4 fragColor;

// Phase 6 semantics: 0.0=night, 0.2=dawn, 0.5=day, 1.0=late-sunset.
// DayGlo NightGlo NG200 #c9f08a -> linear.
const vec3 LIME_LINEAR = vec3(0.584078418, 0.871367119, 0.254152094);
const vec3 AMBER_LINEAR = vec3(1.0, 0.552, 0.212);
const vec3 SKY_COOL = vec3(0.84, 0.96, 0.68);

float median3(vec3 v) {
    return max(min(v.r, v.g), min(max(v.r, v.g), v.b));
}

vec3 glowBillboardRight() {
    vec3 r = vec3(u_cameraRight.x, 0.0, u_cameraRight.z);
    float l = length(r);
    return l > 0.0001 ? r / l : vec3(1.0, 0.0, 0.0);
}

float titleReveal(float phase01) {
    // Phase 6: title appears at dusk (phase 0.78), fully visible by 0.94
    return smoothstep(0.78, 0.94, clamp(phase01, 0.0, 1.0));
}

float nightGlowReveal(float phase01) {
    // Phase 6: glow becomes visible in very late sunset (phase 0.94-1.0)
    return smoothstep(0.94, 1.0, clamp(phase01, 0.0, 1.0));
}

float titlePhraseScreenPxRange(vec2 phraseUv) {
    vec2 unitRange = vec2(u_titleAtlasPxRange) / max(u_titlePhraseTexSize, vec2(1.0));
    vec2 screenTexSize = vec2(1.0) / max(fwidth(phraseUv), vec2(1e-5));
    return max(0.5 * dot(unitRange, screenTexSize), 1.0);
}

void main() {
    vec2 screenUV = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
    vec2 ndc = screenUV * 2.0 - 1.0;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec3 rayDir = normalize(
        u_cameraForward
        + u_cameraRight * ndc.x * aspect * u_cameraTanHalfFovY
        + u_cameraUp    * ndc.y           * u_cameraTanHalfFovY
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

    vec3 hitPos = u_cameraPos + rayDir * t;
    vec3 local = hitPos - u_titleWorldCenter;
    float lx = dot(local, billboardRight) / max(u_titleWorldSize.x, 0.001);
    float ly = dot(local, billboardUp) / max(u_titleWorldSize.y, 0.001);

    const float GLOW_PAD = 0.16;
    if (abs(lx) > 0.5 + GLOW_PAD || abs(ly) > 0.5 + GLOW_PAD) {
        fragColor = vec4(0.0);
        return;
    }

    vec2 phraseUv = vec2(lx + 0.5, ly + 0.5);
    if (phraseUv.x < 0.0 || phraseUv.x > 1.0 || phraseUv.y < 0.0 || phraseUv.y > 1.0) {
        fragColor = vec4(0.0);
        return;
    }
    vec3 msdf = texture(u_titlePhraseTex, phraseUv).rgb;
    float signedDistance = median3(msdf) - 0.5;
    float pxRange = titlePhraseScreenPxRange(phraseUv);
    float sdPx = signedDistance * pxRange; // >0 inside, <0 outside
    float fill = clamp(sdPx + 0.5, 0.0, 1.0);

    float reveal = titleReveal(u_phase);  // nightGlowReveal now always returns 0 (stub)
    float emergence = smoothstep(u_waterLevel - 0.012, u_waterLevel + 0.034, hitPos.y);
    float mask = reveal * emergence;
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
    float nightT = 0.0;  // nightGlowReveal stub = 0, glow disabled
    vec3 coreCol = LIME_LINEAR;
    vec3 warmCol = mix(
        LIME_LINEAR * vec3(0.90, 0.96, 0.78),
        LIME_LINEAR * 0.46 + AMBER_LINEAR * 0.54,
        sunsetT
    );
    vec3 rimCol = mix(coreCol * 0.76, SKY_COOL * 0.78 + AMBER_LINEAR * 0.22, edge * 0.72);
    vec3 seedCol = mix(coreCol * 0.84, warmCol * 0.96, 0.34 + edge * 0.44) * 0.60 + rimCol * 0.40;
    seedCol = mix(seedCol, warmCol * 0.86 + AMBER_LINEAR * 0.14, nightT * 0.62);
    float coreSeed = pow(fill, 3.1) * mix(0.018, 0.026, nightT);
    float rimSeed = edgeBand * mix(0.32, 0.46, nightT);
    float outerSeed = outerBand * mix(0.16, 0.28, nightT);
    float seedAlpha = clamp((coreSeed + rimSeed + outerSeed) * nearGlyph * mask, 0.0, 0.42);
    fragColor = vec4(seedCol * seedAlpha, clamp(seedAlpha, 0.0, 1.0));
}
