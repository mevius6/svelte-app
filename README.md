# svelte-app

## Архитектура

Текущий WebGL runtime собран как небольшой рендер-движок поверх Svelte:

`+page.svelte` -> `LandscapeViewport.svelte` -> `Renderer` -> `LandscapeScene` -> `sceneCamera` + `LandscapeResources` + passes

По слоям это устроено так:

- host/UI layer: `src/lib/components/LandscapeViewport.svelte` — тонкий Svelte-shell конкретной сцены; создаёт `canvas`, монтирует `Renderer`, показывает dev-only debug panel.
- runtime layer: `src/lib/render/Renderer.ts` — владеет WebGL2 context lifecycle, `requestAnimationFrame`, resize по DPR и вызовом активной сцены.
- scene/orchestration layer: `src/lib/scene/LandscapeScene.ts` — связывает input, scroll/debug state и порядок проходов; координирует кадр, но не должен разрастаться в склад GPU-ресурсов.
- camera layer: `src/lib/scene/sceneCamera.ts` — хранит orbital camera model, screen-to-world ray helpers, world-space water mapping и общий переход от плоского screen-space к camera-space rendering.
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
- Для роста иммерсива двигаемся не в сторону полного engine-jump, а в сторону hybrid 2.5D: сначала camera-space/world-space foundation в fullscreen pass'ах, потом выборочный объём и SDF там, где это окупается.
- Aspect-ratio/framing исправления делаем один раз в общей scene-space модели (`src/lib/scene/sceneFraming.ts`), а затем переиспользуем в `LandscapePass` и `BushesPass`.
- Один pass — одна роль: simulation, landscape shading, vegetation и возможный post-process держим раздельно.
- Ripple влияет на нормали воды, а не на цвет напрямую.
- Сначала добавляем камеру, world rays, water-plane/shoreline intersections и world-anchored text, и только потом обсуждаем более тяжёлый 3D/SDF слой.
- SDF используем выборочно: для hero-объектов, volumetrics, world-anchored title/signage и storytelling hotspots, а не как blanket replacement всего runtime.
- Новые абстракции добавляем только там, где они уже уменьшают сложность текущего кода, а не впрок.
- После заметных runtime baseline-изменений обновляем `README.md` и `codex-system-prompt.md` в той же итерации, чтобы следующая работа опиралась на актуальное состояние проекта.

## Reference Base

Когда нужен внешний ориентир по решениям, стараемся опираться сначала на эти источники:

- Svelte docs for LLMs: `https://svelte.dev/docs/llms`
- Svelte Best Practices: `https://svelte.dev/docs/svelte/best-practices`
- GM Shaders Mini Tutorials: `https://mini.gmshaders.com/`
- GM Shaders Mini: Vector Spaces: `https://mini.gmshaders.com/p/vector-spaces`
- GM Shaders Mini: Signed Distance Fields: `https://mini.gmshaders.com/p/sdf`
- GM Shaders Guest: Bart: `https://mini.gmshaders.com/p/guest-bart`
- The Book of Shaders: `https://thebookofshaders.com/`
- Inigo Quilez Articles: `https://iquilezles.org/articles/`
- Inigo Quilez: Smooth Minimum / Smooth Union: `https://iquilezles.org/articles/smin/`
- PKH Notebook: `https://blog.pkh.me/index.html`
- Maxime Heckel Articles: `https://blog.maximeheckel.com/#articles`
- Graphics Programming Weekly: `https://www.jendrikillner.com/post/graphics-programming-weekly-issue-411/`

Практическое правило:

- По Svelte сначала сверяемся с официальной документацией и best practices.
- По GLSL, шумам, procedural math и shader-оптимизациям используем GM Shaders, The Book of Shaders и статьи Inigo Quilez как основную reference-базу.
- Для вопросов про coordinate spaces, camera/view/projection math и “почему объект ведёт себя как overlay” сначала сверяемся с `GM Shaders Mini: Vector Spaces`.
- Для локальных переходов bank -> water, shoreline masks, мягких silhouette blends и shape composition полезно сначала сверяться с `GM Shaders Mini: Signed Distance Fields` и `iq: smin`.
- Для world-space billboards / sprite cards / order-of-operations при развороте карточек в 3D сначала сверяемся с `GM Shaders Guest: Bart`; практическое правило — сначала локальный поворот/разворот карточки вокруг её центра, потом перевод в world-space, а не наоборот.
- Практическое правило по SDF/smin: использовать их как локальный инструмент для мягкого сращивания береговой формы, shallow-water shelf, vegetation masks и reveal transitions, но не как оправдание мгновенно переводить весь runtime в SDF-мир.
- Для более глубоких заметок по signed distance functions, ray marching, filtering и shader math можно дополнительно опираться на PKH Notebook.
- Для визуальных разборов creative coding, shader storytelling и выразительных frontend/WebGL-паттернов можно дополнительно смотреть статьи Maxime Heckel.
- Для поиска сильных внешних ориентиров и свежих graphics links можно использовать Graphics Programming Weekly как curated discovery-источник.
- Ссылки нужны как опора для решений, а не как повод тащить в проект лишнюю абстракцию.

Активный render pipeline сейчас такой:

1. `RipplePass`
2. `LandscapePass`
3. `BushesPass`

Post-processing в активный pipeline пока не подключён.

## Текущий курс на глубину сцены

- Главная визуальная проблема baseline — не отсутствие “настоящего 3D” само по себе, а то, что большая часть сцены долго жила в screen-space композиции.
- Принятый курс: переводить `LandscapePass` в camera-space/world-space постепенно, сохраняя текущую pass-архитектуру.
- Phase 1 baseline: orbital camera state, world-ray reconstruction, water-plane shading и shoreline hit-модель внутри `LandscapePass`.
- Phase 1.5 baseline: pond-scale calibration — вода читается как городской пруд с конечным противоположным берегом, а не как бесконечная открытая акватория.
- Phase 1.6 current target: перевести vegetation из horizon-locked overlay в world-space shoreline placement.
- Для `BushesPass` это означает: инстансы хранят корень карточки в world-space вдоль bank/shoreline, затем проецируются той же камерой, что и landscape; единый `u_horizon` как финальная посадка кустов больше не считается достаточным baseline.
- Atlas/billboard техника для дальней береговой растительности считается валидной; текущие артефакты читаются как проблема пространственной привязки, а не как доказательство, что cards/atlas не подходят.
- Для следующего polish-слоя bank/water transition разрешён локальный SDF-подход: shoreline distance mask + `smin`/soft union для более мягкой посадки берега в воду, если это не ломает текущий pond-scale baseline.
- При использовании `smin` помнить, что blend-region перестаёт быть exact distance field; держать `k` небольшим и сначала применять это как shaping/masking tool, а не как основу для тяжёлого raymarch-пайплайна.
- После world-space миграции vegetation двигаем title из 2D overlay в world-anchored SDF/MSDF слой.
- Только после этого оцениваем selective SDF для volumetrics, story reveals и hero-объектов; не делаем мгновенный переход на “полный 3D engine”.

## Текущий baseline для vegetation и framing

- Вегетация больше не опирается на один color atlas. `LandscapeResources` загружает небольшой grass PBR bundle: `albedo`, `alpha`, `normal`, `roughness`, `translucency`.
- Runtime использует web-ready PNG-копии из `static/grass-atlas-web/`; TIFF-файлы в `static/grass-atlas/` считаются source assets для конвертации.
- `BushesPass` остаётся отдельным pass и владеет atlas region definitions, instancing и wind animation.
- Atlas mapping сделан через явные region rect'ы на CPU, а не через жёсткий layout hardcode в GLSL.
- Общая framing-модель height-normalized: при resize меняется горизонтальный охват сцены, а не вертикальные пропорции композиции.
- Эту framing-модель считают в `src/lib/scene/sceneFraming.ts` и прокидывают в `LandscapePass` и `BushesPass` как shared frame state.
- Runtime уже перешёл к orbital camera/world-space foundation для воды и противоположного берега: landscape больше не должен опираться только на экранный split по `uv.y`.
- `BushesPass` начал Phase 1.6 migration: roots карточек уже хранятся в world-space вдоль той же shoreline/bank-модели, что использует `LandscapePass`, и проецируются через ту же orbital camera.
- Vegetation shading и atlas quality всё ещё считаются промежуточным scaffold; если визуал выбивается, сначала проверяем anchoring/projection/integration, а не отвергаем atlas cards как технику.

Deployment/runtime: проект собирается через `@sveltejs/adapter-vercel`. Server `load` и private env для Strapi остаются валидными на Vercel, а production-артефакт больше не должен разворачиваться как статическая папка с `build/index.js`.

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
    sceneCamera.ts
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
