# svelte-app

## Архитектура

Текущий WebGL runtime собран как небольшой рендер-движок поверх Svelte:

`+page.svelte` -> `LandscapeViewport.svelte` -> `Renderer` -> `LandscapeScene` -> `sceneCamera` + `LandscapeResources` + passes

По слоям это устроено так:

- host/UI layer: `src/lib/components/LandscapeViewport.svelte` — тонкий Svelte-shell конкретной сцены; создаёт `canvas`, монтирует `Renderer`, показывает dev-only debug panel.
- runtime layer: `src/lib/render/Renderer.ts` — владеет WebGL2 context lifecycle, `requestAnimationFrame`, resize по DPR и вызовом активной сцены.
- scene/orchestration layer: `src/lib/scene/LandscapeScene.ts` — связывает input, scroll/debug state и порядок проходов; координирует кадр.
- camera layer: `src/lib/scene/sceneCamera.ts` — хранит orbital camera model, screen-to-world ray helpers, world-space water mapping. **Камера статична; scroll больше не двигает орбиту.**
- resource layer: `src/lib/scene/LandscapeResources.ts` — владеет загрузкой и жизненным циклом GPU-ресурсов: title-texture, foliage PBR atlas, fallback ripple texture, **shore profile 1D texture**.
- baker layer: `src/lib/scene/shoreProfileBaker.ts` — **новый файл.** Запекает `shoreFbm` (5 октав, 3 seed-набора) в 512×1 RGBA32F текстуру при старте. R=baselineSilhouette, G=bankNoise, B=shelfNoiseSrc.
- framing layer: `src/lib/scene/sceneFraming.ts` — общая scene-space framing-модель.
- pass layer: `RipplePass` → `LandscapePass` → `BushesPass` → `HeroTitlePass`.
- GL layer: `src/lib/gl/` — `Program`, `FullscreenQuad`, `FBO`, `DoubleFBO`, `Context`.

## Активный render pipeline

```
RipplePass → LandscapePass → BushesPass → HeroTitlePass
```

**Важно: порядок изменён.** BushesPass рендерится ДО HeroTitlePass — depth test отключён (painter's algorithm), растительность не перекрывает тайтл.

## Архитектурные принципы

- `LandscapeViewport` — тонкий host: canvas mounting, scene bootstrapping, dev-only debug UI.
- `Renderer` — runtime lifecycle, не содержит scene-специфичной логики.
- `LandscapeScene` — координатор input, frame state, порядка проходов. Не контейнер GPU-ресурсов.
- `LandscapeResources` — владение созданием, загрузкой и освобождением GPU-ресурсов.
- Один pass — одна роль: simulation, landscape shading, vegetation, title.
- Ripple влияет на нормали воды, не на цвет напрямую.
- **scroll = время суток**, а не движение камеры или тайтла.

## Reference Base

- Svelte docs: `https://svelte.dev/docs/llms`
- GM Shaders Mini: `https://mini.gmshaders.com/`
- The Book of Shaders: `https://thebookofshaders.com/`
- Inigo Quilez: `https://iquilezles.org/articles/`
- IQ Smooth Min: `https://iquilezles.org/articles/smin/`

## Текущий cursor на глубину сцены

**Завершённые фазы:**

- Phase 1–1.7: orbital camera, world-ray, water-plane/shoreline, pond-scale, vegetation world-space, shoreline contact.
- Phase 1.6: BushesPass — world-space roots на bank, projection через orbital camera.
- Phase 1.7: shoreline overlap — gap metric, shallow shelf, bank-through-water, shore waterfilm.
- Phase 2.2: MSDF atlas pipeline → `HeroTitlePass` с fallback на canvas billboard.

**Завершённые в текущей итерации:**

- **Title world-space fix:** тайтл перемещён в середину пруда (`TITLE_WORLD_Z_NEAR = 0.35`), вместо берега (`-0.58`). Ширина масштабирована пропорционально для сохранения видимого размера.
- **baseLift removed:** анимация подъёма тайтла по Y при скролле удалена. Высота теперь фиксирована: `WATER_LEVEL + height * 0.5 + 0.06`.
- **Render order:** BushesPass перенесён перед HeroTitlePass — растительность за тайтлом, не перед ним.
- **Статичная камера:** scroll больше не двигает орбиту. Камера зафиксирована: `yaw=-0.08`, `pitch=0.068`, `radius=2.92`.
- **Scroll = time of day:** `u_scroll` теперь только фаза дня (0=рассвет, 1=закат).
- **Clouds follow sun (Phase B):** `solarDrift = vec2(phase01 * 0.42, phase01 * 0.06)` в `cloudDensity` — облака движутся вместе с солнцем.
- **Title reflection fixes:** убрана белая рамка (`haloAlpha` не композируется), цвет исправлен на lime-green `vec3(0.788, 0.941, 0.541)`, нормаль воды сглаживается перед reflection ray для title (`nTitle = mix(n, vec3(0,1,0), rippleStrength*0.70)`).
- **Phase A — shore 1D texture:** `shoreFbm` (≈90 vnoise/пиксель воды) заменён на 1 texture fetch из `u_shoreProfileTex`. Новый файл: `src/lib/scene/shoreProfileBaker.ts`.
- **Phase B — cloud reflection LOD:** `cloudDensity` принимает `detailLOD` флаг. Reflection path: `detailLOD=0.0` (экономия 3 vnoise/пиксель).
- **Phase C — CPU caches:** `tanHalfFovY` перенесён в `SceneCameraState` (считается один раз в `computeSceneCamera`). Камера кэшируется в `LandscapeScene`, пересчёт только при resize/scroll. Glyph uniforms (256 floats) загружаются только при изменении атласа, не каждый кадр.

## Следующие итерации

По приоритету из code review (апрель 2026):

1. **Phase D — Wave normal LOD:** при `farField > 0.75` пропускать ripples, уменьшать `eps` пропорционально `viewDistance`. Экономия ~5-8% GPU.
2. **Phase E — Title glyph loop isolation:** 32-итерационный MSDF-цикл в `landscape.frag` — кандидат на изоляцию после стабилизации Phase 2 title pipeline.
3. **Vegetation quality:** atlas silhouette variety, density clustering, layering. Текущий baseline: один atlas region `grass-clump-main`, 18 кустов × 3 карточки.
4. **Scroll-driven title reveal animation:** при scroll=0 тайтл на месте посреди пруда; разработать эффект появления (не подъём по Y — заменён). Candidate: fade-in по opacity + лёгкий scale.
5. **Bloom/post-process pass:** если title потребует свечение — отдельный pass, не shader halo.
6. **Phase 3 selective SDF/volumetrics:** только после стабилизации всего выше.

## Кэширование и производительность — текущий baseline

| Что | До | После |
|-----|----|-------|
| `shoreFbm` на водный пиксель | ≈90 vnoise | 3 texture fetch |
| Cloud reflection | 7 vnoise | 4 vnoise (detail пропущен) |
| `tanHalfFovY` | `Math.tan()` 3× per frame | 1× в `computeSceneCamera` |
| Camera recompute | каждый RAF | только при resize/scroll |
| Glyph upload | 256 floats каждый кадр | только при смене атласа |

## Asset workflow

- Обновился grass atlas → `npm run atlas:convert`
- Обновился source font или phrase → `bun run hero-title:generate`
- Runtime: `static/grass-atlas-web/*.png`; `static/hero-title/roslindale-msdf.*`
- После изменений в render baseline синхронизировать README и codex-system-prompt.

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
    shoreProfileBaker.ts      ← NEW (Phase A)

  passes/
    RipplePass.ts
    LandscapePass.ts
    BushesPass.ts
    HeroTitlePass.ts

  shaders/
    landscape.vert
    landscape.frag
    ripple.frag
    bushes.vert
    bushes.frag
    hero-title.vert
    hero-title.frag
    post/
      tonemap.frag

scripts/
  convert-grass-atlas.sh
```
