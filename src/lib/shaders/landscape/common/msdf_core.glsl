// Берём медиану из трёх каналов (классический MSDF)
float msdfMedian(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

// Преобразование RGB MSDF в signed distance
float msdfSignedDistance(sampler2D tex, vec2 uv) {
    vec3 sd = texture(tex, uv).rgb;
    float m = msdfMedian(sd.r, sd.g, sd.b);
    // Если твой генератор использует другой диапазон, эту нормализацию можно подстроить.
    return m * 2.0 - 1.0;
}

// Экранный pxRange (аналог твоего titlePhraseScreenPxRange)
float msdfScreenPxRange(float atlasPxRange, vec2 atlasTexSize, vec2 uv) {
    vec2 unitRange     = vec2(atlasPxRange) / max(atlasTexSize, vec2(1.0));
    vec2 screenTexSize = vec2(1.0) / max(fwidth(uv), vec2(1e-5));
    float pxRange      = 0.5 * dot(unitRange, screenTexSize);
    return max(pxRange, 1.0);
}

// Coverage с параметрами толщины/softness/gamma
float msdfCoverage(float signedDistance,
                   float pxRange,
                   float strokeOffset,
                   float softness,
                   float gamma) {
    float dist = signedDistance + strokeOffset;
    float w    = pxRange * softness;

    float alpha = smoothstep(-w, w, dist);
    alpha = pow(alpha, max(gamma, 1e-3)); // защита от нуля

    return alpha;
}
