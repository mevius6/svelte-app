# svelte-app

## Архитектура

Текущий WebGL runtime собран как небольшой рендер-движок поверх Svelte:

`+page.svelte` -> `LandscapeViewport.svelte` -> `Renderer` -> `LandscapeScene` -> `LandscapeResources` + passes

По слоям это устроено так:

- host/UI layer: `src/lib/components/LandscapeViewport.svelte` — тонкий Svelte-shell конкретной сцены; создаёт `canvas`, монтирует `Renderer`, показывает dev-only debug panel.
- runtime layer: `src/lib/render/Renderer.ts` — владеет WebGL2 context lifecycle, `requestAnimationFrame`, resize по DPR и вызовом активной сцены.
- scene/orchestration layer: `src/lib/scene/LandscapeScene.ts` — связывает input, scroll/debug state и порядок проходов; координирует кадр, но не должен разрастаться в склад GPU-ресурсов.
- resource layer: `src/lib/scene/LandscapeResources.ts` — владеет загрузкой и жизненным циклом GPU-ресурсов сцены: title-texture, foliage PBR atlas bundle и fallback ripple texture.
- framing layer: `src/lib/scene/sceneFraming.ts` — задаёт общую scene-space framing-модель, чтобы landscape и vegetation одинаково переживали resize.
- pass layer: `src/lib/passes/RipplePass.ts`, `src/lib/passes/LandscapePass.ts`, `src/lib/passes/BushesPass.ts` — отдельные рендер-проходы симуляции, fullscreen shading и инстансной растительности.
- GL layer: `src/lib/gl/` — низкоуровневые WebGL-абстракции: `Program`, `FullscreenQuad`, `FBO`, `DoubleFBO`, `Context`.

Практический смысл нового resource layer:

- `LandscapeScene` остаётся координатором, который знает, когда и в каком порядке использовать ресурсы.
- `LandscapeResources` инкапсулирует создание, загрузку, хранение и `dispose()` для текстур, чтобы scene-класс не держал в себе детали GPU asset management.
- `sceneFraming` инкапсулирует общую aspect/framing math, чтобы passes не чинили пропорции локальными ad hoc формулами.
- Следующие рефакторинги сцены удобнее делать поверх этой границы ответственности, не затрагивая math и порядок проходов.

## Архитектурные принципы

- `LandscapeViewport` остаётся тонким host-слоем: canvas mounting, scene bootstrapping и dev-only debug UI.
- `Renderer` отвечает за runtime lifecycle, а не за смысл конкретной сцены.
- `LandscapeScene` координирует input, frame state и порядок проходов, но не должен разрастаться в контейнер GPU-ресурсов.
- `LandscapeResources` владеет созданием, загрузкой и освобождением GPU-ресурсов сцены.
- Aspect-ratio/framing исправления делаем один раз в общей scene-space модели (`src/lib/scene/sceneFraming.ts`), а затем переиспользуем в `LandscapePass` и `BushesPass`.
- Один pass — одна роль: simulation, landscape shading, vegetation и возможный post-process держим раздельно.
- Ripple влияет на нормали воды, а не на цвет напрямую.
- Новые абстракции добавляем только там, где они уже уменьшают сложность текущего кода, а не впрок.
- После заметных runtime baseline-изменений обновляем `README.md` и `codex-system-prompt.md` в той же итерации, чтобы следующая работа опиралась на актуальное состояние проекта.

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

## Текущий baseline для vegetation и framing

- Вегетация больше не опирается на один color atlas. `LandscapeResources` загружает небольшой grass PBR bundle: `albedo`, `alpha`, `normal`, `roughness`, `translucency`.
- Runtime использует web-ready PNG-копии из `static/grass-atlas-web/`; TIFF-файлы в `static/grass-atlas/` считаются source assets для конвертации.
- `BushesPass` остаётся отдельным pass и владеет atlas region definitions, instancing и wind animation.
- Atlas mapping сделан через явные region rect'ы на CPU, а не через жёсткий layout hardcode в GLSL.
- Общая framing-модель height-normalized: при resize меняется горизонтальный охват сцены, а не вертикальные пропорции композиции.
- Эту framing-модель считают в `src/lib/scene/sceneFraming.ts` и прокидывают в `LandscapePass` и `BushesPass` как shared frame state.

Deployment/runtime: проект собирается через `@sveltejs/adapter-node`, потому что статьи загружаются в server `load` и используют private env для Strapi. Production-сборка запускается командой `npm run start`.

## Asset workflow

- Если обновился исходный grass atlas в `static/grass-atlas/*.tif`, сначала пересобираем web-runtime копии командой `npm run atlas:convert`.
- Runtime baseline сейчас завязан на `static/grass-atlas-web/*.png`; не переключать браузерный путь обратно на TIFF.
- После изменений в render baseline или shader/framing model синхронизируем `README.md` и `codex-system-prompt.md`.

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
    sceneFraming.ts

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

scripts/
  convert-grass-atlas.sh
```
