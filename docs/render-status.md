# Render Status Log

Last updated: 2026-04-04

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
| Phase D | Wave normal LOD for far field | In Progress | D1 landed: ripple far-field cutoff + distance-based normal `eps`; visual tuning continues. |
| Phase E | Title glyph loop isolation from `landscape.frag` | In Progress | E1 landed: reflection path uses precomposed phrase MSDF texture (no per-pixel glyph loop). |
| Phase F | Morning fog pass (dawn atmosphere) | In Progress | F1 landed: analytic height fog in `landscape.frag` + secondary fullscreen wisps pass. |
| Phase G | Linear color pipeline + final display transfer | Done | `sceneColor` offscreen composition + `FinalColorPass` (`linear -> sRGB` once per frame). |
| Vegetation PoC | Shoreline full-coverage grass strip | In Progress | `BushesPass` now tests dense shoreline grass (1080 cards total) with seeded placement. |

## Change Log

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
