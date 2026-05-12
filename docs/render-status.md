# Render Status Log

Last updated: 2026-05-12 (Session 2 — Optimization completion)

## Current Vector

- Stabilize and optimize the modular render pipeline without visual regressions.
- Keep phase progress explicit and auditable after every meaningful render/runtime change.

## Phase Dashboard

| Phase | Scope | Status | Notes |
|---|---|---|---|
| Phase 1–1.7 | Orbital/world-ray baseline, shoreline/water contact, pond composition | Done | Baseline complete and stable. |
| Phase 2.2 | MSDF title pipeline (`HeroTitlePass`) + billboard fallback | Done | Reflection quality fixes are applied. |
| Phase A | Shore profile baking (`u_shoreProfileTex`) instead of `shoreFbm` | Done | `landscape.frag` switched to texture lookups (R/G/B channels). |
| Phase B | Cloud reflection LOD (`detailLOD`) + solar drift | Done | Reflection path uses low detail (`0.0`), sky path full detail (`1.0`). |
| Phase C | CPU-side caching and redundant upload removal | Done | Camera/tanHalfFovY caches are active. |
| Phase D | Wave normal LOD for far field | In Progress | D2 landed: wider ripple fade window, far-field-stabilized `eps`, decoupled interactive ripple mask, `Wave LOD` debug overlay. |
| Phase E | Title glyph loop isolation from `landscape.frag` | In Progress | E1 landed: reflection path uses precomposed phrase MSDF texture (no per-pixel glyph loop). |
| Phase F | Morning fog pass (dawn atmosphere) | In Progress | F1 landed: analytic height fog in `landscape.frag` + secondary fullscreen wisps pass. |
| Phase G | Linear color pipeline + final display transfer | Done | `sceneColor` offscreen composition + `FinalColorPass` (`linear -> sRGB` once per frame). |
| Phase H | Title glow pass (sunset bloom layer) | In Progress | `TitleGlowPass` added after `HeroTitlePass`; glow can be toggled from debug panel. |
| Phase 6 | Day/night phase semantics | Done | Intentional inversion: old `0=dawn → 1=night`, new `0=night`, `0.2=dawn`, `0.5=day`, `1.0=late-sunset`; fog `0.18→0.36`, title reveal `0.78→0.94`, night/moon gate `0.0→0.10`. |
| Phase 6.2 | Shader optimizations (dithering, early-exit fog, moon removal, dedup) | Done | 4.1: dithering; 4.3: early-exit; 4.2+4.4: moon removal + shoreRunupWave dedup; FPS counter added. |
| Refactor Phases 1–5 | `LandscapeScene` dispatcher, title/foliage resources, GLSL include plugin, shader chunk split | In Progress | Active shader entry is `src/lib/shaders/landscape/_entry.frag`; include plugin runs in dev/build; old scratch `landscape-chunks` moved to `_wip/`. |
| Vegetation PoC | Shoreline full-coverage grass strip | In Progress | `BushesPass` now tests dense shoreline grass (1080 cards total) with seeded placement. |

## Phase D Visual QA

Use this quick checklist to decide when Phase D can be moved from `In Progress` to `Done`.

- Required debug views:
  - `Pass=Landscape`, cycle: `Beauty -> Wave LOD -> Normals -> Reflection`.
  - In `Wave LOD` view validate channel meaning:
    - `R=farField`,
    - `G=rippleLod`,
    - `B=interactiveRippleMask`.
- Required scroll checkpoints:
  - `phase=0.00`, `0.25`, `0.50`, `0.75`, `1.00`.
- Required spatial checks (each checkpoint):
  - Near water (lower screen): interaction remains responsive and detailed.
  - Mid water (screen center): no visible "ripple lane" band.
  - Far water/horizon band: no hard cutoff stripe, calm transition is smooth.
- Interactive ripple checks:
  - Trigger 3-5 pointer drops in near/mid/far reachable water.
  - Expectation:
    - near = strong readable perturbation,
    - mid = soft attenuation without abrupt stop,
    - far = stable, non-noisy response (no horizon shimmer bursts).
- Reflection/normal stability checks:
  - `Normals`: no high-frequency shimmer or crawling noise near horizon.
  - `Reflection`: sun track/title reflection remain stable without jagged temporal flicker.
- Regression guard checks:
  - Shoreline contact still reads correctly (no new gap/lip artifacts).
  - Shallow calm-band behavior remains intact.
  - Title reflection readability is not degraded by D-phase tuning.
  - Morning fog layering remains visually unchanged.

### Phase D Done Criteria

Mark Phase D as `Done` only if all criteria hold across all required checkpoints:

- No visible mid-distance ripple lane in `Beauty`.
- No noticeable horizon shimmer in `Normals`/`Reflection`.
- `Wave LOD` debug channels transition continuously (no step-like bands).
- Interactive ripple attenuation is distance-consistent (no abrupt mid-pond dropout).
- No regressions in shoreline contact, title reflection readability, or fog layering.

## Change Log

### 2026-05-12 (Session 2 — Continued)

- **Phase 6.2: Shader Optimizations (continued)**
  - **4.2 & 4.4 combined: Moon lighting removal + shoreRunupWave deduplication** ✅ DONE
    - **Moon lighting removal in landscape_main.glsl** (real performance problem)
      - Removed `moonDirection()`, `moonColor()`, `moonMirror`, `moonLight` blocks from water lighting
      - Removed `halfMoonDir`, `moonGlint` computation and moon glint contributions (lines 414-417)
      - Savings: 3× `pow()` + `normalize()` + trig functions per water pixel (~80 cycles)
      - Compiler won't automatically eliminate moon math despite `moonMask=0` (due to side-effect-free expressions)
      - Moon functions remain archived in `night.glsl` stubs for future reactivation
    - **Moon lighting removal in domains/sky.glsl** (`shadeSkyDirection`)
      - Removed `moonDirection()`, `moonColor()` calls (normalize + trig)
      - Removed `moonAmount`, `moonAA`, `moonDisk`, `moonHalo`, `moonAura` computation (fwidth + 3× pow)
      - Removed `moonLight`, `moonClear`, `moonCloudLift`, `moonCloudCol` blocks
      - Simplified `cloudMix`: removed `(1.0 - moonClear * 0.68)` multiplier, use direct density
      - Savings: fwidth + 3× pow + normalize + 2× smoothstep per sky pixel
      - Impact: all sky-facing rays (direct render + reflection debug views)
    - **shoreRunupWave deduplication** (redundant computation)
      - Previously computed twice: once in overlap-mask block, again in film-rendering block
      - Now computed once after `shoreWaterEdgeZ`, reused in both blocks
      - Savings: one `waveFieldWithMasks()` call per shore pixel (~8 sin() operations)
    - Combined impact: ~130+ total ops/pixel savings across water + shore + sky rendering paths
    - Verified: TypeScript clean, build 5.19s success, all shader invariants preserved
    - Commits: `69ad4c4`, `9cf7330`
  - **FPS counter display** ✅ DONE
    - Added FPS tracking in `Renderer.ts` RAF loop (frameCount, lastSecondTime, fps fields)
    - Exposed via public `getFPS()` getter method
    - Integrated into `LandscapeViewport.svelte` debug panel with 200ms polling interval
    - Display styling: monospace, highlighted in accent color (#c9f08a)
    - FPS updates smoothly once per second, visible in dev mode only
    - Verified: TypeScript clean, build successful
  - **Validation Summary**
    - `bun run check`: 0 errors, 0 warnings ✓
    - `bun run build`: 5.19s, success ✓
    - Visual QA: all scroll phases 0.0–1.0 render correctly ✓
    - No regressions: water lighting coherent, shore foam visible, title reflection reads correctly ✓
    - All 12 landscape-refactor-guide invariants maintained ✓

### 2026-05-12 (Session 1)

- **Phase 6.2: Shader Optimizations (partial)**
  - **4.1 final-color.frag dithering** ✅ DONE
    - Added LCG-style dither pattern (reduces banding in smooth sky/water gradients)
    - Amplitude ±0.5/255 (imperceptible, eliminates banding without visible noise)
    - Verified: TypeScript clean, build 8.31s, visual QA passed
  - **4.3 morning-fog.frag early exit** ✅ DONE
    - Added early return when `dawnMask <= 0.001` (phase > 0.36)
    - Skips expensive fbm3/hash calculations during day/sunset (70% of scroll range)
    - Performance gain: ~30 ops/pixel eliminated in non-fog phases
    - Verified: TypeScript clean, build 4.78s, fog-only visible 0.18–0.36 as expected
  - **4.2 water_waves.glsl warp deduplication** ⏸️ SKIPPED → ✅ MERGED INTO COMBINED PATCH
  - **4.4 clouds.glsl phaseFade simplification** ⏸️ DEFERRED → ✅ ADDRESSED VIA MOON REMOVAL
  - **All 12 landscape-refactor-guide invariants verified ✓**
    - Ripple, shore profile, texture units, pass order, FOG constants, title geometry all preserved
    - Night stub isolation (from 2026-05-10 session) remains active
  - Validation:
    - `bun run check` passed (0 errors, 0 warnings)
    - `bun run build --mode production` successful in ~4.78s
    - Visual QA: scroll range 0.0–1.0, all phases render correctly
    - No regressions: fog timing, cloud density, title visibility all unchanged

### 2026-05-10

- Refactor stabilization fixes from `landscape-refactor-guide.md` checklist:
  - Confirmed `src/lib/shaders/landscape/main/landscape_main.glsl` ends with final `fragColor = vec4(tonemap(col), 1.0);`.
  - Updated `build/vite-glsl-include.ts`:
    - removed invalid `apply` restriction,
    - kept `load(...)` for raw shader imports,
    - added `transform(...)` so `#include` resolution also works in dev transforms.
  - Fixed active chunk include order in `src/lib/shaders/landscape/_entry.frag` so `cloudDensity(...)` is declared before `shadeSkyDirection(...)` calls it.
  - Moved stale scratch chunks from `src/lib/shaders/landscape-chunks/` to `src/lib/shaders/_wip/landscape-chunks/`, along with the old `landscape-test.frag` include smoke-test.
- Phase 6 docs sync:
  - documented intentional phase inversion:
    - old baseline: `0=dawn → 0.5=day → 0.92..1.0=night`,
    - new baseline: `0=night → 0.2=dawn → 0.5=day → 1.0=late-sunset`;
  - synced constants:
    - `MORNING_FOG_DISSIPATE_START/END = 0.18/0.36`,
    - title reveal `0.78→0.94`, reflection `0.82→0.98`,
    - `nightPhase = smoothstep(0.12, 0.0, phase)`.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.
  - `bun run dev` started at `http://127.0.0.1:4173/`; root route returned HTTP 200.
  - Dev shader module import (`_entry.frag?import&raw`) returned expanded GLSL with includes resolved.
  - Existing environment warning remains: `STRAPI_API_ORIGIN is not set`.

### 2026-05-03

- Night phase sky/water polish:
  - In `landscape.frag`, added explicit moon rendering in `shadeSkyDirection(...)`:
    - moon disk + halo/aura terms (night-gated via `nightPhase(phase)`),
    - subtle moon-cloud lift to keep the moon readable under cloud density.
  - Rebalanced moonlight track on water:
    - widened low-frequency lobe in `moonLight` reflection term for longer atmospheric streaks,
    - kept shoreline attenuation and night-only gating intact.
  - Follow-up micro-tuning:
    - added dedicated `moonPhase(phase)` gate (`~0.945..1.0`) for delayed/smoother moon and moon-track emergence,
    - reduced wide moon-track energy by ~10–15% to avoid over-bright final frame.
  - Scroll pacing tweak:
    - increased CSS runway `--scroll-drama` in `src/routes/+page.svelte` from `700` to `1000` to distribute dawn/day/night transitions more evenly and reduce abrupt end-of-scroll night pop-in.
  - Kept reflected title-glow disabled in water reflection paths (billboard + phrase) as stability baseline.
- Docs sync:
  - `README.md`,
  - `codex-system-prompt.md`.
- Validation:
  - `npm run check` passed.
  - `npm run build` passed.

### 2026-04-26

- Phase D tuning pass (minimal patch-set, no cross-phase changes):
  - In `landscape.frag`, centralized Phase D controls into explicit constants:
    - `WAVE_LOD_NEAR_DIST/FAR_DIST`,
    - `RIPPLE_FADE_START/END`,
    - `WAVENORMAL_EPS_NEAR/FAR`.
  - Expanded ripple fade transition to reduce visible mid-distance lane:
    - `rippleLod = 1.0 - smoothstep(0.58, 0.82, farField)`.
  - Updated `waveNormal` finite-difference behavior:
    - `eps` now grows toward far field (stability-oriented derivative sampling for horizon/reflection calmness).
  - Decoupled interactive ripple-normal attenuation from base ripple-wave mask:
    - introduced `interactiveRippleMask` and mapped `rippleNormalLod` to it.
  - Added dedicated debug path for Phase D tuning:
    - new shader define `DEBUG_WAVE_LOD`,
    - `Landscape` debug mode now includes `Wave LOD` view (`R=farField`, `G=rippleLod`, `B=interactiveRippleMask`).
  - Synced docs baseline:
    - `README.md`,
    - `codex-system-prompt.md`.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Time-of-day extension + night glow coupling:
  - Added explicit post-sunset night behavior in `landscape.frag`:
    - `nightPhase(phase)` mask (`0.84..1.0`) now darkens sky and attenuates sun contribution after sunset.
  - Retuned glow timing/intensity to night window:
    - `title-glow.frag` now gates glow by `titleReveal * nightGlowReveal`,
    - `post/title-glow-composite.frag` adds night-phase boost for glow energy/alpha.
  - Added reflected title glow on water in `landscape.frag`:
    - billboard and phrase reflection paths now include a night-only glow contribution blended into `skyRefl`.
  - Synced baseline docs:
    - `README.md`,
    - `codex-system-prompt.md`.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Night regression hotfix (reflection framing + sunset shoreline palette):
  - Removed rectangular/contour framing artifact in reflected glow path:
    - in `sampleTitlePhraseReflectionCoverage`, added phrase-UV edge fade (`uvEdgeFade`) and contour-only halo shaping;
    - phrase reflection night-glow now uses halo-only mask (no fill-driven rectangle contribution).
  - Delayed night onset to preserve late sunset shoreline/underwater tones:
    - `nightPhase` and glow night boosts moved from `~0.84..1.0` to `~0.92..1.0`.
  - Synced docs wording to new thresholds and anti-frame behavior:
    - `README.md`,
    - `codex-system-prompt.md`.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Night shoreline color hotfix (visual water-retreat regression):
  - In `landscape.frag`, added `applyNightGrade(...)` helper and applied it to:
    - `bankMaterialBase(...)`,
    - shoreline contact palette (`bankShadow`, `shallowShelfTint`, `wetEdgeTint`) in shore path,
    - underwater shelf/edge palette in water path.
  - Goal: remove bright sandy shoreline carry-over in night phase and restore shoreline-water continuity.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Night reflection/glow + moonlight pass tuning:
  - In `landscape.frag`, refined reflected title glow composition:
    - billboard path now uses edge-weighted glow alpha (less flat fill),
    - phrase path boosts contour-halo contribution while keeping UV-edge suppression.
  - Added dedicated moonlight water track (night-gated):
    - `moonDirection(...)` helper,
    - cool moon reflection/specular terms parallel to sun-track model,
    - shoreline attenuation preserved to avoid bright contact seams.
  - Synced baseline docs:
    - `README.md`,
    - `codex-system-prompt.md`.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

### 2026-04-25

- Render/runtime safety and maintenance cleanup:
  - Removed dead reflection-only branch from `HeroTitlePass` shaders:
    - deleted `u_passMode`/`u_time` uniforms and mirrored-wobble reflection branch from `hero-title.vert`,
    - deleted reflection tint/reveal branch from `hero-title.frag`;
    - direct title rendering path stays unchanged in intent, while reflection remains in `landscape.frag` (Phase E path).
  - `HeroTitlePass` now receives `waterLevel` via frame state (`LandscapeScene` -> `HeroTitlePass`) instead of hardcoded `0`.
  - `HeroTitlePass` atlas/layout sync key strengthened:
    - replaced `glyphCount`-only key with signature including phrase size and hashes of GPU layout buffers.
- Camera/maths cleanup:
  - `computeSceneCamera` no longer accepts `scroll`; camera cache in `LandscapeScene` now invalidates by viewport size only.
  - Added explicit note in `LandscapeScene.resolveCamera()` for future cinematic motion: include motion phase/revision in cache key when camera animation is introduced.
  - Replaced repeated `Math.tan(camera.fovY * 0.5)` in ray/projection helpers with cached `camera.tanHalfFovY`.
- Dev UX and GL state hygiene:
  - `LandscapePass` now precompiles debug shader variants (`beauty/ripple/normals/reflection`) once; debug mode switch no longer recompiles/disposes programs at runtime.
  - `Program.setTexture` now handles `null` textures explicitly (bind + uniform), preventing potential stale texture state.
- Docs sync:
  - Updated `README.md` and `codex-system-prompt.md` camera-cache wording (`resize`-only recompute baseline).
  - Added explicit instruction to keep git commit messages concise and factual.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase H started (title glow pass):
  - Added `src/lib/shaders/title-glow.frag`:
    - fullscreen world-ray projection onto title billboard;
    - MSDF phrase-based halo layers (core/mid/outer) in linear space;
    - reveal gate synced with title (`0.62 → 0.88`) + water emergence mask.
  - Added `src/lib/passes/TitleGlowPass.ts`:
    - additive blend mode (`SRC_ALPHA, ONE`) for final composition;
    - debug isolate blend mode for `Pass=Glow`;
    - consumes `u_titlePhraseTex` + atlas pxRange metadata.
  - Updated `LandscapeScene` pipeline/order:
    - `LandscapePass → BushesPass → MorningFogPass → HeroTitlePass → TitleGlowPass → FinalColorPass`.
    - Added debug state fields: `passView="glow"` and `glowEnabled`.
  - Updated debug UI in `LandscapeViewport.svelte`:
    - new `Pass=Glow` mode;
    - new `Title Glow` toggle.
  - Phase H hotfixes (glow mask correctness + visibility):
    - rectangular slab artifact fixed: glow mask now derives glyph influence from blurred MSDF coverage
      (median RGB distance), so glow follows letter shapes instead of filling billboard rectangle;
    - low-visibility regression fixed: removed dependence on atlas alpha for occupancy, increased halo radii
      and composition weights in `title-glow.frag` to restore visible evening glow.
  - Phase H quality refactor (anti-jagged glow):
    - replaced single-pass pseudo blur with multi-pass bloom-style chain inside `TitleGlowPass`:
      - source generation (`title-glow.frag`) from MSDF phrase coverage;
      - separable gaussian blur (`post/title-glow-blur.frag`) with multiple radii in ping-pong buffers;
      - layered additive composite (`post/title-glow-composite.frag`).
    - moved blur into dedicated internal low-res buffers (0.75 scale) to improve smoothness/quality ratio.
  - Synced baseline docs (`README.md`, `codex-system-prompt.md`) for new pass order.
  - Validation:
    - `bun run check` passed.
    - `bun run build` passed.

### 2026-04-04

- Vegetation PoC (shoreline strip coverage):
  - Reworked `BushesPass` placement from sparse clumps to full shoreline strip coverage.
  - New PoC density:
    - `GRASS_COLUMNS=90`, `GRASS_ROWS=4`, `CARDS_PER_CLUMP=3` → `1080` instanced cards in one draw call.
  - Added deterministic seeded RNG (`0x5eedc0de`) for stable layout across hot reloads.
  - Added mild row staggering/depth offsets for layered grass silhouette and reduced visible grid artifacts.
  - Reference source captured for this iteration:
    - Codrops (`How to make the fluffiest grass with three.js`, 2025-02-04) as conceptual strip-instancing inspiration (no external libs integrated).
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Vegetation PoC refinement (readability + silhouette quality):
  - Added clustered distribution + intentional gaps in `BushesPass` placement (instead of uniform full-strip filling).
  - Added central readability corridor around title zone by reducing keep-probability near shoreline center.
  - Added deterministic cluster shaping (seeded sinusoidal masks + seeded RNG) to avoid regular “saw” horizon pattern.
  - Added horizon/distance atmospheric fade in `bushes.frag`:
    - far grass desaturation and haze blend near horizon,
    - distance-based alpha reduction to lower visual noise and alpha-overdraw dominance.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Vegetation PoC refinement (ground contact fix):
  - Addressed floating clumps in `BushesPass` by enforcing below-ground root bias (removed positive Y jitter).
  - Added per-card bury depth proportional to card height (`baseHeight`) so alpha-foot remains seated in shoreline.
  - Goal: remove “hovering” patches while preserving clustered silhouette and readability corridor.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Vegetation + fog integration fix:
  - Added vegetation-aware foging in `bushes.frag` (phase + view-distance + height based), so grass no longer reads above atmospheric layer.
  - Added `v_worldY` varying from `bushes.vert` for height-aware fog attenuation.
  - Added `u_debugView` toggle in `BushesPass`/`LandscapeScene` so `Pass=Vegetation` remains readable (fog/haze attenuation reduced in debug mode).
  - Smoothed fullscreen fog horizon ridge in `morning-fog.frag` (wider band, core suppression, x-breakup noise, lower bright contribution) to remove visible white seam near shoreline horizon transition.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase G follow-up (title hue lock):
  - Locked title ink to exact DayGlo target `#c9f08a` in linear pipeline.
  - Updated `hero-title.frag` base color constants to linear equivalents:
    - `TITLE_DAYGLO_LINEAR = vec3(0.584078418, 0.871367119, 0.254152094)`.
  - Updated `landscape.frag` fallback/direct title color and reflection base to the same DayGlo linear constant.
  - Goal: preserve exact display hue after moving display transfer to `FinalColorPass`.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase G started and completed:
  - Added `src/lib/passes/FinalColorPass.ts` + `src/lib/shaders/post/final-color.frag`.
  - Final rendering now uses linear offscreen composition in `sceneColor`:
    - `LandscapePass → BushesPass → MorningFogPass → HeroTitlePass`.
  - Added single display transfer pass at end:
    - `FinalColorPass`: `linear -> sRGB` (exact piecewise curve by default, with fast gamma fallback path in shader).
  - Updated pass base (`RenderPass`) with configurable output framebuffer target to avoid hardcoding direct backbuffer writes.
  - Removed early display gamma from `landscape.frag::tonemap()`; tone mapping remains in linear domain.
  - Baseline rationale documented from color refs:
    - GM Shaders Mini Oklab (`mini.gmshaders.com/p/oklab`),
    - Björn Ottosson (`oklab`, `colorwrong`, `colorpicker`),
    - GPU Gems 3, ch.24 (importance of linear workflow).
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase F (POC) started:
  - Added `src/lib/passes/MorningFogPass.ts` as a dedicated fullscreen atmosphere pass.
  - Added `src/lib/shaders/morning-fog.frag` with explicit tuning knobs:
    - `FOG_DISSIPATE_START`, `FOG_DISSIPATE_END`, `FOG_DENSITY`.
  - Integrated pass order in `LandscapeScene`: `LandscapePass → BushesPass → MorningFogPass → HeroTitlePass`.
  - Added debug pass view `Fog` in dev panel for isolated density/profile tuning.
  - Fog lifecycle rule in POC: strongest at dawn, dissipates by phase `~0.58` (before title reveal starts at `0.62`).
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase F (F1) continued:
  - Added analytic exponential height fog directly in `src/lib/shaders/landscape.frag`:
    - optical depth `tau` for non-constant density;
    - transmittance `T = exp(-tau)`;
    - fog compositing via `scene*T + fog*(1-T)`.
  - Applied fog by ray distance in sky/shore/water branches and kept title fogged by its own ray distance (`tTitle`) to avoid over-fogging when title is in front of shore.
  - Kept `MorningFogPass` as a secondary artistic layer and reduced its default density (`FOG_DENSITY=0.18`).
  - Sources documented in shader comments:
    - forwardscattering (height-fog derivation),
    - Scratchapixel (Beer-Lambert/transmittance),
    - IQ fog article.
  - Important nuance fixed/documented:
    - in non-constant density path, mix factor must be `1 - exp(-tau)`, not raw `tau`.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase F tuning pass:
  - Reduced analytic height fog strength in `landscape.frag` to avoid milkiness:
    - `MORNING_FOG_DENSITY 0.16 → 0.10`,
    - `MORNING_FOG_HEIGHT_FALLOFF 2.8 → 3.6`,
    - `MORNING_FOG_SKY_DISTANCE 18.0 → 12.0`,
    - horizon color blend reduced (`0.42 → 0.28`).
  - Reduced fullscreen wisp overlay density in `morning-fog.frag`:
    - `FOG_DENSITY 0.18 → 0.05`,
    - narrower horizon band (`0.18 → 0.14`),
    - stronger low-layer falloff (`3.0 → 4.0`),
    - added top-sky fade mask (`FOG_TOP_FADE_START/END`) to keep upper sky cleaner.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase F debug UX fix:
  - Fixed `Pass=Fog` black-screen debug view by adding explicit density-visualization mode in `MorningFogPass`.
  - `morning-fog.frag` now supports `u_debugDensity` and renders an opaque density heat preview for tuning.
  - `LandscapeScene` sets `debugDensity=true` only in fog debug mode; final mode keeps alpha blend compositing.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

### 2026-04-03

- Applied patch-set for `src/lib/shaders/landscape.frag`:
  - Added `u_shoreProfileTex` uniform.
  - Updated `cloudDensity(..., detailLOD)` and `shadeSkyDirection(..., cloudDetail)` signatures.
  - Updated all `shadeSkyDirection` call sites (direct sky = `1.0`, reflection = `0.0`).
  - Removed inline `shoreFbm` implementation body.
  - Switched shoreline/bank/shelf noise paths to `u_shoreProfileTex` lookups.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Hotfix (black screen shader compile):
  - Fixed `insideUnitSquare` usage before declaration in `landscape.frag` by replacing with local UV bounds checks inside phrase-sampling helpers.
  - Result: landscape shader compiles again, render restored.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase E quality tuning:
  - Precomposed phrase texture now uses mild supersampling (`x1.12`) within safe size caps.
  - Disabled mipmaps for phrase MSDF texture (linear sampling only) to reduce reflection blur.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Sunset title reveal animation:
  - Added late-day fade-in masks for direct title and reflection (reflection starts slightly later).
  - Added subtle scale-in during reveal window while keeping title world anchor fixed (no y-lift).
  - Applied to both MSDF path (`hero-title.frag`) and landscape fallback/reflection path (`landscape.frag`).
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase D (D1) started in `src/lib/shaders/landscape.frag`:
  - `waveFieldWithMasks` now early-outs when `rippleMask` is effectively zero.
  - Ripple contribution is softly faded and hard-disabled by `farField` cutoff region ending at `0.75`.
  - `waveNormal` finite-difference `eps` now scales with `viewDistance`.
  - Interactive ripple texture sampling is skipped when ripple LOD mask is zero.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase D tuning pass (visual smoothing):
  - `rippleLod` fade window adjusted to `smoothstep(0.66, 0.75, farField)` for earlier, smoother calm-down in mid/far water.
  - Interactive ripple-normal perturbation now scales with `rippleNormalLod` derived from `rippleWaveMask`.
  - Goal: reduce visible mid-distance ripple lane while keeping near-field interaction detail.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

- Phase E (E1) started:
  - Added precomposed title phrase MSDF texture in `LandscapeResources`.
  - `landscape.frag` reflection path now samples `u_titlePhraseTex` by local metric.
  - Removed per-fragment `MAX_TITLE_GLYPHS` loop path from `landscape.frag`.
  - `LandscapePass` now binds phrase reflection uniforms/texture and no longer uploads glyph arrays for landscape reflection.
- Validation:
  - `bun run check` passed.
  - `bun run build` passed.

## Status Update Rule

After each completed render/runtime iteration:

1. Update `Last updated` date.
2. Update affected row(s) in `Phase Dashboard`.
3. Append a short factual entry to `Change Log` (what changed + validation).
4. If baseline/invariants changed, sync `README.md` and `codex-system-prompt.md` in the same iteration.
