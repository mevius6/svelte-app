# svelte-app

## Архитектура

Текущий WebGL runtime собран как небольшой рендер-движок поверх Svelte:

`+page.svelte` -> `LandscapeViewport.svelte` -> `Renderer` -> `LandscapeScene` -> passes

- `src/lib/components/LandscapeViewport.svelte` — тонкий Svelte-shell конкретной сцены: создаёт `canvas`, монтирует `Renderer`, показывает dev-only debug panel.
- `src/lib/render/Renderer.ts` — владеет WebGL2 context lifecycle, `requestAnimationFrame`, resize по DPR и вызовом активной сцены.
- `src/lib/scene/LandscapeScene.ts` — связывает input, scene state и GPU-ресурсы, затем запускает проходы в фиксированном порядке.
- `src/lib/passes/RipplePass.ts` — считает heightfield ряби в `DoubleFBO`.
- `src/lib/passes/LandscapePass.ts` — fullscreen shading неба, береговой линии и воды; ripple-текстура влияет на нормали воды.
- `src/lib/passes/BushesPass.ts` — рисует инстансную растительность поверх ландшафта.
- `src/lib/gl/` — низкоуровневые WebGL-абстракции: `Program`, `FullscreenQuad`, `FBO`, `DoubleFBO`, `Context`.

Активный render pipeline сейчас такой:

1. `RipplePass`
2. `LandscapePass`
3. `BushesPass`

Post-processing в активный pipeline пока не подключён.

Deployment/runtime: проект собирается через `@sveltejs/adapter-node`, потому что статьи загружаются в server `load` и используют private env для Strapi. Production-сборка запускается командой `npm run start`.

## Структура проекта

```text
src/lib/
  components/
    LandscapeViewport.svelte

  gl/
    Context.ts
    Program.ts
    FullscreenQuad.ts
    FBO.ts
    DoubleFBO.ts
    texture.ts

  render/
    Renderer.ts
    RenderPass.ts

  scene/
    Scene.ts
    LandscapeScene.ts

  passes/
    RipplePass.ts
    LandscapePass.ts
    BushesPass.ts

  shaders/
    landscape.vert
    landscape.frag
    ripple.frag
    bushes.vert
    bushes.frag
    post/
      tonemap.frag
```
