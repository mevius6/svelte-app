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
- pass layer: `RipplePass` → `LandscapePass` → `BushesPass` → `MorningFogPass` → `HeroTitlePass` → `FinalColorPass`.
- GL layer: `src/lib/gl/` — `Program`, `FullscreenQuad`, `FBO`, `DoubleFBO`, `Context`.

## Активный render pipeline

```text
Simulation:
RipplePass

Linear scene composition (offscreen sceneColor FBO):
LandscapePass → BushesPass → MorningFogPass → HeroTitlePass

Display output:
FinalColorPass (single linear → sRGB transfer)
```

**Важно:** depth test отключён (painter's algorithm), поэтому порядок слоёв внутри `sceneColor` фиксирован: `landscape → bushes → morningFog → heroTitle`.
`FinalColorPass` выполняется последним и только переводит линейный цвет в display-space.

## Архитектурные принципы

- `LandscapeViewport` — тонкий host: canvas mounting, scene bootstrapping, dev-only debug UI.
- `Renderer` — runtime lifecycle, не содержит scene-специфичной логики.
- `LandscapeScene` — координатор input, frame state, порядка проходов. Не контейнер GPU-ресурсов.
- `LandscapeResources` — владение созданием, загрузкой и освобождением GPU-ресурсов.
- Один pass — одна роль: simulation, landscape shading, vegetation, atmosphere, title.
- Ripple влияет на нормали воды, не на цвет напрямую.
- **scroll = время суток**, а не движение камеры или тайтла.

## Reference Base

- Svelte docs: `https://svelte.dev/docs/llms`
- GM Shaders Mini: `https://mini.gmshaders.com/`
- The Book of Shaders: `https://thebookofshaders.com/`
- Inigo Quilez: `https://iquilezles.org/articles/`
- IQ Smooth Min: `https://iquilezles.org/articles/smin/`
- Forward Scattering (fog derivation): `https://forwardscattering.org/post/72`
- Scratchapixel (volume rendering): `https://www.scratchapixel.com/lessons/3d-basic-rendering/volume-rendering-for-developers/intro-volume-rendering.html`
- IQ Fog article: `https://iquilezles.org/articles/fog/`
- Codrops grass reference (instanced strip idea): `https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/`
- GM Shaders Mini (Oklab): `https://mini.gmshaders.com/p/oklab`
- Björn Ottosson (Oklab): `https://bottosson.github.io/posts/oklab/`
- Björn Ottosson (How software gets color wrong): `https://bottosson.github.io/posts/colorwrong/`
- Björn Ottosson (color picker / Okhsv/Okhsl): `https://bottosson.github.io/posts/colorpicker/`
- GPU Gems 3, Ch.24 (linear workflow): `https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-24-importance-being-linear`

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
- **Title reflection fixes:** убрана белая рамка (`haloAlpha` не композируется), базовый цвет тайтла зафиксирован как DayGlo `#c9f08a` (в shader как linear-эквивалент), нормаль воды сглаживается перед reflection ray для title (`nTitle = mix(n, vec3(0,1,0), rippleStrength*0.70)`).
- **Phase A — shore 1D texture:** `shoreFbm` (≈90 vnoise/пиксель воды) заменён на 1 texture fetch из `u_shoreProfileTex`. Новый файл: `src/lib/scene/shoreProfileBaker.ts`.
- **Phase B — cloud reflection LOD:** `cloudDensity` принимает `detailLOD` флаг. Reflection path: `detailLOD=0.0` (экономия 3 vnoise/пиксель).
- **Phase C — CPU caches:** `tanHalfFovY` перенесён в `SceneCameraState` (считается один раз в `computeSceneCamera`). Камера кэшируется в `LandscapeScene`, пересчёт только при resize/scroll.
- **Phase D (D1, in progress) — Wave normal LOD:** ripple-слой плавно затухает и отключается к `farField=0.75`; в `waveFieldWithMasks` добавлен ранний выход без `ripples`, `waveNormal` использует distance-based `eps`, interactive ripple-sampling пропускается при нулевой ripple-маске.
- **Phase D tuning (визуальное сглаживание):** окно затухания `rippleLod` смещено на `smoothstep(0.66, 0.75, farField)`, а сила interactive ripple-normal теперь масштабируется `rippleNormalLod` от `rippleWaveMask` — меньше выраженный mid-distance ripple lane при сохранении ближней детализации.
- **Phase E (E1, in progress) — Title glyph loop isolation:** для reflection-path добавлена предсобранная `phrase MSDF` texture; `landscape.frag` перешёл с 32-итерационного цикла по глифам на single-texture lookup по `localMetric`.
- **Sunset reveal animation:** тайтл теперь проявляется ближе к закату через фазовые маски (`smoothstep(0.62, 0.88)` для direct и `smoothstep(0.67, 0.93)` для reflection), плюс лёгкий scale-in без смещения якоря по `Y`.
- **Phase F (POC) — Morning fog pass:** добавлен отдельный fullscreen pass утреннего тумана (`MorningFogPass`) с fade-out до появления тайтла. Базовые ручки тюнинга в shader-константах: `FOG_DISSIPATE_START`, `FOG_DISSIPATE_END`, `FOG_DENSITY`.
- **Phase F (F1) — Analytic height fog:** в `landscape.frag` добавлен экспоненциальный height fog через оптическую толщину `tau` и трансмиттанс `T=exp(-tau)`, с корректным композитингом `scene*T + fog*(1-T)`; тайтл туманится по своему `tTitle`.
  Важный нюанс для non-constant density: фактор тумана должен быть `1 - exp(-tau)`, а не сырое `tau`.
- **Phase G — Linear color pipeline:** финальная сцена теперь композится в линейном `sceneColor` FBO, после чего единоразово проходит через `FinalColorPass` (`linear -> sRGB`). Ранняя display-gamma удалена из `landscape.frag` (`tonemap` остался в linear).
- **Vegetation PoC refinement:** береговая трава переведена с равномерной полосы на кластерную раскладку с просветами и центральным readability-коридором за тайтлом; в `bushes.frag` добавлен horizon/distance fade (меньше “пилы” на горизонте).
- **Vegetation + fog integration:** трава теперь дополнительно туманится в `bushes.frag` (phase + distance + height), а `MorningFogPass` получил сглаживание horizon-core, чтобы убрать белую линию на переходе горизонт/берег.

## Следующие итерации

По приоритету из code review (апрель 2026):

1. **Phase D — Wave normal LOD (finish):** визуальный тюнинг порогов/кривой (`rippleLod`, `eps`) после D1, сверка по артефактам горизонта и отражениям.
2. **Phase E — Title glyph loop isolation (finish):** довести E1 до stable baseline: проверить визуальный паритет reflection-path и при необходимости подстроить резкость/pxRange для `u_titlePhraseTex`.
3. **Vegetation quality:** atlas silhouette variety, density clustering, layering. Текущий PoC baseline: один atlas region `grass-clump-main`, shoreline strip `90` колонок × `4` ряда × `3` карточки (seeded RNG).
4. **Phase F — Morning fog tuning:** откалибровать вертикальный профиль/контраст и точку dissipation по арт-референсам, не ухудшая читаемость тайтла.
5. **Bloom/post-process pass:** если title потребует свечение — отдельный pass, не shader halo.
6. **Phase 3 selective SDF/volumetrics:** только после стабилизации всего выше.

## Трекинг статуса фаз

- Канонический трекер прогресса: `docs/render-status.md`.
- После каждого завершённого изменения в рендере/рантайме обновляем:
  - `Last updated`
  - `Phase Dashboard`
  - `Change Log` (кратко: что изменили + чем проверили).
- Если затронуты baseline/invariants, синхронизируем `README.md` и `codex-system-prompt.md` в той же итерации.

## Кэширование и производительность — текущий baseline

| Что | До | После |
|-----|----|-------|
| `shoreFbm` на водный пиксель | ≈90 vnoise | 3 texture fetch |
| Cloud reflection | 7 vnoise | 4 vnoise (detail пропущен) |
| `tanHalfFovY` | `Math.tan()` 3× per frame | 1× в `computeSceneCamera` |
| Camera recompute | каждый RAF | только при resize/scroll |
| Title reflection glyph path | 32-глиф loop в `landscape.frag` | precomposed phrase MSDF texture + single lookup |

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
    MorningFogPass.ts
    HeroTitlePass.ts
    FinalColorPass.ts

  shaders/
    landscape.vert
    landscape.frag
    ripple.frag
    bushes.vert
    bushes.frag
    morning-fog.frag
    hero-title.vert
    hero-title.frag
    post/
      final-color.frag

scripts/
  convert-grass-atlas.sh
```
