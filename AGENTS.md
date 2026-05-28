# AGENTS.md

Guidance for AI agents and contributors working in this repository. **Canonical render progress:** `docs/render-status.md`. **Invariants and shader contracts:** `codex-system-prompt.md`. **Human-facing overview:** `README.md`.

When render baseline or invariants change, update **all four** in the same iteration: this file, `README.md`, `codex-system-prompt.md`, `docs/render-status.md`.

## Project focus

SvelteKit + TypeScript host for a **custom WebGL2** procedural landscape (pond, shore, sky, water, vegetation, MSDF story title). Stay WebGL2-first — no three.js / Babylon / engine migration.

## Development commands

- Install: `npm install`
- Dev server: `npm run dev` → `http://127.0.0.1:4173`
- Type/Svelte check: `npm run check` (main validation gate; no dedicated `test` / `lint` scripts)
- Production build: `npm run build`
- Preview: `npm run preview` or `npm run start` → `http://127.0.0.1:4174`
- Grass atlas TIFF → PNG: `npm run atlas:convert`
- Hero title MSDF atlas: `npm run hero-title:generate` (**requires Bun** — script runs via `bun run`)

`bun run check` / `bun run build` are also used in docs/changelog; either npm or bun is fine if the command succeeds.

## High-level architecture

```text
src/routes/+page.svelte
  → LandscapeViewport.svelte     (canvas, dev debug UI + FPS)
    → Renderer.ts                (WebGL2 lifecycle, RAF, DPR resize)
      → LandscapeScene.ts        (input, FrameState, pass orchestration)
        → sceneCamera.ts, sceneFraming.ts, storyTimeline.ts
        → LandscapeResources.ts, shoreProfileBaker.ts
        → LandscapeSceneDebug.ts (dev only, via enableDebugViews)
        → passes/*.ts
```

**Boundaries**

| Module | Role |
|--------|------|
| `Renderer.ts` | Context, frame loop, resize — no scene shading |
| `LandscapeScene.ts` | Pass order, scroll → story/time-of-day, pointer → ripple UV, `buildFrameState()` |
| `LandscapeResources.ts` | GPU load/dispose: MSDF title, phrase reflection tex, foliage atlas, shore profile, ripple fallback |
| `LandscapeSceneDebug.ts` | Dev pass/view toggles; not used in production path |
| `sceneCamera.ts` | Static orbital camera, rays, title/water anchors, ripple UV |
| `storyTimeline.ts` | `computeStoryFrame()` → `StoryFrame` |
| `content/storySections.ts` | `STORY_SECTIONS` (mock CMS; Strapi later) |
| `passes/*.ts` | One pass, one role (`RenderPass` contract) |
| `gl/*` | `Program`, `FBO`, `DoubleFBO`, `FullscreenQuad`, textures |

## Render pipeline (current baseline)

Depth test **off** — layering is pass order (painter's algorithm).

```text
Simulation:
  RipplePass → ripple texture

Linear offscreen (sceneColor FBO):
  LandscapePass → BushesPass → MorningFogPass → HeroTitlePass → TitleGlowPass

Display:
  FinalColorPass   (single linear → sRGB transfer)
```

Do **not** reorder scene layers without updating invariants and docs. `MorningFogPass` stays before `HeroTitlePass` (title crisp over atmosphere). `TitleGlowPass` runs after title in linear space, before display transfer.

## Scene and scroll semantics (Phase 6)

- **`scrollNorm` (0–1) = time of day**, not camera orbit. Ordering: `0=start`, `0.2=dawn`, `0.5=day`, `1.0=late-sunset`.
- **Camera is static** (`yaw≈-0.08`, `pitch≈0.068`, `radius≈2.92`). Cached in `LandscapeScene`; recompute on **viewport resize only** (not on scroll). Future cinematic motion must extend cache key via `shotProgress` / motion revision — see comment in `resolveCamera()`.
- **Night / moon** are not in the active shader graph; do not reintroduce `night.glsl` or night-grade paths without an explicit product decision.
- **Morning fog:** dissipates `0.18→0.36`; analytic height fog in landscape shader; fullscreen wisps in `MorningFogPass`.
- **Title reveal:** direct title, water reflection, and glow share `titleReveal(phase)` from `title_timing.glsl`. **Default:** `TITLE_REVEAL_END <= TITLE_REVEAL_START` (both `0.0`) → visible from scroll 0 / section 1. Optional late-sunset: set `0.78` / `0.94` in `constants.glsl` + `sceneCamera.ts`.
- **Title world anchor:** pond center `TITLE_WORLD_Z_NEAR≈0.35`; fixed Y (`WATER_LEVEL + height*0.5 + 0.06`) — no `baseLift`.

## Story titles (Phase I)

- Sections: `STORY_SECTIONS` in `src/lib/content/storySections.ts` (mock; target: Strapi). No legacy title-content alias types.
- Per frame: `computeStoryFrame(scrollNorm, sectionCount)` → `sectionIndex`, `sectionProgress`, `shotProgress`, `timeOfDayPhase` (currently identity-mapped to scroll).
- `LandscapeScene.buildFrameState()` picks active section text → cached `HeroTitleAtlasRenderData` (MSDF + precomposed phrase texture for reflection/glow).
- **MSDF is primary** for on-screen title; canvas texture remains for **landscape reflection fallback only**, not title selection.
- CPU sets `u_titleWorldSize` with `textAspect` already applied — **do not re-derive width from `layoutAspect` in `hero-title.vert`** (use `u_titleWorldSize.x` / `.y` as-is).

## Dev vs production

- `LandscapeViewport` creates `LandscapeSceneDebugController` only when `import.meta.env.DEV`.
- Without debug controller, scene renders **final path only**.
- `LandscapePass` compiles debug shader variants (`beauty`, `ripple`, `normals`, `reflection`, `waveLod`) only when `enableDebugViews: true`.
- FPS exposed via `Renderer.getFPS()` in dev panel.

## Shader layout

Active landscape fragment entry: `src/lib/shaders/landscape/_entry.frag` (Vite `#include` plugin resolves chunks in dev/build).

Domains under `src/lib/shaders/landscape/`: `sky`, `shore`, `water_waves`, `water_shade`, `clouds`, `fog`, `title`, `debug_views`, etc. Legacy monolith `landscape.frag` is not the active entry.

Other shaders: `bushes.*`, `morning-fog.frag`, `hero-title.*`, `title-glow.frag`, `post/title-glow-blur.frag`, `post/title-glow-composite.frag`, `post/final-color.frag`, `ripple.frag`.

## Key invariants (do not break)

1. Ripple affects **water normals only**, not direct water color.
2. `u_shoreProfileTex`: R=baselineSilhouette, G=bankNoise, B=shelfNoiseSrc; no inline `shoreFbm` in fragment path.
3. `SceneCameraState.tanHalfFovY` — use cached value in passes; no per-frame `Math.tan(fovY/2)`.
4. `cloudDensity(..., detailLOD)`: direct sky `1.0`, reflection `0.0`.
5. Pass order: `landscape → bushes → morningFog → heroTitle → titleGlow → finalColor`.
6. Title reflection in landscape: sample `u_titlePhraseTex` by local metric — **no per-fragment glyph loops**.
7. Fog: non-constant density → transmittance `T=exp(-tau)`, mix `1-T`. If using late-sunset title reveal, keep `FOG_DISSIPATE_END(0.36) < TITLE_REVEAL_START`.
8. **Single display gamma:** only `FinalColorPass` (`linear → sRGB`); scene passes stay linear.
9. Vegetation placement: **seeded RNG**, not `Math.random()`.
10. Reflected title glow in water: **disabled** (artifact baseline). No `haloAlpha` compositing into reflection fill.
11. Title ink: DayGlo `#c9f08a` (linear constants in hero-title + landscape).

Full list and code patterns: `codex-system-prompt.md` §5–7.

## Performance baseline (already landed)

| Area | Approach |
|------|----------|
| Shore noise | 512×1 baked profile (`shoreProfileBaker.ts`) |
| Cloud reflection | `detailLOD=0` |
| Title reflection | Precomposed phrase MSDF texture |
| Camera | Cache on resize; `tanHalfFovY` once per recompute |
| Water waves | Warp computed once per sample site (Phase 6.2) |

## Scene runtime toggles

- `src/lib/scene/sceneConfig.ts` — non-shader flags (e.g. `TITLE_GLOW_ENABLED` for `TitleGlowPass` in final pipeline).
- In dev, debug panel `Title Glow` checkbox overrides `TITLE_GLOW_ENABLED` for the session.

## Active work (see `docs/development-plan.md`)

Prioritized stabilization before new features:

1. **Phase D** — wave normal LOD (finish QA per `render-status.md` § Phase D Visual QA)
2. **Phase E** — phrase reflection visual parity
3. **Phase F / H** — fog and title glow art tuning
4. **Vegetation PoC** — density/atlas variety
5. **Refactor phases 1–5** — chunk/resource split (in progress)
6. Later: Strapi story sections, cinematic camera via `shotProgress`, Phase 3 volumetrics

## Files to update when render baseline changes

| File | What to update |
|------|----------------|
| `docs/render-status.md` | Date, Phase Dashboard, Change Log + validation commands |
| `README.md` | Architecture summary, completed phases, next iterations |
| `codex-system-prompt.md` | Invariants, pipeline, scene baseline |
| `AGENTS.md` (this file) | Agent-oriented summary aligned with the above |

Optional deep guides: `docs/landscape-refactor-guide.md`, `docs/title-reflection-glow-postmortem.md`.

## Definition of done (render/runtime change)

- Intended visual behavior preserved or explicitly changed.
- `npm run check` (or `bun run check`) — 0 errors.
- `npm run build` succeeds.
- Invariants above still hold.
- Four-way doc sync (render-status, README, codex-system-prompt, AGENTS.md).
- Git commit only when user asks; message factual and scoped.

## What NOT to do

- Migrate to a 3D engine or add passes beyond `MorningFogPass`, `TitleGlowPass`, `FinalColorPass` without explicit request.
- Reintroduce `shoreFbm`, night/moon paths, `baseLift`, scroll-driven camera orbit, or glyph loops in `landscape.frag`.
- Reorder scene passes or apply display gamma before `FinalColorPass`.
- Use `Math.random()` for vegetation instances.
- Commit secrets (`.env`, API tokens).
