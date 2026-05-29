# Development Plan

Last updated: 2026-05-28

Companion to `docs/render-status.md` (phase status + changelog) and `AGENTS.md` (agent baseline). This document is the **prioritized execution plan** for the next iterations.

## Goal

Stabilize and ship the current modular WebGL2 pipeline **without visual regressions**, then connect CMS content and optional cinematic camera. Defer Phase 3 selective SDF / volumetrics until D, E, F, H, and vegetation baseline are done.

## Principles

1. **One iteration = one concern** — small diffs, explicit validation (`npm run check`, `npm run build`, dev visual QA).
2. **Docs in the same PR/iteration** — `render-status.md`, `README.md`, `codex-system-prompt.md`, `AGENTS.md`.
3. **Debug views before guessing** — use `Wave LOD`, `Pass=Fog`, `Pass=Glow`, `Normals`, `Reflection` before tuning constants blindly.
4. **No new full-screen passes** unless product explicitly requests.
5. **Seeded vegetation, static camera, linear FBO** — treat as hard constraints unless planning doc is updated first.

---

## Milestone 0 — Doc and contract hygiene ✅ (this iteration)

| Task | Status | Notes |
|------|--------|-------|
| Sync `AGENTS.md` with active pipeline (incl. `TitleGlowPass`, story timeline, debug split) | Done | Single agent-facing baseline |
| Add `docs/development-plan.md` | Done | This file |
| Verify `README.md` / `codex-system-prompt.md` already match pipeline | Ongoing | Spot-check when touching render |

**Exit criteria:** New contributor or agent can read `AGENTS.md` only and get correct pass order, scroll semantics, and doc sync rules.

---

## Milestone 1 — P0: Water LOD + title sizing (stabilization)

**Target:** Close Phase D; lock CPU/GPU title size contract.

### 1.1 Phase D — Wave normal LOD (finish)

**Owner surface:** `src/lib/shaders/landscape/domains/water_waves.glsl`, `landscape/main/landscape_main.glsl`, constants in landscape common.

**Work**

1. Run full checklist in `render-status.md` → **Phase D Visual QA** (phases 0, 0.25, 0.5, 0.75, 1.0 × near/mid/far water + pointer drops).
2. Tune only if checklist fails:
   - `WAVE_LOD_NEAR_DIST` / `WAVE_LOD_FAR_DIST`
   - `RIPPLE_FADE_START` / `RIPPLE_FADE_END` (current window `0.58–0.82`)
   - `WAVENORMAL_EPS_NEAR` / `WAVENORMAL_EPS_FAR`
   - `interactiveRippleMask` vs `rippleLod` decoupling
3. Use `DEBUG_WAVE_LOD` — channels must transition smoothly (no step bands).
4. Regression pass: shoreline contact, title reflection readability, morning fog unchanged.

**Exit criteria:** All items under **Phase D Done Criteria** in `render-status.md` pass → set Phase D to `Done` in Phase Dashboard.

**Validation:** `npm run check`, `npm run build`, manual dev QA at 127.0.0.1:4173.

### 1.2 Title aspect contract (CPU ↔ GPU)

**Owner surface:** `hero-title.vert`, `sceneCamera.ts` / title hero state, `landscape` title domain, `TitleGlowPass` uniforms.

**Work**

1. Confirm uncommitted fix: vertex uses `u_titleWorldSize.x/y` without second `layoutAspect` multiply.
2. Visual matrix: phrase title, single-digit sections (`"1"`…`"8"`), wide Cyrillic phrase (after Milestone 2 content restore).
3. Parity check: direct `HeroTitlePass`, `title-glow.frag`, phrase reflection in landscape (same `worldWidth` / `textAspect` rules as 2026-05-18 digit fix).

**Exit criteria:** No stretched/squashed titles in direct, glow, or reflection paths.

---

## Milestone 2 — P1: Reflection parity + atmosphere art

### 2.1 Phase E — Phrase MSDF reflection (finish)

**Owner surface:** `LandscapeResources` phrase bake, `landscape` title/reflection helpers, `LandscapePass` bindings.

**Work**

1. A/B `Pass=Reflection` vs beauty during title reveal window (`phase 0.78–0.94`, same mask as direct title).
2. Tune phrase texture generation if needed: supersample, pxRange, mip policy (linear only, no mips — per changelog).
3. Remove dead code paths only after parity confirmed.

**Exit criteria:** Phase E → `Done`; no visible blur/sharpness mismatch vs pre-E1 intent; no glyph loop restored.

### 2.2 Phase F — Fog tuning

**Owner surface:** `landscape/domains/fog.glsl`, `morning-fog.frag`, `MorningFogPass` uniforms.

**Work**

1. Art pass at dawn window (`0.18–0.36`): height fog density/falloff, horizon color blend, wisp density.
2. Confirm title readability at `0.78+` reveal; no milkiness at `0.5` day.
3. `Pass=Fog` density heatmap for tuning, then beauty check.

**Exit criteria:** Fog reads as designed on reference frames; Phase F can move to `Done` or `Done (POC)` with noted art debt.

### 2.3 Phase H — Title glow tuning

**Owner surface:** `TitleGlowPass`, `title-glow.frag`, blur/composite post shaders.

**Work**

1. Tune halo radii/weights in linear space; verify separable blur chain (no comb artifacts).
2. Compare `Pass=Glow` isolate vs `Final` at `phase 0.85–1.0`.
3. Do not re-enable reflected glow in water (postmortem: `docs/title-reflection-glow-postmortem.md`).

**Exit criteria:** Glow readable at sunset without slab/rectangle artifacts; Phase H → `Done`.

**Validation (Milestone 2):** Same as M1 + scroll checkpoints focused on `0.15–0.40` (fog) and `0.78–1.0` (title/glow).

---

## Milestone 3 — P2: Vegetation + structural refactor

### 3.1 Vegetation quality (PoC → baseline)

**Owner surface:** `BushesPass.ts`, `bushes.vert/frag`, `sceneCamera.ts`, `sceneConfig.ts`, grass atlas assets.

**Landed (2026-05-28):**

- Full bank-slope placement (not crest-only strip).
- Viewport-aware X coverage + resize rebuild (fullscreen/ultrawide).
- Scroll-synced sun shimmer on grass tips.
- `sceneConfig.ts` tuning knobs.

**Work remaining:**

1. Atlas: second silhouette region or variant cards (reduce single-clump sameness).
2. Placement: refine cluster masks + central readability corridor (already started).
3. Performance: watch overdraw at 1080 instances; consider column/row caps per viewport if needed.
4. Fog integration: keep height/distance fog in `bushes.frag`; verify no white horizon seam with `MorningFogPass`.

**Exit criteria:** Horizon “saw” reduced; ground contact stable; grass reads inside fog layer.

### 3.2 Refactor phases 1–5 (continue)

**Guide:** `docs/landscape-refactor-guide.md`

**Remaining (high level)**

| Step | Action | Risk |
|------|--------|------|
| 2 | Extract `TitleResources` from `LandscapeResources` | Low — isolated module |
| 3 | `FoliageAtlasLoader` | Low — mechanical |
| 4–5 | Chunk split complete; keep `_entry.frag` include order valid | Medium — compile/order bugs |

**Exit criteria:** `LandscapeResources` stays thin; shader domains editable without touching unrelated phases; `bun run check` + build green after each step.

---

## Milestone 4 — P3: Product integration + motion

### 4.1 Story content from Strapi

**Owner surface:** `src/lib/content/storySections.ts`, `+page.server.ts`, `LandscapeViewport` props, optional normalizer.

**Work**

1. Server load published story sections (or dedicated CMS type) when `STRAPI_API_ORIGIN` set.
2. Pass `StorySection[]` into scene init; keep local mock as dev fallback.
3. On content change: `npm run hero-title:generate` for new strings; cache invalidation by title text hash (existing pattern).

**Exit criteria:** Production can drive section titles without editing TS mock; graceful fallback when Strapi offline (document env vars).

### 4.2 Cinematic camera (optional, after M1–M3)

**Owner surface:** `storyTimeline.ts` (`shotProgress`), `sceneCamera.ts`, `LandscapeScene.resolveCamera()` cache key.

**Work**

1. Define shot curve per section (easing, anchor offsets) without moving time-of-day off `scrollNorm` unless designed.
2. Extend camera cache invalidation: viewport **or** `shotProgress` revision.
3. Do not break static baseline until shots are authored.

**Exit criteria:** At least one section demonstrates subtle camera motion; scroll still controls phase.

### 4.3 Visual regression anchors (recommended)

**Work**

1. Document 5–6 manual screenshot anchors (phase × viewport) in `render-status.md` or `docs/visual-qa.md`.
2. Optional later: Playwright + canvas capture (out of scope until requested).

---

## Milestone 5 — Deferred: Phase 3 volumetrics / selective SDF

**Gate:** Milestones 1–3 marked Done in Phase Dashboard; no open P0/P1 visual regressions.

**Work:** Per README “Phase 3 selective SDF/volumetrics” — scoped POC only, no monolith return.

---

## Suggested iteration order (sprints)

| Sprint | Focus | Primary exit |
|--------|--------|----------------|
| A | M0 + M1.2 | AGENTS synced; title aspect verified |
| B | M1.1 | Phase D Done |
| C | M2.1 + M2.2 | Phase E Done; fog tuned |
| D | M2.3 + M3.1 start | Phase H Done; vegetation pass 1 |
| E | M3.2 | Resource/chunk refactor tranche |
| F | M4.1 | Strapi story sections |
| G | M4.2–M4.3 | Camera POC + visual QA doc |

Adjust order if product needs Strapi titles earlier (pull M4.1 before M3.2 only with stable D/E).

---

## Per-iteration checklist (copy for PRs)

- [ ] Scope matches one milestone slice
- [ ] `npm run check` / `npm run build`
- [ ] Dev QA at relevant scroll phases
- [ ] Debug modes used where applicable (`Wave LOD`, etc.)
- [ ] `docs/render-status.md` updated
- [ ] `README.md` / `codex-system-prompt.md` / `AGENTS.md` if baseline changed
- [ ] No invariant violations (§ AGENTS.md / codex §5)

---

## References

- Phase status + QA: `docs/render-status.md`
- Refactor steps: `docs/landscape-refactor-guide.md`
- Glow pitfalls: `docs/title-reflection-glow-postmortem.md`
- Agent baseline: `AGENTS.md`
- Invariants: `codex-system-prompt.md`
