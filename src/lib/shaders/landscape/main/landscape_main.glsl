
void main()
{
    vec2 screenUV = gl_FragCoord.xy / u_resolution.xy;
    vec3 ro = u_cameraPos;
    vec3 rd = makeCameraRay(screenUV);
    // AI: Phase 1 keeps the fullscreen pass, but moves the landscape into orbital camera/world-ray space so depth no longer depends only on a screen-space horizon split.
    float phase = clamp(u_scroll, 0.0, 1.0);
    float nightMask = nightPhase(phase);
    float moonMask = moonPhase(phase);
    float titleRevealMask = titleReveal(phase);
    float titleReflectionRevealMask = titleReflectionReveal(phase);
    vec3 sunCol = sunColor(phase);
    vec3 sunDir = sunDirection(phase);
    vec3 horizonSky = skyColor(0.5, phase);
    float tWater;
    vec3 waterPos;
    bool hasWater = intersectWater(ro, rd, tWater, waterPos);
    float tShore;
    vec3 shorePos;
    float shoreHeight;
    bool hasShore = intersectShore(ro, rd, tShore, shorePos, shoreHeight);
    float tTitle;
    vec2 titleUv;
    vec3 titleHitPos;
    float titleAlpha;
    bool hasTitle = u_useTitleBillboard > 0.5 &&
        intersectTitleBillboard(ro, rd, tTitle, titleUv, titleHitPos, titleAlpha);
    if (hasTitle) {
        titleAlpha = titleAboveWaterAlpha(titleHitPos, titleAlpha) * titleRevealMask;
        hasTitle = titleAlpha > 0.0005;
    }
    float shoreWaterEdgeZ = shorelineWaterEdgeZ();
    bool waterWithinPond = hasWater && waterPos.z > shoreWaterEdgeZ;
    float waterToShoreGap = (hasWater && hasShore && tShore > tWater) ? (tShore - tWater) : 1e5;
    float shoreToWaterGap = (hasWater && hasShore && tWater > tShore) ? (tWater - tShore) : 1e5;
    float shorelineGap = min(waterToShoreGap, shoreToWaterGap);
    float shoreOverlapMask = 0.0;
    if (hasShore && hasWater && waterWithinPond && tShore < tWater) {
        vec2 shoreCrossPre = vec2(shorePos.z - shoreWaterEdgeZ, shorePos.y - u_waterLevel);
        float shorelineSeatMaskPre = shorelineTransitionMask(shoreCrossPre, 0.050);
        float shoreContactMaskPre = contactGapMask(shorelineGap, 0.22);
        float shoreBottomCoveragePre = aaCoverage(shorePos.y - (u_waterLevel + SHORE_BANK_FOOT_OFFSET_Y));
        float shoreRunupWavePre = max(
            waveFieldWithMasks(vec2(shorePos.x, shoreWaterEdgeZ) * 1.1, u_time, 0.16, 0.26, 0.32),
            0.0
        );
        float shoreFilmThicknessPre = max(0.0, (u_waterLevel + shoreRunupWavePre * 0.22 + shorelineSeatMaskPre * 0.007) - shorePos.y);
        float shoreFilmMaskPre = smoothstep(0.0, 0.018, shoreFilmThicknessPre) * shorelineSeatMaskPre;
        shoreOverlapMask = max(
            shoreFilmMaskPre,
            (1.0 - shoreBottomCoveragePre) * (0.88 * shorelineSeatMaskPre + 0.12 * shoreContactMaskPre)
        );
    }
    bool shoreAllowsWaterOverlap = shoreOverlapMask > 0.06;
    bool shoreOccludes = hasShore && (!waterWithinPond || !hasWater || (tShore < tWater && !shoreAllowsWaterOverlap));

#ifdef DEBUG_RIPPLE
    float debugHeight = 0.0;
    if (waterWithinPond) {
        vec2 rippleDebugUv = waterWorldToRippleUV(waterPos);
        if (insideUnitSquare(rippleDebugUv)) {
            debugHeight = texture(u_rippleTex, rippleDebugUv).r;
        }
    }
    fragColor = vec4(vec3(debugHeight * 0.5 + 0.5), 1.0);
    return;
#endif

    if (shoreOccludes)
    {
#ifdef DEBUG_NORMALS
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
#endif

        vec3 skyCol = shadeSkyDirection(rd, phase, sunCol, sunDir, 1.0);

#ifdef DEBUG_REFLECTION
        fragColor = vec4(tonemap(skyCol), 1.0);
        return;
#endif

        float hNorm = saturate((shorePos.y - u_waterLevel) / max(shoreHeight - u_waterLevel, 0.001));
        float topEdge = exp(-abs(shoreHeight - shorePos.y) * 130.0);
        vec2 shoreCross = vec2(shorePos.z - shoreWaterEdgeZ, shorePos.y - u_waterLevel);
        float shorelineSeatMask = shorelineTransitionMask(shoreCross, 0.050);
        float shoreContactMask = contactGapMask(shoreToWaterGap, 0.22);
        float shoreContactCore = contactGapMask(shoreToWaterGap, 0.08);
        float shoreTopCoverage = aaCoverage(shoreHeight - shorePos.y);
        float shoreBottomCoverage = aaCoverage(shorePos.y - (u_waterLevel + SHORE_BANK_FOOT_OFFSET_Y));
        float shoreFootMask = 1.0 - smoothstep(0.0, 0.18, hNorm);
        float sunFacing = saturate(dot(normalize(vec3(0.0, 0.32, 1.0)), sunDir) * 0.5 + 0.5);
        float crestMask = smoothstep(0.58, 0.94, hNorm);
        vec3 bankShadow = mix(vec3(0.060, 0.050, 0.052), vec3(0.070, 0.048, 0.046), phase);
        vec3 shallowShelfTint = mix(vec3(0.40, 0.31, 0.25), vec3(0.48, 0.28, 0.20), phase);
        vec3 wetEdgeTint = mix(vec3(0.18, 0.13, 0.11), vec3(0.20, 0.11, 0.09), phase);
        // AI: night-grade shoreline contact palette so waterline doesn't read as bright dry sand.
        bankShadow = applyNightGrade(bankShadow, nightMask, vec3(0.04, 0.07, 0.13));
        shallowShelfTint = applyNightGrade(shallowShelfTint, nightMask, vec3(0.03, 0.06, 0.12));
        wetEdgeTint = applyNightGrade(wetEdgeTint, nightMask, vec3(0.04, 0.07, 0.14));
        vec3 sharedContactCol = mix(
            wetEdgeTint + shallowShelfTint * 0.10,
            horizonSky * 0.58 + shallowShelfTint * 0.42,
            0.58
        );
        vec3 shoreCol = bankMaterialBase(shorePos.x, hNorm, phase);
        shoreCol *= mix(0.86, 1.06, sunFacing * 0.34 + hNorm * 0.22);
        shoreCol = mix(shoreCol, skyCol * 0.66 + vec3(0.032, 0.028, 0.032), crestMask * 0.10);
        shoreCol += (sunCol * 0.09 + skyCol * 0.08) * topEdge;
        shoreCol = mix(
            shoreCol,
            bankShadow * 0.90 + shallowShelfTint * 0.18 + skyCol * 0.04,
            shorelineSeatMask * shoreContactMask * 0.05
        );
        float shoreRunupWave = max(
            waveFieldWithMasks(vec2(shorePos.x, shoreWaterEdgeZ) * 1.1, u_time, 0.16, 0.26, 0.32),
            0.0
        );
        float shoreFilmThickness = max(0.0, (u_waterLevel + shoreRunupWave * 0.22 + shorelineSeatMask * 0.007) - shorePos.y);
        float shoreFilmMask = smoothstep(0.0, 0.018, shoreFilmThickness) * shorelineSeatMask;
        shoreCol += sunCol * shorelineSeatMask * shoreContactCore * 0.010;
        float shoreSharedBand = max(shoreContactMask * shorelineSeatMask, shoreFootMask);
        shoreCol = mix(shoreCol, bankShadow * 0.92 + shallowShelfTint * 0.22, shoreSharedBand * 0.02);
        vec2 shoreFilmP = vec2(shorePos.x, shoreWaterEdgeZ + 0.026) * 1.1;
        vec3 shoreFilmN = waveNormal(shoreFilmP, u_time, 0.16, 0.24, 0.30, tShore);
        shoreFilmN = normalize(mix(shoreFilmN, vec3(0.0, 1.0, 0.0), 0.62 + shoreFilmMask * 0.24));
        vec3 shoreFilmViewDir = normalize(ro - vec3(shorePos.x, u_waterLevel + shoreRunupWave * 0.12, shoreWaterEdgeZ + 0.022));
        vec3 shoreFilmReflDir = normalize(reflect(-shoreFilmViewDir, shoreFilmN));
        shoreFilmReflDir.y = max(shoreFilmReflDir.y, 0.001);
        vec3 shoreFilmSky = shadeSkyDirection(shoreFilmReflDir, phase, sunCol, sunDir, 0.0);
        float shoreFilmCosTheta = clamp(dot(shoreFilmViewDir, shoreFilmN), 0.0, 1.0);
        float shoreFilmFresnel = 0.02 + 0.98 * pow(1.0 - shoreFilmCosTheta, 5.0);
        float shoreFilmSunMirror = max(dot(shoreFilmReflDir, sunDir), 0.0);
        vec3 shoreFilmSun = sunCol * (pow(shoreFilmSunMirror, 180.0) * 2.2 + pow(shoreFilmSunMirror, 42.0) * 0.34);
        vec3 shoreSeenThroughWater = shoreCol * vec3(0.80, 0.89, 0.97) + shallowShelfTint * 0.18;
        vec3 shoreFilmCol = mix(shoreSeenThroughWater, shoreFilmSky + shoreFilmSun, shoreFilmFresnel * 0.74);
        shoreFilmCol = mix(shoreFilmCol, shallowShelfTint * 0.72 + skyCol * 0.16, shoreFilmMask * 0.12);
        float shoreWatercoat = max(shoreFilmMask, (1.0 - shoreBottomCoverage) * (0.88 * shorelineSeatMask + 0.12 * shoreContactMask));
        shoreCol = mix(shoreCol, shoreFilmCol, shoreWatercoat * 0.96);
        shoreCol = mix(skyCol, shoreCol, shoreTopCoverage);
        shoreCol = applyMorningHeightFog(shoreCol, ro, rd, tShore, phase, horizonSky, sunCol, sunDir);
        if (hasTitle && tTitle < tShore) {
            vec3 titleCol = titleHeroColor(rd, sunCol, sunDir);
            titleCol = applyMorningHeightFog(titleCol, ro, rd, tTitle, phase, horizonSky, sunCol, sunDir);
            shoreCol = compositeTitle(shoreCol, titleCol, titleAlpha);
        }

        fragColor = vec4(tonemap(shoreCol), 1.0);
        return;
    }

    if (!waterWithinPond)
    {
#ifdef DEBUG_NORMALS
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
#endif

        vec3 skyCol = shadeSkyDirection(rd, phase, sunCol, sunDir, 1.0);

#ifdef DEBUG_REFLECTION
        fragColor = vec4(tonemap(skyCol), 1.0);
        return;
#endif

        float skyFogDistance = mix(
            MORNING_FOG_SKY_DISTANCE,
            MORNING_FOG_SKY_DISTANCE * 0.32,
            smoothstep(0.0, 0.85, max(rd.y, 0.0))
        );
        skyCol = applyMorningHeightFog(skyCol, ro, rd, skyFogDistance, phase, horizonSky, sunCol, sunDir);

        if (hasTitle && (!hasShore || tTitle < tShore) && (!hasWater || tTitle < tWater)) {
            vec3 titleCol = titleHeroColor(rd, sunCol, sunDir);
            titleCol = applyMorningHeightFog(titleCol, ro, rd, tTitle, phase, horizonSky, sunCol, sunDir);
            skyCol = compositeTitle(skyCol, titleCol, titleAlpha);
        }

        fragColor = vec4(tonemap(skyCol), 1.0);
        return;
    }

    // ----------------------------------------------------
    // WATER
    // ----------------------------------------------------
    float t = u_time;
    // AI: derive water detail from actual camera distance + grazing angle; reusing shore/ripple-rect Z here flattens the whole far field into a fake pastel wall.
    float viewDistance = tWater;
    float farField = smoothstep(WAVE_LOD_NEAR_DIST, WAVE_LOD_FAR_DIST, viewDistance);
    float horizonGrazing = 1.0 - smoothstep(0.006, 0.05, abs(rd.y));
    float horizonMist = farField * horizonGrazing;
    float nearField = 1.0 - farField;
    float shorelineMask = contactGapMask(shorelineGap, 0.28);
    float shorelineCore = contactGapMask(shorelineGap, 0.10);
    float shelfBottomY = underwaterShelfHeightAt(waterPos.x, waterPos.z);
    float staticWaterDepth = max(u_waterLevel - shelfBottomY, 0.0);
    float shallowWaveDamping = 1.0 - smoothstep(0.006, 0.050, staticWaterDepth);
    float largeWaveMask  = mix(1.0, 0.68, farField) * (1.0 - shallowWaveDamping * 0.42);
    float mediumWaveMask = mix(1.0, 0.44, farField) * (1.0 - shallowWaveDamping * 0.24);
    // AI: Phase D tuning — use a wider transition to avoid a visible mid-distance ripple lane.
    float rippleLod = 1.0 - smoothstep(RIPPLE_FADE_START, RIPPLE_FADE_END, farField);
    float rippleWaveMask = mix(1.0, 0.18, farField) * (1.0 - shallowWaveDamping * 0.08) * rippleLod;
    // AI: decouple interactive ripple-normal LOD from base wave ripples for independent tuning.
    float interactiveRippleMask = rippleLod * (1.0 - shallowWaveDamping * 0.06);
    float microNoiseMask = mix(1.0, 0.22, farField) * (1.0 - shallowWaveDamping * 0.22);
    vec2 p = waterPos.xz * 1.1;
    float waveHeight = waveFieldWithMasks(p, t, largeWaveMask, mediumWaveMask, rippleWaveMask);

    // AI: Phase D debug overlay for LOD tuning.
    // R: farField, G: rippleLod, B: interactiveRippleMask
#ifdef DEBUG_WAVE_LOD
    fragColor = vec4(farField, rippleLod, interactiveRippleMask, 1.0);
    return;
#endif

    // НОРМАЛЬ ВОЛН
    vec3 n = waveNormal(p, t, largeWaveMask, mediumWaveMask, rippleWaveMask, viewDistance);

    // ИНТЕРАКТИВНАЯ РЯБЬ
    {
        float rippleNormalLod = smoothstep(0.04, 0.40, interactiveRippleMask);
        if (rippleNormalLod > 0.0001) {
            vec2 rUV = waterWorldToRippleUV(waterPos);
            if (insideUnitSquare(rUV)) {
                float rt  = u_rippleTexel;
                float rxP = texture(u_rippleTex, clamp(rUV + vec2(rt, 0.0), 0.0, 1.0)).r;
                float rxN = texture(u_rippleTex, clamp(rUV - vec2(rt, 0.0), 0.0, 1.0)).r;
                float ryP = texture(u_rippleTex, clamp(rUV + vec2(0.0, rt), 0.0, 1.0)).r;
                float ryN = texture(u_rippleTex, clamp(rUV - vec2(0.0, rt), 0.0, 1.0)).r;
                vec2 rippleGrad = vec2(rxP - rxN, ryP - ryN);
                vec2 rippleEdge = min(rUV, 1.0 - rUV);
                float rippleFade = smoothstep(0.0, 0.065, min(rippleEdge.x, rippleEdge.y));
                // AI: keep ripple perturbation in ripple-texture space, but soften the world-space coupling so interaction reads as water relief instead of crater-like reflection breaks.
                n = normalize(
                    n + vec3(-rippleGrad.x * 2.2, 0.0, -rippleGrad.y * 2.2) * rippleFade * rippleNormalLod
                );
            }
        }
    }

#ifdef DEBUG_NORMALS
    fragColor = vec4(n * 0.5 + 0.5, 1.0);
    return;
#endif

    // MICRO NORMAL NOISE
    {
        vec2 mn = microNormalDelta(p, t, microNoiseMask);
        n = normalize(n + vec3(mn.x, 0.0, mn.y) * 0.28);
    }

    float bankSurfaceY = shorelineBankSurfaceYAt(waterPos.x, waterPos.z);
    float bankSurfaceNorm = saturate((bankSurfaceY - u_waterLevel) / max(shorelineHeightAt(waterPos.x) - u_waterLevel, 0.001));
    float waterSurfaceY = u_waterLevel + max(waveHeight, 0.0) * 0.22;
    float shallowThickness = max(0.0, waterSurfaceY - shelfBottomY);
    float shallowWaterAlpha = smoothstep(0.014, 0.060, shallowThickness);
    float shallowReveal = 1.0 - shallowWaterAlpha;
    float calmBand = max(shallowReveal * 0.30, shorelineCore * 0.08 + shallowWaveDamping * 0.12);
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), calmBand));

    float rippleStrength = 1.0 - n.y;
    vec3 viewDir = normalize(ro - waterPos);

    // FRESNEL
    float cosTheta = clamp(dot(viewDir,n), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);

    // ОТРАЖЕНИЕ НЕБА + БЕРЕГА
    vec3 reflDir = normalize(reflect(-viewDir, n));
    reflDir.y = max(reflDir.y, 0.001);
    vec3 skyRefl = shadeSkyDirection(reflDir, phase, sunCol, sunDir, 0.0);

    {
        vec2 reflSkyUv = skyUvFromDirection(reflDir);
        float vegReflH = vegetationProfile(clamp(reflSkyUv.x, 0.0, 1.0));
        float vegReflMask = smoothstep(vegReflH + 0.012, vegReflH - 0.012, reflSkyUv.y);
        if (vegReflMask > 0.0) {
            vec3 vReflBase = mix(vec3(0.022, 0.032, 0.062), vec3(0.030, 0.014, 0.030), phase);
            float vWaterRim = exp(-abs(reflSkyUv.y - vegReflH) * 42.0) * 0.12;
            vReflBase += sunCol * vWaterRim * 0.24;
            skyRefl = mix(skyRefl, vReflBase, vegReflMask * (0.18 + 0.28 * nearField));
        }
    }

    {
        // AI: base blend 0.30 smooths nTitle even on calm water.
        // Without base: flat water -> rippleStrength ~= 0 -> titleNormBlend ~= 0 ->
        // nTitle = n with full wave normals, so reflection ray scans MSDF at angles
        // that produce comb-like artifacts.
        // Range: 0.30 (calm water) -> 0.72 (max wave activity).
        float titleNormBlend = 0.30 + smoothstep(0.0, 0.48, rippleStrength) * 0.42;
        vec3 nTitle = normalize(mix(n, vec3(0.0, 1.0, 0.0), titleNormBlend));
        vec3 reflDirTitle = normalize(reflect(-viewDir, nTitle));
        reflDirTitle.y = max(reflDirTitle.y, 0.001);

        // AI: reflection uses same DayGlo base hue and blends with sky for water coherence.
        vec3 titleLime = TITLE_DAYGLO_LINEAR;

        if (u_useTitleBillboard > 0.5) {
            float tTitleRefl;
            vec2 titleReflUv;
            vec3 titleReflHitPos;
            float titleReflAlpha;
            bool hasTitleRefl = intersectTitleBillboard(
                waterPos + n * 0.018 + vec3(0.0, 0.004, 0.0),
                reflDirTitle,
                tTitleRefl,
                titleReflUv,
                titleReflHitPos,
                titleReflAlpha
            );
            if (hasTitleRefl) {
                titleReflAlpha = titleAboveWaterAlpha(titleReflHitPos, titleReflAlpha) * titleReflectionRevealMask;
                if (titleReflAlpha > 0.0005) {
                    // Depth-based attenuation: reflection fades with ray travel distance,
                    // reinforcing spatial depth of the world-space billboard.
                    float distFade = exp(-tTitleRefl * 0.28);
                    vec3 titleReflCol = titleLime * 0.55 + skyRefl * 0.20;
                    skyRefl = compositeTitle(skyRefl, titleReflCol, titleReflAlpha * 0.36 * distFade);
                    // AI: reflected title glow disabled to avoid contour/halo artifacts in water reflection.
                }
            }
        } else if (u_useTitlePhraseReflection > 0.5) {
            float tTitleRefl;
            vec3 titleReflHitPos;
            float titleReflAlpha;
            bool hasTitleRefl = intersectTitleAtlas(
                waterPos + n * 0.018 + vec3(0.0, 0.004, 0.0),
                reflDirTitle,
                tTitleRefl,
                titleReflHitPos,
                titleReflAlpha
            );
            if (hasTitleRefl) {
                vec2 titleReflMetric = titleLocalMetricFromHitPos(titleReflHitPos);
                float titleReflFill;
                float unusedTitleReflHalo;
                sampleTitlePhraseReflectionCoverage(titleReflMetric, titleReflFill, unusedTitleReflHalo);
                titleReflFill = titleAboveWaterAlpha(titleReflHitPos, titleReflFill) * titleReflectionRevealMask;
                if (titleReflFill > 0.0005) {
                    float distFade = exp(-tTitleRefl * 0.28);
                    // Suppress further when water is very agitated: secondary damping
                    // beyond normal smoothing above, guards against extreme ripple bursts.
                    float rippleAtten = 1.0 - smoothstep(0.0, 0.65, rippleStrength) * 0.38;
                    vec3 titleReflCol = titleLime * 0.55 + skyRefl * 0.20;
                    skyRefl = compositeTitle(skyRefl, titleReflCol,
                                            titleReflFill * 0.18 * distFade * rippleAtten);
                    // AI: reflected title glow disabled to avoid contour/halo artifacts in water reflection.
                }
            }
        }
    }

#ifdef DEBUG_REFLECTION
    fragColor = vec4(tonemap(skyRefl), 1.0);
    return;
#endif

    // СОЛНЕЧНАЯ ДОРОЖКА
    float sunMirror = max(dot(reflDir, sunDir), 0.0);
    vec3 sunLight = sunCol * (pow(sunMirror, 180.0) * 4.5 + pow(sunMirror, 42.0) * 0.7);
    sunLight *= (1.0 - shorelineCore * 0.72);
    vec3 moonDir = moonDirection(phase);
    vec3 moonCol = moonColor(phase);
    float moonMirror = max(dot(reflDir, moonDir), 0.0);
    // AI: add a wider low-frequency lobe for a longer atmospheric moon path.
    vec3 moonLight = moonCol * (
        pow(moonMirror, 180.0) * 1.34 +
        pow(moonMirror, 34.0) * 0.38 +
        pow(moonMirror, 8.0) * 0.10
    );
    moonLight *= moonMask * (1.0 - shorelineCore * 0.78);

    // ЦВЕТ ВОДЫ
    vec3 waterDeep = mix(vec3(0.03,0.10,0.16), skyRefl*0.6, 0.3);
    vec3 waterCol  = mix(waterDeep, skyRefl + sunLight + moonLight, fresnel);
    vec3 shallowShelfTint = mix(vec3(0.40, 0.31, 0.25), vec3(0.48, 0.28, 0.20), phase);
    vec3 wetEdgeTint = mix(vec3(0.18, 0.13, 0.11), vec3(0.20, 0.11, 0.09), phase);
    // AI: same night-grade for underwater shelf/edge to keep shoreline-water continuity.
    shallowShelfTint = applyNightGrade(shallowShelfTint, nightMask, vec3(0.03, 0.06, 0.12));
    wetEdgeTint = applyNightGrade(wetEdgeTint, nightMask, vec3(0.04, 0.07, 0.14));
    vec3 sharedContactCol = mix(
        wetEdgeTint + shallowShelfTint * 0.10,
        horizonSky * 0.58 + shallowShelfTint * 0.42,
        0.58
    );
    float waterSharedBand = max(shorelineCore * 0.18, shallowReveal * 0.24);
    float shelfBottomNoise = 0.92 + 0.08 * texture(
        u_shoreProfileTex,
        vec2(clamp(waterPos.x * 0.16 + 0.5, 0.0, 1.0), 0.5)
    ).b;
    vec3 bankUnderwaterCol = bankMaterialBase(waterPos.x, max(bankSurfaceNorm, 0.05), phase) * vec3(0.78, 0.88, 0.97);
    vec3 shallowBottomCol = mix(
        shallowShelfTint * 0.80 + wetEdgeTint * 0.22 + skyRefl * 0.04,
        bankUnderwaterCol + shallowShelfTint * 0.10,
        shallowReveal * 0.72
    ) * shelfBottomNoise;
    waterCol = mix(waterCol, waterCol * vec3(0.94, 0.96, 0.90) + shallowShelfTint * 0.12, shorelineMask * 0.18);
    waterCol = mix(shallowBottomCol, waterCol, shallowWaterAlpha);
    waterCol = mix(waterCol, bankUnderwaterCol + skyRefl * 0.08, shallowReveal * 0.18);
    waterCol = mix(waterCol, sharedContactCol, waterSharedBand * 0.015);
    waterCol += (sunCol * 0.05 + vec3(0.015, 0.016, 0.018)) * shorelineCore * (0.10 + 0.24 * rippleStrength);

    // СПЕКУЛЯР + ГЛИНТЫ
    vec3 halfDir  = normalize(sunDir + viewDir);
    vec3 halfMoonDir = normalize(moonDir + viewDir);
    float glint = pow(max(dot(n,sunDir),0.0),80.0) * rippleStrength * mix(0.32, 1.0, nearField) * 3.5;
    glint *= (1.0 - shorelineCore * 0.88);
    waterCol += glint*sunCol*1.2;
    waterCol  = mix(waterCol, waterCol*vec3(0.88,0.93,1.05),
                    rippleStrength * 0.28 * mix(0.26, 1.0, nearField));
    waterCol += pow(max(dot(n,halfDir),0.0),52.0) * 0.9 * mix(0.46, 1.0, nearField) * (sunCol*1.5+vec3(0.1));
    float moonGlint = pow(max(dot(n, moonDir), 0.0), 96.0) * rippleStrength * mix(0.26, 0.82, nearField);
    moonGlint *= moonMask * (1.0 - shorelineCore * 0.90);
    waterCol += moonGlint * moonCol * 0.92;
    waterCol += pow(max(dot(n, halfMoonDir), 0.0), 68.0) * 0.38 * moonMask * mix(0.38, 0.88, nearField) * moonCol;

    vec3 horizonLift = mix(horizonSky, skyRefl, 0.68);
    vec3 col = mix(waterCol, horizonLift, horizonMist * 0.10 * (1.0 - shorelineCore * 0.82));
    col = mix(col, sharedContactCol, waterSharedBand * 0.02);
    col = applyMorningHeightFog(col, ro, rd, tWater, phase, horizonSky, sunCol, sunDir);
    if (hasTitle && tTitle < tWater && (!hasShore || tTitle < tShore)) {
        vec3 titleCol = titleHeroColor(rd, sunCol, sunDir);
        titleCol = applyMorningHeightFog(titleCol, ro, rd, tTitle, phase, horizonSky, sunCol, sunDir);
        col = compositeTitle(col, titleCol, titleAlpha);
    }
