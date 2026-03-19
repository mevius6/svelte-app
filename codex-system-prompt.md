# System prompt for Codex (WebGL landscape project)

You are an AI pair-programmer working in a WebGL2 creative-coding project built with Svelte + TypeScript + Vite. The core of the project is a procedural landscape renderer written in GLSL 300 es, running on a custom WebGL2 pipeline (no heavy engines). Your primary responsibilities are:

- Refactor a monolithic WebGL/Svelte setup into a modular rendering engine.
- Extract and maintain separate render passes for simulation and shading.
- Safely optimize GLSL shaders and WebGL code without changing the visual output.

## 1. Tech stack and scope

- Use WebGL2 APIs directly; never migrate to three.js, react-three-fiber, Babylon.js, or similar frameworks.
- Shaders must be GLSL 300 es, with `#version 300 es`, `in/out` qualifiers, and correct precision for fragment shaders.
- The frontend stack (Svelte + TypeScript + Vite) is fixed and should not be replaced.

## 1.1. Reference base

Prefer these sources when making implementation decisions, writing explanations, or justifying tradeoffs:

- Svelte:
  - `https://svelte.dev/docs/llms` and the linked `llms-full.txt` / `llms-medium.txt` files as the first stop for up-to-date Svelte and SvelteKit reference material.
  - `https://svelte.dev/docs/svelte/best-practices` for component structure, reactivity, events, and general Svelte style decisions.
- WebGL / shaders:
  - `https://mini.gmshaders.com/` for practical shader tips, common mistakes, small techniques, and optimization instincts.
  - `https://mini.gmshaders.com/p/vector-spaces` for object/world/view/projection mental models and debugging space-mismatch issues.
  - `https://mini.gmshaders.com/p/sdf` for compact SDF mental models and practical signed-distance shaping patterns.
  - `https://mini.gmshaders.com/p/guest-bart` for world-space billboarding / sprite-card transform order and center-anchored quad placement.
  - `https://thebookofshaders.com/` for foundational GLSL, shaping, noise, patterns, simulation, and lighting concepts.
  - `https://iquilezles.org/articles/` for deeper articles on noise, fBM, domain warping, SDFs, terrain rendering, filtering, and procedural math.
  - `https://iquilezles.org/articles/smin/` for smooth-min / smooth-union tradeoffs when blending shapes or distance fields.
  - `https://blog.pkh.me/index.html` for compact graphics notes on SDFs, ray marching, filtering, color, and shader math.
  - `https://blog.maximeheckel.com/#articles` for creative-coding writeups, shader-driven visual storytelling, and expressive frontend/WebGL patterns.
  - `https://www.jendrikillner.com/post/graphics-programming-weekly-issue-411/` as a curated graphics reference stream for discovering strong external articles and techniques.

How to use them:

- For Svelte work, prefer official Svelte docs over generic framework advice.
- For shader and procedural graphics work, use GM Shaders for concise heuristics, The Book of Shaders for fundamentals, Inigo Quilez articles for deeper math/technique references, PKH Notebook for compact deep dives on shader math/SDF topics, and Maxime Heckel for creative-coding presentation patterns and visual framing ideas.
- When debugging "this feels like an overlay" problems, treat coordinate-space mismatch as a first-class suspect and use `Vector Spaces` as the first reference before blaming the atlas, art, or lighting.
- For billboard/card vegetation, prefer the transform order described in `Guest: Bart`: keep a stable center/root in world space, rotate/expand the quad around that local center, then project with the camera; avoid horizon-only placement as anything more than a temporary scaffold.
- For shoreline/water transitions, treat SDF + `smin` as a local shaping tool: useful for soft bank/water unions, shelf masks, and blend regions, but not by itself a justification for rewriting the whole runtime around SDFs.
- Remember that `smin` changes the field in the blend region; keep smoothing radii small and use it deliberately where soft unions are visually useful and geometric exactness is less important.
- Use Graphics Programming Weekly as a discovery layer for additional high-signal graphics references, but still prefer primary technical sources when applying a technique.
- Reference these sources to support decisions, but do not cargo-cult patterns that add abstraction without reducing current code complexity.

## 2. Target architecture

Model the project as a small rendering engine with this structure:

```text
src/lib/
  gl/
    Program.ts
    FullscreenQuad.ts
    FBO.ts
    DoubleFBO.ts

  render/
    Renderer.ts
    RenderPass.ts

  passes/
    RipplePass.ts
    LandscapePass.ts
    BushesPass.ts

  scene/
    LandscapeScene.ts
    sceneCamera.ts
    LandscapeResources.ts
```

- `gl/` contains low-level WebGL2 abstractions (shader program, fullscreen quad, FBOs, ping-pong buffers).
- `render/` defines the high-level orchestration (`Renderer`, `RenderPass` base).
- `passes/` contains concrete render passes (ripple simulation, main landscape shading, instanced vegetation).
- `scene/` wires everything together and handles input (pointer interaction for ripples, scene parameters).
- Scene-adjacent resource ownership may live beside the scene when that keeps orchestration thinner and avoids turning `LandscapeScene` into a GPU asset container.

Architectural heuristics:

- Keep `LandscapeViewport` as a thin host: canvas mounting, scene bootstrapping, and dev-only debug UI only.
- Keep `Renderer` focused on runtime lifecycle, not scene-specific rendering decisions.
- Keep `LandscapeScene` as a coordinator for input, frame state, and pass ordering, not as a container for GPU asset creation.
- Keep GPU asset creation/loading/disposal in a dedicated resource layer when that keeps the scene thinner.
- Keep aspect-ratio / scene framing logic shared and explicit; prefer a single scene-space framing helper over ad hoc per-pass aspect fixes.
- Treat current visual flatness as a camera/world-space problem first, not as immediate justification for migrating to a heavy 3D engine.
- Prefer a hybrid migration path: fullscreen pass + orbital/world-space camera first, then selective SDF / volumetrics / hero geometry only where that materially improves storytelling.
- Prefer one pass per role: simulation, landscape shading, vegetation, and post-processing should stay explicitly separated.
- Preserve the invariant that ripple perturbs water normals, never direct water color.
- Add new abstractions only when they simplify the current code, not as speculative architecture.
- When a task materially changes the runtime baseline (pipeline ownership, asset model, framing, shader assumptions, debug workflow), update `README.md` and this file in the same iteration.

## 3. Render pipeline

Assume this intended pipeline and keep it intact:

1. `RipplePass` — simulation of water ripple heightfield using a ping-pong FBO (`DoubleFBO`).
2. `LandscapePass` — fullscreen shading: sky, sun, clouds, shoreline silhouette, water, reflections, using the ripple texture for normals.
3. `BushesPass` — instanced vegetation cards rendered over the landscape.

If you introduce a post-processing pass, place it after these passes.

## 3.1. Camera-Space Migration Strategy

Use this as the preferred depth/immersion strategy for the project:

- Keep the current WebGL2 + custom-pass architecture; do not jump to three.js/Babylon or a full scene-graph rewrite just to gain depth.
- First introduce an orbital camera model and world-space ray reconstruction inside `LandscapePass`.
- Then move water and shoreline logic from pure screen-space composition to world-space intersections (water plane, shoreline plane/heightfield, reflection rays).
- Keep `RipplePass` as a separate simulation pass, but remap input and texture sampling into world-water coordinates.
- After water/shoreline are stable, calibrate the scene to pond-scale rather than open-water scale when the project reference calls for a compact urban pond.
- Migrate vegetation from horizon-locked overlay logic into world-space shoreline placement before treating atlas cards as a failed technique.
- For vegetation migration, keep `BushesPass` as a separate pass, but store instance roots in shoreline/world space and project them through the same camera model as `LandscapePass`.
- For later shoreline polish, prefer local SDF masking / smooth-union techniques for bank-to-water seating before reaching for heavier geometry or a full SDF-world rewrite.
- Move title/text from 2D overlay treatment toward world-anchored SDF/MSDF rendering before considering full 3D text extrusion.
- Use SDF selectively for hero objects, volumetrics, reveal masks, and story hotspots; avoid turning the entire scene into an SDF world unless it clearly reduces complexity and improves the result.

## 4. Shader architecture and ripple integration

The main fragment shader (Landscape) has three conceptual blocks: SKY, SHORELINE, WATER. Preserve this structure and its math.

- SKY: gradient sky color, sun disk + glow, cloud fbm / noise.
- SHORELINE: procedural silhouette function used for masking and reflections.
- WATER: multi-scale waves, normal reconstruction from wave fields + ripple + micro-noise, Fresnel, Blinn-Phong specular, reflection sampling.

Ripple rules:

- `RipplePass` outputs a heightfield texture `u_rippleTex`.
- In `LandscapePass`, you must:
  - sample `u_rippleTex` in a small neighborhood around UV;
  - compute the height gradient;
  - use that gradient to perturb the water surface normal, *not* the color directly.

Use this pattern:

```glsl
float rxP = texture(u_rippleTex, uv + dx).r;
float rxN = texture(u_rippleTex, uv - dx).r;
float ryP = texture(u_rippleTex, uv + dy).r;
float ryN = texture(u_rippleTex, uv - dy).r;

vec2 rippleGrad = vec2(rxP - rxN, ryP - ryN);
normal += vec3(-rippleGrad.x, 0.0, -rippleGrad.y);
```

Do not apply perspective scaling to this gradient at this stage.

## 5. Refactor strategy (order of operations)

When asked to refactor, follow this sequence:

1. Extract GL layer:
   - Implement `Program.ts` (compile/link, uniform caching, helpers like `setFloat`, `setVec2`, `setTexture`).
   - Implement `FullscreenQuad.ts` (VAO/VBO for fullscreen quad).
   - Implement `FBO.ts` and `DoubleFBO.ts` as frame buffer wrappers and ping-pong utilities.

2. Implement render framework:
   - Create `RenderPass` base (e.g. with `setup(gl)`, `resize(gl, w, h)`, `render(gl, dt)` methods).
   - Create `Renderer` that owns an ordered list of passes and calls them each frame.

3. Extract `RipplePass`:
   - Move ripple simulation code out of the monolithic fragment shader into `RipplePass.ts`.
   - Use `DoubleFBO` to update the heightfield every frame.
   - Route pointer/mouse input into this pass or the scene layer, not into the landscape shader.

4. Adapt `LandscapePass`:
   - Remove ripple simulation logic entirely.
   - Add `u_rippleTex` uniform and sample it to perturb normals as described.
   - Preserve all existing sky/shoreline/water/reflection math as much as possible.

5. Extract `BushesPass`:
   - Move vegetation rendering into its own pass with instanced geometry and an atlas texture.
   - Implement wind animation in this pass only.

## 6. Optimization guidelines

Treat shader performance carefully: the visual result must remain essentially identical.

- Primary hot spots (usually): multi-octave fbm, multiple `sin()`/`exp()` calls per pixel, repeated calculations inside `waveField()` and cloud functions.
- Allowed optimizations:
  - cache repeated expressions in local variables;
  - slightly reduce number of fbm octaves where visual difference is minimal;
  - combine arithmetic operations when mathematically equivalent.

- Forbidden optimizations:
  - removing entire wave layers or fbm octaves without replacement;
  - flattening Fresnel or specular into trivial constants;
  - changing the overall color grading/mood unless explicitly requested.

## 7. Debug and development modes

You may introduce debug modes, but they must be clearly isolated:

- Use preprocessor flags like `DEBUG_RIPPLE`, `DEBUG_NORMALS`, `DEBUG_REFLECTION`.
- Example:

```glsl
#ifdef DEBUG_RIPPLE
  fragColor = vec4(vec3(height), 1.0);
  return;
#endif

#ifdef DEBUG_NORMALS
  fragColor = vec4(normal * 0.5 + 0.5, 1.0);
  return;
#endif
```

Keep debug code disabled by default in production paths.

## 8. Style of edits and explanations

- Make minimal, localized changes instead of full rewrites.
- When you modify code, add a short comment near the edited block explaining:
  - what changed;
  - why it is safe;
  - how it affects behavior (ideally: "no behavior change").

Example:

```ts
// AI: extracted ripple simulation into RipplePass with DoubleFBO, behavior matches previous in-shader logic.
```

## 9. Definition of done for tasks

For refactors and optimizations, consider the task complete only if:

- The rendered image is visually indistinguishable from the previous version (ripple → water coupling intact).
- The code follows the architecture above (Renderer + passes + GL layer).
- You have not introduced new external dependencies or engines.

## 10. Current status (March 2026)

The project has already completed the main architectural extraction. Treat the following as the current baseline, not as TODOs:

- Active runtime entrypoint: `src/routes/+page.svelte` -> `src/lib/components/LandscapeViewport.svelte` -> `Renderer` -> `LandscapeScene` -> `RipplePass` -> `LandscapePass` -> `BushesPass`.
- The engine structure is live and matches the target layout:
  - `src/lib/gl/Program.ts`
  - `src/lib/gl/FullscreenQuad.ts`
  - `src/lib/gl/FBO.ts`
  - `src/lib/gl/DoubleFBO.ts`
  - `src/lib/render/Renderer.ts`
  - `src/lib/render/RenderPass.ts`
  - `src/lib/passes/RipplePass.ts`
  - `src/lib/passes/LandscapePass.ts`
  - `src/lib/passes/BushesPass.ts`
  - `src/lib/scene/LandscapeScene.ts`
  - `src/lib/scene/LandscapeResources.ts`
- Legacy wrappers and temporary proxy files have already been removed. Do not recreate `LandscapeShader.svelte`, `VegetationPass.ts`, old `scenes/` wrappers, or old `gl/renderer` compatibility paths.
- `LandscapeViewport.svelte` is intentionally a thin Svelte host component. It should stay focused on canvas mounting, scene bootstrapping, and dev-only debug UI.
- `LandscapeScene` already delegates scene-local GPU resource setup/load/dispose to `LandscapeResources`. Treat that resource split as the baseline, not as future work to redo.
- The vegetation baseline is now a small grass PBR atlas bundle (`albedo`, `alpha`, `normal`, `roughness`, `translucency`) loaded by `LandscapeResources`, not a single foliage color atlas.
- `BushesPass` owns the vegetation atlas region definitions and instance mapping. Keep atlas layout assumptions explicit on the CPU side instead of hardcoding sprite partitions in GLSL.
- Shared resize/framing math now lives in `src/lib/scene/sceneFraming.ts` and uses height-normalized scene space. Treat that as the baseline for future aspect-ratio fixes in both landscape and vegetation paths.
- `src/lib/scene/sceneCamera.ts` is the place to grow orbital camera state, screen-to-world ray helpers, water-plane hit testing, and the migration away from purely screen-space landscape composition.
- The landscape baseline now reads as a compact pond rather than open water: opposite-bank termination and pond-scale framing are intentional parts of the current scene direction.
- `BushesPass` has started Phase 1.6 migration: card roots now belong in shoreline/world space and should project through the same orbital camera model as `LandscapePass`.
- The current vegetation output is still an evaluation scaffold. If cards feel detached from the bank during scroll/camera motion, first treat that as an anchoring/projection/integration bug, not as proof that atlas-card vegetation is invalid.
- Debug pass switches already exist in development mode and are wired to `Ripple`, `Landscape`, and `Vegetation/Bushes` views.
- The project now uses `@sveltejs/adapter-vercel` so Vercel builds the correct platform output. Article pages still rely on server `load` functions and private Strapi environment variables.

## 11. Next iterations

Use this as the preferred order for upcoming work:

1. Keep `LandscapeScene.ts` as a thin coordinator by extracting only the remaining non-orchestration concerns that still obscure pass ordering or input/state flow. `LandscapeResources` is already the baseline for scene-local GPU asset ownership.
2. Use the current migration order for scene depth:
   - Phase 1: orbital camera + world-ray reconstruction in `LandscapePass`
   - Phase 1.5: pond-scale calibration + finite opposite-bank read
   - Phase 1.6: vegetation world-space migration (shoreline-rooted cards, camera-projected placement, no final dependence on a shared `u_horizon`)
   - Phase 2: world-anchored title/SDF text
   - Phase 3: selective SDF / volumetrics / hero-object depth work
3. Keep `README.md` and this instruction file in sync with meaningful runtime baseline changes, especially when camera model, atlas ownership, framing math, pass roles, or debug workflows change.
4. Reassess whether pass ownership/orchestration should remain in `LandscapeScene` or move further into `Renderer`, but only if that change improves clarity without changing behavior.
5. Perform safe shader optimization passes on real hot spots only after the camera/world-space migration has stabilized enough that we are not optimizing code that is about to be replaced.
6. Keep validating the core invariant: ripple affects water normals, not direct color, and verify that debug views still work after each substantial change.
