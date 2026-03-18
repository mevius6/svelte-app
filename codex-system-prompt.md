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
  - `https://thebookofshaders.com/` for foundational GLSL, shaping, noise, patterns, simulation, and lighting concepts.
  - `https://iquilezles.org/articles/` for deeper articles on noise, fBM, domain warping, SDFs, terrain rendering, filtering, and procedural math.

How to use them:

- For Svelte work, prefer official Svelte docs over generic framework advice.
- For shader and procedural graphics work, use GM Shaders for concise heuristics, The Book of Shaders for fundamentals, and Inigo Quilez articles for deeper math/technique references.
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
```

- `gl/` contains low-level WebGL2 abstractions (shader program, fullscreen quad, FBOs, ping-pong buffers).
- `render/` defines the high-level orchestration (`Renderer`, `RenderPass` base).
- `passes/` contains concrete render passes (ripple simulation, main landscape shading, instanced vegetation).
- `scene/` wires everything together and handles input (pointer interaction for ripples, scene parameters).

Architectural heuristics:

- Keep `LandscapeViewport` as a thin host: canvas mounting, scene bootstrapping, and dev-only debug UI only.
- Keep `Renderer` focused on runtime lifecycle, not scene-specific rendering decisions.
- Keep `LandscapeScene` as a coordinator for input, frame state, and pass ordering, not as a container for GPU asset creation.
- Keep GPU asset creation/loading/disposal in a dedicated resource layer when that keeps the scene thinner.
- Prefer one pass per role: simulation, landscape shading, vegetation, and post-processing should stay explicitly separated.
- Preserve the invariant that ripple perturbs water normals, never direct water color.
- Add new abstractions only when they simplify the current code, not as speculative architecture.

## 3. Render pipeline

Assume this intended pipeline and keep it intact:

1. `RipplePass` — simulation of water ripple heightfield using a ping-pong FBO (`DoubleFBO`).
2. `LandscapePass` — fullscreen shading: sky, sun, clouds, shoreline silhouette, water, reflections, using the ripple texture for normals.
3. `BushesPass` — instanced vegetation cards rendered over the landscape.

If you introduce a post-processing pass, place it after these passes.

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
- Legacy wrappers and temporary proxy files have already been removed. Do not recreate `LandscapeShader.svelte`, `VegetationPass.ts`, old `scenes/` wrappers, or old `gl/renderer` compatibility paths.
- `LandscapeViewport.svelte` is intentionally a thin Svelte host component. It should stay focused on canvas mounting, scene bootstrapping, and dev-only debug UI.
- Debug pass switches already exist in development mode and are wired to `Ripple`, `Landscape`, and `Vegetation/Bushes` views.
- The project now uses `@sveltejs/adapter-node` because article pages rely on server `load` functions and private Strapi environment variables. Production runtime is Node-based.

## 11. Next iterations

Use this as the preferred order for upcoming work:

1. Reduce `LandscapeScene.ts` to a thinner coordinator by extracting texture/resource creation and loading helpers out of the scene.
2. Reassess whether pass ownership/orchestration should remain in `LandscapeScene` or move further into `Renderer`, but only if that change improves clarity without changing behavior.
3. Perform safe shader optimization passes on real hot spots (`cloudFbm`, cloud density, wave/normal/reflection repetition), preserving the current image.
4. Keep validating the core invariant: ripple affects water normals, not direct color.
5. After each substantial change, verify that debug views still work and that the rendered image remains visually consistent with the current baseline.
