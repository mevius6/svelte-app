# svelte-app

## Архитектура

Текущий WebGL runtime собран как небольшой рендер-движок поверх Svelte:

`+page.svelte` -> `LandscapeViewport.svelte` -> `Renderer` -> `LandscapeScene` -> `LandscapeResources` + passes

По слоям это устроено так:

- host/UI layer: `src/lib/components/LandscapeViewport.svelte` — тонкий Svelte-shell конкретной сцены; создаёт `canvas`, монтирует `Renderer`, показывает dev-only debug panel.
- runtime layer: `src/lib/render/Renderer.ts` — владеет WebGL2 context lifecycle, `requestAnimationFrame`, resize по DPR и вызовом активной сцены.
- scene/orchestration layer: `src/lib/scene/LandscapeScene.ts` — связывает input, scroll/debug state и порядок проходов; координирует кадр, но не должен разрастаться в склад GPU-ресурсов.
- resource layer: `src/lib/scene/LandscapeResources.ts` — владеет загрузкой и жизненным циклом GPU-ресурсов сцены: title-texture, foliage atlas и fallback ripple texture.
- pass layer: `src/lib/passes/RipplePass.ts`, `src/lib/passes/LandscapePass.ts`, `src/lib/passes/BushesPass.ts` — отдельные рендер-проходы симуляции, fullscreen shading и инстансной растительности.
- GL layer: `src/lib/gl/` — низкоуровневые WebGL-абстракции: `Program`, `FullscreenQuad`, `FBO`, `DoubleFBO`, `Context`.

Практический смысл нового resource layer:

- `LandscapeScene` остаётся координатором, который знает, когда и в каком порядке использовать ресурсы.
- `LandscapeResources` инкапсулирует создание, загрузку, хранение и `dispose()` для текстур, чтобы scene-класс не держал в себе детали GPU asset management.
- Следующие рефакторинги сцены удобнее делать поверх этой границы ответственности, не затрагивая math и порядок проходов.

## Архитектурные принципы

- `LandscapeViewport` остаётся тонким host-слоем: canvas mounting, scene bootstrapping и dev-only debug UI.
- `Renderer` отвечает за runtime lifecycle, а не за смысл конкретной сцены.
- `LandscapeScene` координирует input, frame state и порядок проходов, но не должен разрастаться в контейнер GPU-ресурсов.
- `LandscapeResources` владеет созданием, загрузкой и освобождением GPU-ресурсов сцены.
- Один pass — одна роль: simulation, landscape shading, vegetation и возможный post-process держим раздельно.
- Ripple влияет на нормали воды, а не на цвет напрямую.
- Новые абстракции добавляем только там, где они уже уменьшают сложность текущего кода, а не впрок.

## Reference Base

Когда нужен внешний ориентир по решениям, стараемся опираться сначала на эти источники:

- Svelte docs for LLMs: `https://svelte.dev/docs/llms`
- Svelte Best Practices: `https://svelte.dev/docs/svelte/best-practices`
- GM Shaders Mini Tutorials: `https://mini.gmshaders.com/`
- The Book of Shaders: `https://thebookofshaders.com/`
- Inigo Quilez Articles: `https://iquilezles.org/articles/`

Практическое правило:

- По Svelte сначала сверяемся с официальной документацией и best practices.
- По GLSL, шумам, procedural math и shader-оптимизациям используем GM Shaders, The Book of Shaders и статьи Inigo Quilez как основную reference-базу.
- Ссылки нужны как опора для решений, а не как повод тащить в проект лишнюю абстракцию.

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
    LandscapeResources.ts

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
