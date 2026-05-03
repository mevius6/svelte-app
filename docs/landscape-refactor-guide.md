# Landscape Renderer — Руководство по рефакторингу и оптимизации

> **Назначение документа:** пошаговое техническое руководство для рефакторинга
> `landscape.frag`, `LandscapeResources.ts` и `LandscapeScene.ts`.
> Написано для ИИ-агентов и разработчиков, работающих с проектом последовательно.
> Каждый шаг — отдельный коммит с минимальным diff и явной проверкой регрессий.

---

## Контекст и проблемы

| Файл | Строк | Проблема |
|---|---|---|
| `src/lib/shaders/landscape.frag` | ~1088 | Sky / shore / water / fog / title — всё в одном файле; правка любой фазы D/E/F затрагивает весь шейдер |
| `src/lib/scene/LandscapeResources.ts` | ~584 | God-object: canvas-текстура, MSDF-атлас, трава, профиль берега, ripple-fallback в одном классе |
| `src/lib/scene/LandscapeScene.ts` | ~374 | `render()` обрабатывает финальный кадр и все debug-режимы в одном методе |

**Главный риск при рефакторинге:** нарушить инварианты из `codex-system-prompt.md` §5 и `SKILL.md` §4.
Перед каждым шагом убедитесь, что список инвариантов не изменился.

---

## Порядок фаз (скорректированный)

Оригинальный план предлагал начать с chunk-системы шейдеров — это самый рискованный шаг.
**Правильный порядок:** сначала изменения с нулевым риском регрессий, потом структурные.

```
Фаза 1: buildFrameState() + renderDebug*/renderFinal   ← минимальный риск
Фаза 2: TitleResources                                 ← изолированный модуль
Фаза 3: FoliageAtlasLoader                             ← механический перенос
Фаза 4: Vite-плагин для #include                       ← инфраструктура без логики
Фаза 5: Сплит landscape.frag на чанки                  ← только когда инфраструктура готова
Фаза 6: Shader-оптимизации                             ← поблочно, в конце
```

---

## Фаза 1: Разделение LandscapeScene.render() на debug/final

### Почему первая

Не меняет шейдеры, не трогает ресурсы, не ломает pipeline-порядок.
Единственный риск — опечатки при переносе кода.

### Ввести buildFrameState()

```typescript
// src/lib/scene/LandscapeScene.ts

type FrameState = {
  time: number
  rippleTex: WebGLTexture | null
  sceneFrame: SceneFrame
  camera: SceneCameraState
  vegetationHorizon: number
  titleHero: TitleHeroState
  heroTitleAtlasRenderData: HeroTitleAtlasRenderData | null
  heroTitleAtlas: HeroTitleAtlasResource | null
  useGlyphTitle: boolean
}

private buildFrameState(time: number): FrameState | null {
  const textTexture = this.resources.textTexture
  if (!textTexture) return null

  const rippleTex = this.ripple.render(time, null)
    ?? this.resources.rippleFallbackTexture
  const sceneFrame = computeSceneFrame(this.width, this.height)
  const camera = this.resolveCamera()
  const vegetationHorizon = computeVegetationHorizon(camera, this.width, this.height)
  const textTexSize = this.resources.textTextureSize
  const titleLayout = this.resources.heroTitleLayout
  const titleHero = computeTitleHeroState(
    this.scrollNorm, titleLayout.aspect, textTexSize.contentRect
  )
  const heroTitleAtlasRenderData = this.resources.heroTitleAtlasRenderData
  const heroTitleAtlas = heroTitleAtlasRenderData?.atlas
    ?? this.resources.heroTitleAtlas ?? null
  const useGlyphTitle = Boolean(
    heroTitleAtlasRenderData?.atlas.texture &&
    heroTitleAtlasRenderData?.phraseTexture
  )

  return {
    time, rippleTex, sceneFrame, camera, vegetationHorizon,
    titleHero, heroTitleAtlasRenderData, heroTitleAtlas, useGlyphTitle
  }
}
```

### Переписать render() как dispatcher

```typescript
render(time: number) {
  const frame = this.buildFrameState(time)
  if (!frame) return

  switch (this.passView) {
    case 'ripple':     return this.renderDebugRipple(frame)
    case 'vegetation': return this.renderDebugVegetation(frame)
    case 'fog':        return this.renderDebugFog(frame)
    case 'glow':       return this.renderDebugGlow(frame)
    case 'landscape':  return this.renderDebugLandscape(frame)
    default:           return this.renderFinal(frame)
  }
}
```

### Имплементация renderDebug*

Каждый метод берёт из `frame` только то, что ему нужно.

```typescript
private renderDebugRipple(frame: FrameState) {
  this.setSceneOutputFramebuffer(null)
  this.landscape.setDebugMode('ripple')
  this.landscape.render(frame.time, frame.rippleTex)
}

private renderDebugVegetation(frame: FrameState) {
  this.gl.clearColor(0.03, 0.04, 0.06, 1.0)
  this.gl.clear(this.gl.COLOR_BUFFER_BIT)
  this.bushes.setFrameState({
    camera: frame.camera,
    horizon: frame.vegetationHorizon,
    phase: this.scrollNorm,
    debugView: true,          // ← fog/haze выключены для читаемости
    atlasTextures: this.resources.foliageAtlas,
    sceneScale: { x: frame.sceneFrame.scaleX, y: frame.sceneFrame.scaleY },
  })
  this.bushes.render(frame.time, null)
}

private renderDebugFog(frame: FrameState) {
  this.gl.clearColor(0.02, 0.03, 0.05, 1.0)
  this.gl.clear(this.gl.COLOR_BUFFER_BIT)
  this.morningFog.setFrameState({ phase: this.scrollNorm, debugDensity: true })
  this.morningFog.render(frame.time, null)
}

private renderDebugGlow(frame: FrameState) {
  this.gl.clearColor(0.0, 0.0, 0.0, 1.0)
  this.gl.clear(this.gl.COLOR_BUFFER_BIT)
  this.setupTitleGlowState(frame)
  this.titleGlow.render(frame.time, null)
}
```

### renderFinal() — только финальный путь

```typescript
private renderFinal(frame: FrameState) {
  if (!this.sceneColor) return

  // Подготовить все pass-ы
  this.setupLandscapeState(frame)
  this.setupHeroTitleState(frame)
  this.setupTitleGlowState(frame)

  // Запись в offscreen FBO
  this.setSceneOutputFramebuffer(this.sceneColor.framebuffer)
  this.gl.clearColor(0, 0, 0, 1)
  this.gl.clear(this.gl.COLOR_BUFFER_BIT)

  // Зафиксированный порядок — менять нельзя (инвариант §3 SKILL.md)
  this.landscape.setDebugMode('beauty')
  this.landscape.render(frame.time, frame.rippleTex)
  this.bushes.render(frame.time, null)
  this.morningFog.render(frame.time, null)
  if (frame.useGlyphTitle) {
    this.heroTitle.render(frame.time, null)
    if (this.glowEnabled) {
      this.titleGlow.render(frame.time, null)
    }
  }

  // Единственный display transfer: linear → sRGB
  this.setSceneOutputFramebuffer(null)
  this.finalColor.setOutputFramebuffer(null)
  this.finalColor.setFrameState({ useExactSrgb: true })
  this.finalColor.render(frame.time, this.sceneColor.texture)
}
```

### Проверка после Фазы 1

```bash
bun run check
bun run build
# Визуально прогнать все passView: final → ripple → vegetation → fog → glow → landscape
```

---

## Фаза 2: TitleResources — выделить из LandscapeResources

### Что переносить

Всё связанное с текстом в один класс:
- canvas-текстура (fallback рендер через 2D API)
- загрузка MSDF JSON + PNG (`/hero-title/roslindale-msdf.*`)
- парсинг → `HeroTitleAtlasFont`
- построение `HeroTitlePhraseGpuLayout`
- создание phrase-texture для reflection path

### Интерфейс

```typescript
// src/lib/scene/TitleResources.ts

export type TitleRenderData = {
  textTexture: WebGLTexture
  textTextureSize: TextTexture           // w, h, contentRect, layout
  heroTitleAtlas: HeroTitleAtlasResource | null
  heroTitleAtlasRenderData: HeroTitleAtlasRenderData | null
  heroTitleLayout: HeroTitleLayoutMetrics
}

export class TitleResources {
  private data: TitleRenderData | null = null

  constructor(private gl: WebGL2RenderingContext) {}

  async load(projectName: string): Promise<void> {
    const textResult = this.createTextTexture(projectName)
    if (!textResult) throw new Error('Failed to create title texture')

    const atlas = await this.loadHeroTitleAtlas()
    const atlasRenderData = atlas
      ? await this.buildHeroTitleAtlasRenderData(projectName, atlas)
      : null
    const layout = atlas
      ? measureHeroTitleLayoutFromAtlas(projectName, atlas.font)
      : textResult.layout

    this.data = {
      textTexture: textResult.texture,
      textTextureSize: textResult,
      heroTitleAtlas: atlas,
      heroTitleAtlasRenderData: atlasRenderData,
      heroTitleLayout: layout,
    }
  }

  get renderData(): TitleRenderData {
    if (!this.data) throw new Error('TitleResources not loaded')
    return this.data
  }

  dispose(): void { /* удалить все WebGLTexture */ }
}
```

### Обновить LandscapeResources

```typescript
export class LandscapeResources {
  private title: TitleResources
  private foliageAtlasRef: FoliageAtlasTextureSet
  private shoreProfileTexRef: WebGLTexture | null = null
  private rippleFallbackTextureRef: WebGLTexture | null = null

  async load(options: LoadOptions) {
    await this.title.load(options.projectName)
    this.foliageAtlasRef = await loadFoliageAtlas(this.gl, options.atlasSources)
    this.shoreProfileTexRef = createShoreProfileTexture(this.gl)
    if (options.needsRippleFallback) {
      this.rippleFallbackTextureRef = createDummyRippleTexture(this.gl)
    }
  }

  // Геттеры — тонкие прокси
  get textTexture() { return this.title.renderData.textTexture }
  get heroTitleAtlas() { return this.title.renderData.heroTitleAtlas }
  get heroTitleAtlasRenderData() { return this.title.renderData.heroTitleAtlasRenderData }
  // ...
}
```

### Проверка после Фазы 2

```bash
bun run check
# Убедиться, что hero title рендерится идентично: direct + reflection
# Проверить, что phraseTexture для reflection по-прежнему создаётся
```

---

## Фаза 3: FoliageAtlasLoader — изолировать загрузку текстур травы

### Простой модуль-функция

```typescript
// src/lib/scene/loaders/foliageAtlasLoader.ts

export async function loadFoliageAtlas(
  gl: WebGL2RenderingContext,
  sources: FoliageAtlasSourceSet
): Promise<FoliageAtlasTextureSet> {
  const [albedo, alpha, normal, roughness, translucency] = await Promise.all([
    loadTexture(gl, sources.albedo),
    loadTexture(gl, sources.alpha),
    loadTexture(gl, sources.normal),
    loadTexture(gl, sources.roughness),
    loadTexture(gl, sources.translucency),
  ])
  return { albedo, alpha, normal, roughness, translucency }
}

function loadTexture(gl: WebGL2RenderingContext, url: string): Promise<WebGLTexture | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindTexture(gl.TEXTURE_2D, null)
      resolve(tex)
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
```

Это механический перенос. Логика не меняется, только место объявления.

---

## Фаза 4: Vite-плагин для #include (без внешних зависимостей)

### Почему не vite-plugin-glsl

`vite-plugin-glsl` добавляет зависимость с собственным парсером и runtime-поведением.
Для проекта, где `?raw`-импорт уже работает, достаточно 60-строчного кастомного плагина.

### Реализация

```typescript
// vite-glsl-include.ts
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

function resolveIncludes(src: string, baseDir: string, visited = new Set<string>()): string {
  return src.replace(/^#include\s+"([^"]+)"/gm, (_, includePath) => {
    const fullPath = path.resolve(baseDir, includePath)
    if (visited.has(fullPath)) {
      console.warn(`[glsl-include] Circular include detected: ${fullPath}`)
      return ''
    }
    if (!fs.existsSync(fullPath)) {
      throw new Error(`[glsl-include] File not found: ${fullPath}`)
    }
    visited.add(fullPath)
    const content = fs.readFileSync(fullPath, 'utf-8')
    return resolveIncludes(content, path.dirname(fullPath), visited)
  })
}

export function glslInclude(): Plugin {
  return {
    name: 'glsl-include',
    transform(code, id) {
      if (!/\.(frag|vert|glsl)$/.test(id)) return null
      if (!code.includes('#include')) return null

      try {
        const resolved = resolveIncludes(code, path.dirname(id))
        return { code: resolved, map: null }
      } catch (e) {
        this.error(String(e))
      }
    },
  }
}
```

### Интеграция в vite.config.ts

```typescript
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { glslInclude } from './vite-glsl-include'

export default defineConfig({
  plugins: [
    sveltekit(),
    glslInclude(),   // ← добавить после sveltekit
  ],
  assetsInclude: ['**/*.glsl'],
})
```

### Проверка после Фазы 4

```bash
bun run dev
# Открыть страницу — шейдеры должны работать идентично
# Создать тестовый файл test.frag с #include "test_helper.glsl" и убедиться, что плагин разворачивает
```

---

## Фаза 5: Сплит landscape.frag на чанки

> **Главное правило:** на этом шаге логика не меняется. Только перемещение кода.
> Имена функций — сохранить как есть (они зафиксированы в инвариантах).

### Целевая структура файлов

```
src/lib/shaders/landscape/
  _entry.frag              ← #version, uniforms, #include chain, void main()
  common/
    constants.glsl         ← все const float/vec (WAVE_LOD_*, RIPPLE_FADE_*, FOG_*, etc.)
    math.glsl              ← saturate, smin, sdBox, aaCoverage, expSafe, contactGapMask
    noise.glsl             ← hash, vnoise, cloudBaseFbm, cloudDetailFbm
  domains/
    night.glsl             ← nightPhase, applyNightGrade (нужны почти везде — первые в цепи)
    sky.glsl               ← skyColor, tonemap, sunColor, sunDirection, moonDirection,
                             shadeSkyDirection, skyUvFromDirection
    clouds.glsl            ← cloudDensity (с detailLOD)  [зависит от noise.glsl]
    shore.glsl             ← baselineSilhouette, vegetationProfile,
                             shorelineHeightAt, shorelineWaterEdgeZ,
                             underwaterShelfHeightAt, shorelineTransitionSdf,
                             shorelineTransitionMask, shorelineBankSurfaceYAt,
                             bankMaterialBase, intersectShore
    water_waves.glsl       ← largeWaves, mediumWaves, ripples,
                             waveFieldWithMasks, waveNormal
    fog.glsl               ← morningFogDawnMask, expHeightFogOpticalDepth,
                             morningFogColor, applyMorningHeightFog
    title.glsl             ← sampleTitleTextureAlpha, median3,
                             titlePhraseUvFromLocalMetric, titlePhraseScreenPxRange,
                             sampleTitlePhraseAlpha, sampleTitlePhraseReflectionCoverage,
                             titleBillboardRight, insideUnitSquare,
                             intersectTitleBillboard, intersectTitleAtlas,
                             titleLocalMetricFromHitPos, titleAboveWaterAlpha,
                             titleHeroColor, compositeTitle,
                             titleReveal, titleReflectionReveal
    water_shade.glsl       ← microNormalDelta, waterWorldToRippleUV,
                             intersectWater, makeCameraRay, skyUvFromDirection (или вынести в sky.glsl)
  main/
    landscape_main.glsl    ← void main() — только dispatch на ветки shore/water/sky
  debug/
    debug_views.glsl       ← #ifdef DEBUG_RIPPLE, DEBUG_NORMALS, DEBUG_REFLECTION, DEBUG_WAVE_LOD
```

### Ключевые правила порядка #include

**Uniforms объявляются только в `_entry.frag`, нигде больше.**
Это устраняет главный риск дублирования.

```glsl
// _entry.frag — полный скелет
#version 300 es
precision highp float;
precision highp int;

// === ВСЕ UNIFORMS ЗДЕСЬ ===
uniform vec2  u_resolution;
uniform vec2  u_sceneScale;
uniform float u_time;
uniform float u_scroll;
uniform sampler2D u_textTex;
// ... (все остальные uniforms)

out vec4 fragColor;

// === ЧАНКИ (порядок критичен) ===
#include "common/constants.glsl"      // только const — нет зависимостей
#include "common/math.glsl"           // утилиты без зависимостей
#include "common/noise.glsl"          // зависит от math
#include "domains/night.glsl"         // nightPhase, applyNightGrade — нужны везде
#include "domains/sky.glsl"           // зависит от noise, night
#include "domains/clouds.glsl"        // зависит от noise
#include "domains/fog.glsl"           // зависит от math + u_waterLevel
#include "domains/shore.glsl"         // зависит от u_shoreProfileTex
#include "domains/water_waves.glsl"   // зависит от math, constants
#include "domains/title.glsl"         // зависит от u_titlePhraseTex, math
#include "domains/water_shade.glsl"   // зависит от water_waves, sky, title
#include "debug/debug_views.glsl"     // #ifdef-блоки
#include "main/landscape_main.glsl"   // void main()
```

### Что НЕ трогать при сплите

- Сигнатуры функций `shadeSkyDirection`, `cloudDensity` — зафиксированы в инвариантах
- Порядок вызовов в `void main()`
- Текстурные unit-ы (0=textTex, 1=rippleTex, 3=shoreProfileTex, 4=titlePhraseTex)
- Любую математику — только перемещение, никаких "улучшений" на этом шаге

### Стратегия переноса (безопасная)

1. Создать все файлы пустыми
2. В `_entry.frag` добавить `#include` chain, убедиться что собирается (пустые файлы = компилируется)
3. Переносить по одному домену за раз: скопировать функции → убедиться что шейдер компилируется → удалить из оригинала
4. После каждого домена: `bun run build` + визуальная проверка

### Проверка после Фазы 5

```bash
bun run check && bun run build
# Визуальное сравнение с baseline (все passView, все scroll-точки 0.0/0.25/0.5/0.75/1.0)
# Особенно: title reflection, shoreline contact, fog gradient
```

---

## Фаза 6: Shader-оптимизации (поблочно)

> Только после того как Фаза 5 стабилизирована и прошла визуальный QA.
> Правки — по одному чанку за раз.

### 6.1 Защита от NaN (все чанки)

Согласно рекомендациям [GM Shaders — Common Shader Mistakes]:
> «Once you have a NaN, it's very hard to get rid of. Any operation on a non-number
> will result in a non-number answer and more blank pixels.»

Пройтись по каждому чанку и проверить:

```glsl
// ❌ Опасно
float d = sqrt(dot(v, v));
float a = acos(dot(n1, n2));
float r = pow(x, 2.0);     // если x < 0

// ✅ Безопасно
float d = sqrt(max(dot(v, v), 0.0));
float a = acos(clamp(dot(n1, n2), -1.0, 1.0));
float r = pow(max(x, 0.0), 2.0);
```

В `common/math.glsl` добавить обёртки:

```glsl
float safeSqrt(float x) { return sqrt(max(x, 0.0)); }
float safeAcos(float x) { return acos(clamp(x, -1.0, 1.0)); }
// expSafe уже есть в проекте — оставить как есть
```

### 6.2 Математические эквивалентности (water_waves.glsl)

По рекомендациям [GM Shaders — Code Golfing]:

```glsl
// ❌ Медленнее
float len = length(v);
float lenSq = len * len;

// ✅ Быстрее (избегаем лишний sqrt)
float lenSq = dot(v, v);
float len = sqrt(lenSq);  // только если len реально нужен

// ❌
if (rippleMask <= 0.0001) { ... }  // уже есть в проекте — это правильно

// Переиспользовать warp-вычисления — они уже одинаковы для всех 4 волновых
// функций в одном фрагменте. После сплита это легче увидеть и исправить.
```

### 6.3 Precision qualifiers (мобильные устройства)

По рекомендации [GM Shaders — Common Shader Mistakes]:
> «lowp works well for colors, mediump for texture coordinates, highp for positional coordinates»

```glsl
// Уже корректно в проекте: precision highp float; в начале шейдера

// Для отдельных переменных внутри функций:
// Маски, нормализованные значения [0..1]:
mediump float shorelineMask = contactGapMask(shorelineGap, 0.28);

// Позиции и координаты в world-space:
highp vec3 waterPos;  // уже highp через precision highp float
```

### 6.4 Дизеринг на выходе (FinalColorPass)

Согласно рекомендации [GM Shaders — Common Shader Mistakes] и [Maxime Heckel]:
> «dithering can help with banding artifacts, which can compound, especially with LDR additive lights»

В `post/final-color.frag` после tonemapping, перед выводом:

```glsl
// Простой дизеринг: псевдослучайный шум на 1/255
// Устраняет banding в градиентах неба и воды
float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
displayCol += (dither - 0.5) / 255.0;
```

### 6.5 Fog — убрать лишние вычисления при нулевой маске

В `fog.glsl`, `applyMorningHeightFog`:

```glsl
// Уже есть guard:
if (dawnMask <= 0.0001 || rayDistance <= 0.0) return sceneCol;

// После сплита — убедиться, что этот guard остался первым в функции
// и morningFogColor() не вычисляется когда туман 0
```

### 6.6 Константы — финальный аудит

В `common/constants.glsl` собрать все magic numbers:

```glsl
// Волны и LOD
const float WAVE_LOD_NEAR_DIST  = 7.0;
const float WAVE_LOD_FAR_DIST   = 26.0;
const float RIPPLE_FADE_START   = 0.58;
const float RIPPLE_FADE_END     = 0.82;
const float WAVENORMAL_EPS_NEAR = 0.0018;
const float WAVENORMAL_EPS_FAR  = 0.0032;

// Туман
const float MORNING_FOG_DISSIPATE_START = 0.38;
const float MORNING_FOG_DISSIPATE_END   = 0.58;
const float MORNING_FOG_DENSITY         = 0.10;
const float MORNING_FOG_HEIGHT_FALLOFF  = 3.6;
const float MORNING_FOG_SKY_DISTANCE    = 12.0;

// Тайтл
const vec3 TITLE_DAYGLO_LINEAR      = vec3(0.584078418, 0.871367119, 0.254152094);
const vec3 TITLE_GLOW_AMBER_LINEAR  = vec3(0.86, 0.50, 0.20);

// Берег
const float SHORE_BANK_TOE_OFFSET    = 0.028;
const float SHORE_BANK_CREST_SETBACK = 0.020;
const float SHORE_BANK_FOOT_OFFSET_Y = 0.0;
```

---

## Инварианты, которые нельзя нарушать при рефакторинге

> Эти правила зафиксированы в `codex-system-prompt.md` §5 и `SKILL.md` §4.
> При любом изменении шейдеров — проверять весь список.

| # | Инвариант | Где проверять |
|---|---|---|
| 1 | Ripple влияет только на нормали воды, не на цвет | `water_shade.glsl` |
| 2 | `u_shoreProfileTex`: R=silhouette, G=bankNoise, B=shelfNoise (−0.5 в шейдере) | `shore.glsl` |
| 3 | Никаких inline `shoreFbm` — только texture lookup | `shore.glsl`, поиск по репозиторию |
| 4 | `cloudDensity(uv, t, phase01, out base, detailLOD)` — 5 параметров | `clouds.glsl` |
| 5 | `shadeSkyDirection(dir, phase01, sunCol, sunDir, cloudDetail)` — 5 параметров | `sky.glsl` |
| 6 | Direct sky → `detailLOD=1.0`, reflection → `detailLOD=0.0` | все call sites в `main` |
| 7 | `linear→sRGB` только в `FinalColorPass`. Никакого `pow(col, 1/2.2)` в других pass-ах | `post/final-color.frag` |
| 8 | Texture units: 0=textTex, 1=rippleTex, 2=free, 3=shoreProfileTex, 4=titlePhraseTex | `LandscapePass.ts` |
| 9 | Title reflection: `u_titlePhraseTex` по local metric, без per-fragment glyph loops | `title.glsl` |
| 10 | Fog timing: `FOG_DISSIPATE_END (0.58) ≤ TITLE_REVEAL_START (0.62)` | `constants.glsl` |
| 11 | Height fog: `fogAmount = 1 - exp(-tau)`, не просто `tau` | `fog.glsl` |
| 12 | Порядок pass-ов неизменен: landscape → bushes → fog → heroTitle → glow → final | `LandscapeScene.ts` |

---

## Checklist для каждой итерации

```
□ bun run check   (TypeScript + Svelte — 0 ошибок)
□ bun run build   (успешная сборка)
□ Визуальный прогон всех passView (final / ripple / vegetation / fog / glow / landscape)
□ Визуальный прогон по scroll 0.00 / 0.25 / 0.50 / 0.75 / 1.00
□ Все 12 инвариантов из таблицы выше сохранены
□ docs/render-status.md обновлён
□ Коммит-сообщение конкретное ("refactor: extract TitleResources from LandscapeResources")
```

---

## Справочник по источникам

Ниже — конкретные источники с указанием того, что именно из них брать.

### Шум и fBM

| Ссылка | Что применять |
|---|---|
| [Book of Shaders — Noise ch.11](https://thebookofshaders.com/11/) | Базовые паттерны value noise, интерполяция. Применять к `noise.glsl` при аудите |
| [Book of Shaders — fBM ch.13](https://thebookofshaders.com/13/) | Параметры octaves, lacunarity, gain для `cloudBaseFbm` / `cloudDetailFbm`. Ссылаться при тюнинге облаков и ряби |
| [Book of Shaders — Procedural Textures](https://thebookofshaders.com/examples/?chapter=proceduralTexture) | Каталог техник для комбинирования шума, масок, smoothstep. Полезен при улучшении водных поверхностей |

### Ошибки и безопасность

| Ссылка | Что применять |
|---|---|
| [GM Shaders — Common Shader Mistakes](https://mini.gmshaders.com/p/mistakes) | **Must-read перед правкой шейдеров.** Секции: NaN/black screen, magic numbers, texture coordinates, gamma/dithering. Применять при аудите `math.glsl` |
| [IQ — hwinterpolation](https://iquilezles.org/articles/hwinterpolation/) | Текстурная интерполяция с шагом 1/256 — учитывать при масштабировании `u_shoreProfileTex` |

### Оптимизации

| Ссылка | Что применять |
|---|---|
| [GM Shaders — Code Golfing](https://mini.gmshaders.com/p/code-golfing) | Упрощение выражений, `dot(v,v)` вместо `length(v)²`, переиспользование вычислений. Применять к `water_waves.glsl` и `fog.glsl` |
| [IQ — Distance Functions](https://iquilezles.org/articles/distfunctions/) | Математика SDF для shoreline masks, шейдинга берега. Применять при улучшении `shorelineTransitionSdf` |

### SDF и формы

| Ссылка | Что применять |
|---|---|
| [GM Shaders — SDF Tricks](https://mini.gmshaders.com/p/gm-shaders-mini-sdf-tricks) | Мягкие объединения, AA через SDF, подход к свечению/отражению текста. Применять к `title.glsl` и shoreline masks |
| [GM Shaders — Raymarching](https://mini.gmshaders.com/p/gm-shaders-mini-raymarching-1351092) | Организация raymarching шагов; полезен как референс для `intersectShore` / `intersectTitleBillboard` |

### Цвет и пост-процессинг

| Ссылка | Что применять |
|---|---|
| [GM Shaders — Design Choices](https://mini.gmshaders.com/p/design-choices) | Общая философия выбора техник; применять при принятии решений о балансе visual/perf |
| [GM Shaders — Oklab](https://mini.gmshaders.com/p/oklab) | Перцептуально равномерное цветовое пространство. Рассмотреть для `colors.glsl` если нужна точная интерполяция цветов |
| [Björn Ottosson — colorwrong](https://bottosson.github.io/posts/colorwrong/) | Объяснение почему sRGB-интерполяция неверна. Обосновывает наличие `FinalColorPass` |
| [GPU Gems 3 ch.24 — Linear Workflow](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-24-importance-being-linear) | Теоретическое обоснование linear-first pipeline |

### Архитектура WebGL

| Ссылка | Что применять |
|---|---|
| [WebGL2 Fundamentals — Shaders and GLSL](https://webgl2fundamentals.org/webgl/lessons/webgl-shaders-and-glsl.html) | Как думать о shader pipeline при разнесении LandscapeResources |
| [Book of Shaders — Running your shader](https://thebookofshaders.com/04/) | Референс по подключению uniforms/resolution/time — полезен при отладке нового chunk-pipeline |

### Атмосфера и туман

| Ссылка | Что применять |
|---|---|
| [Forward Scattering — Height Fog](https://forwardscattering.org/post/72) | Вывод формулы для `expHeightFogOpticalDepth`. Проверять при изменении `fog.glsl` |
| [Scratchapixel — Volume Rendering](https://www.scratchapixel.com/lessons/3d-basic-rendering/volume-rendering-for-developers/intro-volume-rendering.html) | Beer-Lambert / transmittance. Обосновывает `T = exp(-tau)` |
| [IQ — Fog](https://iquilezles.org/articles/fog/) | Non-constant density path; напоминание: `fogAmount = 1 - exp(-tau)`, не `tau` |

---

## Что не трогать

```
❌ Не добавлять vite-plugin-glsl (внешняя зависимость с runtime-поведением)
❌ Не переименовывать shadeSkyDirection, cloudDensity, intersectTitleAtlas и др. — они в инвариантах
❌ Не изменять логику в void main() одновременно с перемещением функций в чанки
❌ Не добавлять uniforms в чанки — только в _entry.frag
❌ Не "улучшать" математику на шаге сплита (Фаза 5) — только перемещение
❌ Не добавлять новые fullscreen passes без явного требования
❌ Не трогать pipeline-порядок (landscape → bushes → fog → heroTitle → glow → final)
```
