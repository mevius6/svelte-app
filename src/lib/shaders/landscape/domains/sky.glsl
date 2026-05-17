// ============================================================
// Sky domain — depends on noise.glsl, constants.glsl
// Scroll phase: 0.0=start, 0.2=dawn, 0.5=day, 1.0=late-sunset.
// ============================================================

vec3 skyColor(float y, float phase01)
{
    vec3 top = vec3(0.08, 0.18, 0.45);
    vec3 bottomBase = mix(vec3(0.85,0.52,0.38), vec3(1.00,0.35,0.22),
                          smoothstep(0.65, 1.0, phase01));  // warm up toward sunset
    return mix(bottomBase, top, pow(clamp(y,0.0,1.0), 1.3));
}

vec3 tonemap(vec3 x)
{
    const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
    // AI: keep tone mapping in linear space; final display transfer happens in FinalColorPass.
    return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

vec3 sunColor(float phase01)
{
    vec3 duskCol = mix(vec3(1.0,0.7,0.45), vec3(1.0,0.55,0.25), phase01);
    return duskCol;
}

vec3 sunDirection(float phase01)
{
    // Phase 6: sun path during active day phase.
    // phase=0.15-0.5: dawn to noon, sun rises
    // phase=0.5-1.0: afternoon to dusk, sun sets
    float dayT = clamp((phase01 - 0.15) / 0.85, 0.0, 1.0);  // normalize day window
    float azimuth = mix(-0.78, 0.78, dayT);  // left to right
    float elevation = mix(0.08, 0.34, sin(dayT * PI));  // arc path
    return normalize(vec3(
        sin(azimuth) * cos(elevation),
        sin(elevation),
        -cos(azimuth) * cos(elevation)
    ));
}

vec2 skyUvFromDirection(vec3 dir) {
    float y = saturate(dir.y * 0.5 + 0.5);
    vec2 dome = dir.xz / max(dir.y + 0.38, 0.16);
    return vec2(dome.x * 0.18 + 0.5, y);
}

// AI: Phase B — cloudDetail=1.0 for direct sky, 0.0 for reflection (saves 3 vnoise/pix).
vec3 shadeSkyDirection(vec3 dir, float phase01, vec3 sunCol, vec3 sunDir, float cloudDetail) {
    vec2 skyUv = skyUvFromDirection(dir);
    float skyY = skyUv.y;
    vec3 sky = skyColor(skyY, phase01);

    float sunAmount = max(dot(dir, sunDir), 0.0);
    float sunCore = pow(sunAmount, 1024.0);
    float sunGlow = pow(sunAmount, 64.0);
    float sunWash = pow(sunAmount, 14.0);
    vec3 sunLight = sunCol * (sunCore * 4.0 + sunGlow * 0.85 + sunWash * 0.22);

    float cloudBase;
    float density = cloudDensity(skyUv, u_time, phase01, cloudBase, cloudDetail);
    float cloudBaseLight = smoothstep(0.52, 0.58, cloudBase);
    float sunLitCloud = sunWash * 0.15;
    vec3 warmCloudLight = sunCol * 1.3 + vec3(0.25);
    vec3 cloudLight = mix(vec3(1.0, 1.0, 1.05), warmCloudLight, sunWash);
    cloudLight *= mix(0.72, 1.0, cloudBaseLight);

    return mix(
        sky + sunLight,
        cloudLight + sunLight * sunLitCloud,
        density
    );
}
