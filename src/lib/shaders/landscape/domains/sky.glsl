// ============================================================
// Sky domain — depends on night.glsl, noise.glsl, constants.glsl
// Phase 6 semantics: 0.0=night, 0.2=dawn, 0.5=day, 1.0=late-sunset.
// ============================================================

vec3 skyColor(float y, float phase01)
{
    float night = nightPhase(phase01);
    // Phase 6: day-sky at top is blue, fades to deep night blue
    // Bottom: warm day horizon, dims toward black at night
    vec3 topBase = mix(vec3(0.08,0.18,0.45), vec3(0.02,0.02,0.08), night);
    // Warm horizon in day, fades through dusk, goes deep at night
    vec3 bottomBase = mix(vec3(0.85,0.52,0.38), vec3(1.00,0.35,0.22),
                          smoothstep(0.65, 1.0, phase01));  // warm up toward sunset
    vec3 top = mix(topBase, vec3(0.010, 0.016, 0.040), night);
    vec3 bottom = mix(bottomBase, vec3(0.020, 0.022, 0.050), night);
    return mix(bottom, top, pow(clamp(y,0.0,1.0), 1.3));
}

vec3 tonemap(vec3 x)
{
    const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
    // AI: keep tone mapping in linear space; final display transfer happens in FinalColorPass.
    return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

vec3 sunColor(float phase01)
{
    float night = nightPhase(phase01);
    vec3 duskCol = mix(vec3(1.0,0.7,0.45), vec3(1.0,0.55,0.25), phase01);
    return mix(duskCol, vec3(0.16, 0.17, 0.24), night);
}

vec3 sunDirection(float phase01)
{
    // Phase 6: sun path during day phase (0.15 - 1.0)
    // phase=0-0.15: night, sun below horizon
    // phase=0.15-0.5: dawn to noon, sun rises
    // phase=0.5-1.0: afternoon to dusk, sun sets
    float dayT = clamp((phase01 - 0.15) / 0.85, 0.0, 1.0);  // normalize day window
    float azimuth = mix(-0.78, 0.78, dayT);  // left to right
    float night = nightPhase(phase01);
    float elevation = mix(0.08, 0.34, sin(dayT * PI));  // arc path
    elevation = mix(elevation, -0.12, night);  // below horizon at night
    return normalize(vec3(
        sin(azimuth) * cos(elevation),
        sin(elevation),
        -cos(azimuth) * cos(elevation)
    ));
}

vec3 moonDirection(float phase01) {
    // AI: night companion light direction for water specular track.
    // Keep moon closer to view-forward so it is readable in the current camera framing.
    float azimuth = mix(0.24, -0.10, clamp(phase01, 0.0, 1.0));
    float elevation = mix(0.22, 0.34, nightPhase(phase01));
    return normalize(vec3(
        sin(azimuth) * cos(elevation),
        sin(elevation),
        -cos(azimuth) * cos(elevation)
    ));
}

vec3 moonColor(float phase01) {
    float moonMask = moonPhase(phase01);
    // AI: cooler dusk moon -> cleaner moonlight tint in full-night tail.
    return mix(vec3(0.48, 0.57, 0.82), vec3(0.66, 0.74, 0.98), moonMask);
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
    float night = nightPhase(phase01);
    float moonMask = moonPhase(phase01);

    float sunAmount = max(dot(dir, sunDir), 0.0);
    float sunCore = pow(sunAmount, 1024.0);
    float sunGlow = pow(sunAmount, 64.0);
    float sunWash = pow(sunAmount, 14.0);
    vec3 sunLight = sunCol * (sunCore * 4.0 + sunGlow * 0.85 + sunWash * 0.22);

    vec3 moonDir = moonDirection(phase01);
    vec3 moonCol = moonColor(phase01);
    float moonAmount = max(dot(dir, moonDir), 0.0);
    float moonAA = max(fwidth(moonAmount), 1e-5);
    // AI: explicit moon disk + halo so night sky reads as intentional, not just darkened sunset.
    float moonDisk = smoothstep(0.99860 - moonAA * 2.2, 0.99860 + moonAA * 2.2, moonAmount);
    float moonHalo = pow(moonAmount, 48.0);
    float moonAura = pow(moonAmount, 8.0);
    vec3 moonLight = moonCol * (moonDisk * 1.60 + moonHalo * 0.55 + moonAura * 0.14) * moonMask;

    float cloudBase;
    float density = cloudDensity(skyUv, u_time, phase01, cloudBase, cloudDetail);
    float cloudBaseLight = smoothstep(0.52, 0.58, cloudBase);
    float sunLitCloud = sunWash * 0.15;
    vec3 warmCloudLight = sunCol * 1.3 + vec3(0.25);
    vec3 cloudLight = mix(vec3(1.0, 1.0, 1.05), warmCloudLight, sunWash);
    cloudLight *= mix(0.72, 1.0, cloudBaseLight);
    float moonClear = smoothstep(0.55, 0.92, moonAmount) * moonMask;
    float moonCloudLift = moonClear * (moonHalo * 0.30 + moonAura * 0.18);
    vec3 moonCloudCol = moonCol * (0.28 + 0.18 * cloudBaseLight);
    float cloudMix = density * (1.0 - moonClear * 0.68);

    return mix(
        sky + sunLight + moonLight,
        cloudLight + sunLight * sunLitCloud + moonCloudCol * moonCloudLift,
        cloudMix
    );
}
