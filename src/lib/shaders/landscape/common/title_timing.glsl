// Requires constants.glsl (TITLE_REVEAL_START / TITLE_REVEAL_END).

float titleReveal(float phase01) {
    if (TITLE_REVEAL_END <= TITLE_REVEAL_START) {
        return 1.0;
    }
    return smoothstep(TITLE_REVEAL_START, TITLE_REVEAL_END, clamp(phase01, 0.0, 1.0));
}
