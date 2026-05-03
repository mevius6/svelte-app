# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project focus

This is a SvelteKit + TypeScript app with a custom WebGL2 render pipeline for a procedural landscape scene. The rendering stack is intentionally modular and should stay WebGL2-first (no engine migration).

## Development commands

Use these as the default workflow:

- Install deps: `npm install`
- Start local dev server (fixed host/port): `npm run dev` (127.0.0.1:4173)
- Type/Svelte checks: `npm run check`
- Build production bundle: `npm run build`
- Preview production build locally: `npm run preview` (or `npm run start`) (127.0.0.1:4174)

Testing/linting status in this repo:

- There is currently no dedicated `test` or `lint` npm script.
- “Single test” execution is not currently applicable because no unit/integration test runner is configured.
- Use `npm run check` as the main validation gate.

Asset-generation commands:

- Convert grass atlas TIFFs to runtime PNGs: `npm run atlas:convert`
- Regenerate hero title MSDF atlas: `npm run hero-title:generate` (requires `bun`, because script runs via `bun run ...`)

## High-level architecture

Primary runtime flow:

`src/routes/+page.svelte`
→ `src/lib/components/LandscapeViewport.svelte` (thin Svelte host with canvas + dev debug UI)
→ `src/lib/render/Renderer.ts` (WebGL lifecycle, RAF loop, DPR resize)
→ `src/lib/scene/LandscapeScene.ts` (input, frame state, pass orchestration)

Key boundaries:

- `src/lib/render/Renderer.ts`: owns WebGL context lifecycle and frame loop; does not hold scene-specific shading logic.
- `src/lib/scene/LandscapeScene.ts`: orchestrates pass order, scroll phase, pointer->water interaction mapping, and debug views.
- `src/lib/scene/LandscapeResources.ts`: owns GPU resource creation/loading/disposal (title textures, foliage atlas textures, ripple fallback, shore profile texture).
- `src/lib/scene/sceneCamera.ts`: world/camera math, world-space anchors, ray helpers, ripple UV mapping.
- `src/lib/passes/*.ts`: each pass has a focused role; shared pass contract is `src/lib/render/RenderPass.ts`.
- `src/lib/gl/*.ts`: low-level GL primitives (`Program`, `FBO`, `DoubleFBO`, fullscreen quad, context creation).

## Render pipeline (current baseline)

Depth testing is disabled; layering is defined by pass order (painter’s algorithm). Keep this order:

1. `RipplePass` (simulation texture)
2. Linear offscreen composition to `sceneColor`:
  - `LandscapePass`
  - `BushesPass`
  - `MorningFogPass`
  - `HeroTitlePass`
3. `FinalColorPass` (single linear → sRGB display transfer)

Important behavior assumptions wired through the scene/camera/shaders:

- Scroll is treated as time-of-day phase, not camera orbit movement.
- Camera is effectively static and cached unless viewport/scroll invalidates the cache.
- Ripple affects water normals/surface response via ripple texture input.
- `LandscapePass` samples pre-baked shore profile texture from `LandscapeResources` (avoid reintroducing expensive inline shoreline FBM in fragment path).

## Files to update when render baseline changes

When making meaningful render/runtime changes, keep status docs in sync:

- `docs/render-status.md` (date, phase dashboard, concise changelog entry with validation commands)
- `README.md` (baseline architecture/behavior updates)
- `codex-system-prompt.md` (project invariants and active pipeline assumptions)