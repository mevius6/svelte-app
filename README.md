# svelte-app

## Архитектура

Текущий WebGL runtime собран как небольшой рендер-движок поверх Svelte:

`+page.svelte` -> `LandscapeViewport.svelte` -> `Renderer` -> `LandscapeScene` -> `sceneCamera` + `LandscapeResources` + passes

По слоям это устроено так:

- host/UI layer: `src/lib/components/LandscapeViewport.svelte` — тонкий Svelte-shell конкретной сцены; создаёт `canvas`, монтирует `Renderer`, включает dev-only debug panel через `LandscapeSceneDebugController`.
- runtime layer: `src/lib/render/Renderer.ts` — владеет WebGL2 context lifecycle, `requestAnimationFrame`, resize по DPR и вызовом активной сцены.
- scene/orchestration layer: `src/lib/scene/LandscapeScene.ts` — связывает input, scroll state и порядок проходов; координирует кадр. Без dev-контроллера рендерит только final path.
- debug control layer: `src/lib/scene/LandscapeSceneDebug.ts` — dev-facing state/controller для выбора debug pass/view без экспорта debug UI-типов из `LandscapeScene`.
- story content layer: `src/lib/content/storySections.ts` — CMS-ready список story sections и их `titleText`.
- story timeline layer: `src/lib/scene/storyTimeline.ts` — переводит scroll progress в `StoryFrame`: активная секция, локальный прогресс секции, shot progress и time-of-day phase.
- camera layer: `src/lib/scene/sceneCamera.ts` — хранит orbital camera model, screen-to-world ray helpers, world-space water mapping. **Камера статична; scroll больше не двигает орбиту.**
- resource layer: `src/lib/scene/LandscapeResources.ts` — владеет загрузкой и жизненным циклом GPU-ресурсов: title-texture, foliage PBR atlas, fallback ripple texture, **shore profile 1D texture**.
- baker layer: `src/lib/scene/shoreProfileBaker.ts` — **новый файл.** Запекает `shoreFbm` (5 октав, 3 seed-набора) в 512×1 RGBA32F текстуру при старте. R=baselineSilhouette, G=bankNoise, B=shelfNoiseSrc.
- framing layer: `src/lib/scene/sceneFraming.ts` — общая scene-space framing-модель.
- pass layer: `RipplePass` → `LandscapePass` → `BushesPass` → `HeroTitlePass` → `FinalColorPass`.
- GL layer: `src/lib/gl/` — `Program`, `FullscreenQuad`, `FBO`, `DoubleFBO`, `Context`.

## Активный render pipeline

```text
Simulation:
RipplePass

Linear scene composition (offscreen sceneColor FBO):
LandscapePass → BushesPass → HeroTitlePass

Display output:
FinalColorPass (single linear → sRGB transfer)
```

**Важно:** depth test отключён (painter's algorithm), поэтому порядок слоёв внутри `sceneColor` фиксирован: `landscape → bushes → heroTitle`.
`FinalColorPass` выполняется последним и только переводит линейный цвет в display-space.

## Архитектурные принципы

- `LandscapeViewport` — тонкий host: canvas mounting, scene bootstrapping, dev-only debug UI.
- `Renderer` — runtime lifecycle, не содержит scene-специфичной логики.
- `LandscapeScene` — координатор input, frame state, порядка проходов. Не контейнер GPU-ресурсов и не владелец debug UI-state.
- `LandscapeSceneDebugController` — единственная точка dev debug state; production/default path остаётся final-only, а `LandscapePass` компилирует debug shader variants только когда сцена создана с `enableDebugViews`.
- `StoryFrame` — единый per-frame результат story timeline: `storyProgress`, `sectionIndex`, `sectionProgress`, `shotProgress`, `timeOfDayPhase`.
- `LandscapeResources` — владение созданием, загрузкой и освобождением GPU-ресурсов.
- Один pass — одна роль: simulation, landscape shading, vegetation, title, display transfer.
- Ripple влияет на нормали воды, не на цвет напрямую.
- **scroll = время суток**, а не движение камеры или тайтла.

## Reference Base

- Svelte docs: `https://svelte.dev/docs/llms`
- GM Shaders Mini: `https://mini.gmshaders.com/`
- The Book of Shaders: `https://thebookofshaders.com/`
- Inigo Quilez: `https://iquilezles.org/articles/`
- IQ Smooth Min: `https://iquilezles.org/articles/smin/`
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
- **Scroll = time of day (Phase 6):** `u_scroll` теперь только фаза суток с инвертированной семантикой: `0=ночь`, `0.2=рассвет`, `0.5=день`, `1=закат/late-sunset`.
- **Clouds follow sun (Phase B):** `solarDrift = vec2(phase01 * 0.42, phase01 * 0.06)` в `cloudDensity` — облака движутся вместе с солнцем.
- **Title reflection fixes:** убрана белая рамка (`haloAlpha` не композируется), базовый цвет тайтла зафиксирован как DayGlo `#c9f08a` (в shader как linear-эквивалент), нормаль воды сглаживается перед reflection ray для title (`nTitle = mix(n, vec3(0,1,0), rippleStrength*0.70)`).
- **Phase A — shore 1D texture:** `shoreFbm` (≈90 vnoise/пиксель воды) заменён на 1 texture fetch из `u_shoreProfileTex`. Новый файл: `src/lib/scene/shoreProfileBaker.ts`.
- **Phase B — cloud reflection LOD:** `cloudDensity` принимает `detailLOD` флаг. Reflection path: `detailLOD=0.0` (экономия 3 vnoise/пиксель).
- **Phase C — CPU caches:** `tanHalfFovY` перенесён в `SceneCameraState` (считается один раз в `computeSceneCamera`). Камера кэшируется в `LandscapeScene`, пересчёт только при resize.
- **Phase D (D1, in progress) — Wave normal LOD:** ripple-слой плавно затухает и отключается в дальнем поле; в `waveFieldWithMasks` добавлен ранний выход без `ripples`, `waveNormal` использует distance-based `eps`, interactive ripple-sampling пропускается при нулевой ripple-маске.
- **Phase D tuning (итерация 2):** LOD-якоря вынесены в константы (`WAVE_LOD_NEAR_DIST/FAR_DIST`, `RIPPLE_FADE_START/END`, `WAVENORMAL_EPS_NEAR/FAR`), окно затухания ripple расширено до `smoothstep(0.58, 0.82, farField)`, `waveNormal` теперь увеличивает `eps` к дальнему полю (меньше shimmer на горизонте), interactive ripple-normal отвязан от `rippleWaveMask` в отдельный `interactiveRippleMask`.
- **Phase D debug tooling:** добавлен debug-режим `Landscape=Wave LOD` (`DEBUG_WAVE_LOD`), который показывает маски LOD по каналам: `R=farField`, `G=rippleLod`, `B=interactiveRippleMask`.
- **Phase E (E1, in progress) — Title glyph loop isolation:** для reflection-path добавлена предсобранная `phrase MSDF` texture; `landscape.frag` перешёл с 32-итерационного цикла по глифам на single-texture lookup по `localMetric`.
- **Title reveal (default):** прямой тайтл, отражение и glow — `titleReveal(phase)`; по умолчанию видны с начала скролла (`TITLE_REVEAL_START/END = 0` в `constants.glsl`). Опционально late-sunset: `0.78→0.94`.
- **Night phase removed:** активный landscape shader больше не подключает `night.glsl`; moon/night-grade stubs убраны из active render path.
- **Phase F (POC) — Morning fog pass:** добавлен отдельный fullscreen pass утреннего тумана (`MorningFogPass`) с fade-out до появления тайтла. Базовые ручки Phase 6: `FOG_DISSIPATE_START=0.18`, `FOG_DISSIPATE_END=0.36`, `FOG_DENSITY`.
- **Phase F (F1) — Analytic height fog:** в `landscape.frag` добавлен экспоненциальный height fog через оптическую толщину `tau` и трансмиттанс `T=exp(-tau)`, с корректным композитингом `scene*T + fog*(1-T)`; тайтл туманится по своему `tTitle`.
  - Важный нюанс для non-constant density: фактор тумана должен быть `1 - exp(-tau)`, а не сырое `tau`.
- **Phase G — Linear color pipeline:** финальная сцена теперь композится в линейном `sceneColor` FBO, после чего единоразово проходит через `FinalColorPass` (`linear -> sRGB`). Ранняя display-gamma удалена из `landscape.frag` (`tonemap` остался в linear).
- **Phase H (in progress) — Title glow pass:** добавлен отдельный fullscreen post-pass `TitleGlowPass` после `HeroTitlePass` (до `FinalColorPass`), glow строится по precomposed phrase MSDF (`u_titlePhraseTex`) и включается/отключается из dev debug panel.
  - Внутри pass применена схема `source -> separable blur (multi-pass) -> layered additive composite` (по мотивам GM Mini Bloom/Blur Philosophy) для устранения рваного/гребенчатого свечения.
- **Late-sunset title glow baseline:** glow в `TitleGlowPass` остаётся sunset-driven без night-boost ветки; отражённый glow тайтла в воде отключён из-за артефактов контура/рамки.
- **Vegetation PoC (bank fill):** трава заполняет весь запечённый склон берега (toe→crest) через `shorelineVegetationRootOnBank`; плотность кластерами с мягким центральным коридором; не ниже `WATER_LEVEL + VEGETATION_GRASS_MIN_Y_ABOVE_WATER`. Покрытие по X пересчитывается при resize (`computeVisibleBankXExtents`) — без дыр на fullscreen/ultrawide. Освещение/shimmer в `bushes.frag` синхронизировано с `sunDirection(phase)` landscape.
- **Scene runtime config:** `src/lib/scene/sceneConfig.ts` — `TITLE_GLOW_ENABLED`, vegetation slope/clearance knobs.
- **Vegetation + fog integration:** трава теперь дополнительно туманится в `bushes.frag` (phase + distance + height), а `MorningFogPass` получил сглаживание horizon-core, чтобы убрать белую линию на переходе горизонт/берег.
- **Debug isolation:** debug UI-типы и состояние вынесены из `LandscapeScene` в `LandscapeSceneDebugController`; dev host включает debug явно, а `LandscapePass` создаёт debug shader variants только для dev-сцены.
- **Story timeline naming prep:** CMS-заголовки переименованы на уровне контента в `STORY_SECTIONS` (`src/lib/content/storySections.ts`); `LandscapeScene` теперь получает `StoryFrame` из `computeStoryFrame()` без legacy title aliases. `shotProgress` добавлен как будущий канал для cinematic camera.

## Следующие итерации

Подробный план по спринтам и exit criteria: [`docs/development-plan.md`](docs/development-plan.md).

По приоритету из code review (апрель 2026):

1. **Phase D — Wave normal LOD (finish):** финальный визуальный тюнинг порогов/кривой (`rippleLod`, `eps`, `interactiveRippleMask`) через новый debug-режим `Wave LOD`; сверка по артефактам горизонта и отражениям.
2. **Phase E — Title glyph loop isolation (finish):** довести E1 до stable baseline: проверить визуальный паритет reflection-path и при необходимости подстроить резкость/pxRange для `u_titlePhraseTex`.
3. **Vegetation quality:** atlas silhouette variety, layering polish. Текущий PoC: `grass-clump-main`, bank-slope instancing (~3–5k cards, rebuild on resize), scroll sun shimmer — см. `sceneConfig.ts` + `BushesPass`.
4. **Phase F — Morning fog tuning:** откалибровать вертикальный профиль/контраст и точку dissipation по арт-референсам, не ухудшая читаемость тайтла.
5. **Title glow tuning:** откалибровать интенсивность/радиусы/палитру `TitleGlowPass` по арт-референсам, проверить паритет в режимах `Final` и `Pass=Glow`.
6. **Phase 3 selective SDF/volumetrics:** только после стабилизации всего выше.

## Трекинг статуса фаз

- Канонический трекер прогресса: `docs/render-status.md`.
- После каждого завершённого изменения в рендере/рантайме обновляем:
  - `Last updated`
  - `Phase Dashboard`
  - `Change Log` (кратко: что изменили + чем проверили).
- Если затронуты baseline/invariants, синхронизируем `README.md` и `codex-system-prompt.md` в той же итерации.
- При фиксации изменений в git используем лаконичное и фактологичное сообщение коммита (что именно изменено, без расплывчатых формулировок).

## Кэширование и производительность — текущий baseline


| Что                          | До                              | После                                           |
| ---------------------------- | ------------------------------- | ----------------------------------------------- |
| `shoreFbm` на водный пиксель | ≈90 vnoise                      | 3 texture fetch                                 |
| Cloud reflection             | 7 vnoise                        | 4 vnoise (detail пропущен)                      |
| `tanHalfFovY`                | `Math.tan()` 3× per frame       | 1× в `computeSceneCamera`                       |
| Camera recompute             | каждый RAF                      | только при resize                               |
| Title reflection glyph path  | 32-глиф loop в `landscape.frag` | precomposed phrase MSDF texture + single lookup |


## Asset workflow

- Обновился grass atlas → `npm run atlas:convert`
- Обновился source font или phrase → `bun run hero-title:generate`
- Runtime: `static/grass-atlas-web/*.png`; `static/hero-title/roslindale-msdf.`*
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
    shoreProfileBaker.ts
    sceneConfig.ts              ← runtime toggles (title glow, vegetation tuning)

  passes/
    RipplePass.ts
    LandscapePass.ts
    BushesPass.ts
    MorningFogPass.ts
    HeroTitlePass.ts
    TitleGlowPass.ts
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
    title-glow.frag
    post/
      title-glow-blur.frag
      title-glow-composite.frag
      final-color.frag

scripts/
  convert-grass-atlas.sh
```
