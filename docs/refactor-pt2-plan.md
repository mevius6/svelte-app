# План рефакторинга title / glow

Цель: довести титр до одной универсальной схемы данных и координат, убрать дублирующие ветки (цифра/фраза) и зафиксировать текущие правки как «новую норму» для glow.

---

## 1. Цель архитектуры

- Один **универсальный формат TitleRenderData** для всей цепочки: hero‑title, glow, отражение.
- Один набор uniforms и GLSL‑утилит: `u_titleWorldSize`, `u_titleLayoutSize`, `u_titlePhraseTex`, `u_titlePhraseTexSize`, `u_titleAtlasPxRange`.
- Любой текст (фраза или цифра) обрабатывается одинаково, различается только содержимое layout’а/текстуры.

---

## 2. Рефакторинг данных (TypeScript)

### 2.1. Унифицировать renderData в TitleResources

В `TitleResources` ввести единый тип, например:

```ts
type TitleRenderDataUnified = {
  layoutSize: { width: number; height: number }
  phraseTexture: WebGLTexture | null
  phraseTextureSize: { width: number; height: number }
  atlas: HeroTitleAtlasResource | null
  gpuLayout: HeroTitlePhraseGpuLayout | null
  digit: number | null
}
```

- `buildHeroTitleAtlasRenderData` → возвращает `digit: null`.
- `getDigitRenderData(digit)` → возвращает такой же тип с `digit: n` и своей `phraseTexture`.

### 2.2. FrameState в LandscapeScene

В `LandscapeScene.buildFrameState`:

```ts
const phraseData = this.resources.heroTitleAtlasRenderData  // фраза
const digitData = this.resources.getDigitRenderData(currentDigit) // цифра или null

const activeTitleRenderData = digitData ?? phraseData
```

Добавить `activeLayoutSize`:

```ts
const activeLayoutSize = activeTitleRenderData
  ? {
      width: activeTitleRenderData.phraseTextureSize.width,
      height: activeTitleRenderData.phraseTextureSize.height,
    }
  : {
      width: titleLayout.width,
      height: titleLayout.height,
    }
```

Расширить `FrameState`:

```ts
type FrameState = {
  ...
  activeTitleRenderData: TitleRenderDataUnified | null
  activeLayoutSize: { width: number; height: number }
}
```

### 2.3. HeroTitlePass: setupHeroTitleState

HeroTitlePass должен читать только **универсальные** поля:

```ts
this.heroTitle.setFrameState({
  camera: frame.camera,
  phase: this.scrollNorm,
  waterLevel: WATER_LEVEL,
  titleHero: frame.titleHero,
  atlas: frame.heroTitleAtlasRenderData?.atlas ?? null,
  gpuLayout: frame.activeTitleRenderData?.gpuLayout ?? null,
  digit: frame.activeTitleRenderData?.digit ?? 1,
  layoutSize: frame.activeLayoutSize,
})
```

### 2.4. TitleGlowPass: setupTitleGlowState

Glow всегда читает **активное** renderData:

```ts
const active = frame.activeTitleRenderData

this.titleGlow.setFrameState({
  enabled: this.glowEnabled,
  debugIsolate: this.passView === "glow",
  camera: frame.camera,
  phase: this.scrollToPhase(this.scrollNorm),
  waterLevel: WATER_LEVEL,
  titleHero: frame.titleHero,
  phraseTexture: active?.phraseTexture ?? null,
  phraseTextureSize: active?.phraseTextureSize ?? { width: 1, height: 1 },
  titleAtlasPxRange: frame.heroTitleAtlasRenderData?.atlas.font.atlas.distanceRange ?? 4,
  layoutSize: frame.activeLayoutSize,
})
```

Критично: **не использовать heroTitleAtlasRenderData.phraseTexture, когда активна цифра** — только `activeTitleRenderData`.

### 2.5. TitleGlowPass: хранить layoutSize

В `TitleGlowPass.ts` добавить layout:

```ts
type TitleGlowFrameState = {
  enabled: boolean
  debugIsolate: boolean
  camera: SceneCameraState
  phase: number
  waterLevel: number
  titleHero: TitleHeroState
  phraseTexture: WebGLTexture | null
  phraseTextureSize: { width: number; height: number }
  titleAtlasPxRange: number
  layoutSize?: { width: number; height: number } | null
}

private layoutSize = { width: 1, height: 1 }

setFrameState(state: TitleGlowFrameState) {
  this.enabled = state.enabled
  this.debugIsolate = state.debugIsolate
  this.camera = state.camera
  this.phase = state.phase
  this.waterLevel = state.waterLevel
  this.titleHero = state.titleHero
  this.phraseTexture = state.phraseTexture
  this.phraseTextureSize = state.phraseTextureSize
  this.titleAtlasPxRange = state.titleAtlasPxRange
  this.layoutSize = state.layoutSize ?? state.phraseTextureSize
}
```

В `render`:

```ts
this.sourceProgram.setVec2(
  "u_titleLayoutSize",
  this.layoutSize.width,
  this.layoutSize.height
)
```

---

## 3. Рефакторинг шейдеров

### 3.1. Hero-title.vert — эталонная геометрия

Зафиксировать схему масштабирования:

```glsl
float layoutAspect = u_titleLayoutSize.x / max(u_titleLayoutSize.y, 0.001);
float worldHeight = u_titleWorldSize.y;
float worldWidth  = worldHeight * layoutAspect;

vec3 titleRight = titleBillboardRight();
vec3 titleUp    = vec3(0.0, 1.0, 0.0);

vec3 worldPos = u_titleWorldCenter
              + titleRight * (localNorm.x * worldWidth)
              + titleUp    * (localNorm.y * worldHeight);
```

Эта схема уже даёт корректный aspect для фразы и цифр.

### 3.2. Общие утилиты в title.glsl

Зафиксировать две центральные функции:

```glsl
vec2 titlePhraseUvFromLocalMetric(vec2 localMetric) {
    return vec2(
        localMetric.x / max(u_titleLayoutSize.x, 0.001) + 0.5,
        localMetric.y / max(u_titleLayoutSize.y, 0.001) + 0.5
    );
}

vec2 titleLocalMetricFromHitPos(vec3 hitPos) {
    vec3 titleRight = titleBillboardRight();
    vec3 titleUp = vec3(0.0, 1.0, 0.0);
    vec3 local = hitPos - u_titleWorldCenter;
    return vec2(
        dot(local, titleRight) / max(u_titleWorldSize.x, 0.001) * u_titleLayoutSize.x,
        dot(local, titleUp)    / max(u_titleWorldSize.y, 0.001) * u_titleLayoutSize.y
    );
}
```

Они ничего не знают о «цифра/фраза» — работают только через world и layout.

### 3.3. title-glow.frag — подключить к тем же координатам

Ключевые правки в `title-glow.frag`:

1) Uniforms:

```glsl
uniform vec3  u_titleWorldCenter;
uniform vec2  u_titleWorldSize;
uniform vec2  u_titleLayoutSize;
uniform sampler2D u_titlePhraseTex;
uniform vec2      u_titlePhraseTexSize;
uniform float     u_titleAtlasPxRange;
```

2) Утилиты (адаптированы из `title.glsl`):

```glsl
vec3 glowBillboardRight() {
    vec3 r = vec3(u_cameraRight.x, 0.0, u_cameraRight.z);
    float l = length(r);
    return l > 0.0001 ? r / l : vec3(1.0, 0.0, 0.0);
}

vec2 titlePhraseUvFromLocalMetric(vec2 localMetric) {
    return vec2(
        localMetric.x / max(u_titleLayoutSize.x, 0.001) + 0.5,
        localMetric.y / max(u_titleLayoutSize.y, 0.001) + 0.5
    );
}

vec2 titleLocalMetricFromHitPos(vec3 hitPos) {
    vec3 titleRight = glowBillboardRight();
    vec3 titleUp = vec3(0.0, 1.0, 0.0);
    vec3 local = hitPos - u_titleWorldCenter;

    float layoutAspect = u_titleLayoutSize.x / max(u_titleLayoutSize.y, 0.001);
    float worldHeight = u_titleWorldSize.y;
    float worldWidth  = worldHeight * layoutAspect;

    float nx = dot(local, titleRight) / max(worldWidth, 0.001);
    float ny = dot(local, titleUp)    / max(worldHeight, 0.001);

    return vec2(
        nx * u_titleLayoutSize.x,
        ny * u_titleLayoutSize.y
    );
}
```

3) Основной путь внутри `main`:

```glsl
vec3 hitPos = u_cameraPos + rayDir * t;

vec2 localMetric = titleLocalMetricFromHitPos(hitPos);
vec2 phraseUv    = titlePhraseUvFromLocalMetric(localMetric);

bool inBounds = all(greaterThanEqual(phraseUv, vec2(0.0))) &&
                all(lessThanEqual(phraseUv, vec2(1.0)));
if (!inBounds) {
    fragColor = vec4(0.0);
    return;
}

vec3 msdf = texture(u_titlePhraseTex, phraseUv).rgb;
float signedDistance = median3(msdf) - 0.5;
float pxRange = titlePhraseScreenPxRange(phraseUv);
float sdPx = signedDistance * pxRange;
float fill = clamp(sdPx + 0.5, 0.0, 1.0);
```

Старый код через `phraseAspect`, `worldWidth/worldHeight` из `u_titlePhraseTexSize` и `lx/ly` — удалить/закомментировать.

---

## 4. Документация проделанных правок (как changelog)

### HeroTitlePass

- Добавлен `layoutSize` в `HeroTitleFrameState`.
- В `render` `u_titleLayoutSize` теперь берётся из `layoutSize`/`phraseLayout` и задаёт aspect world‑прямоугольника.
- Масштаб текста в мире определяется через `(worldHeight, worldWidth = worldHeight * layoutAspect)`.

### TitleResources

- Реализован `getDigitRenderData(digit)` с отдельной phraseTexture и phraseTextureSize для цифр (1..7).
- `createTitlePhraseTexture` генерирует precomposed MSDF‑текстуру под произвольный `phraseLayout`.
- Общий подход: один atlas/font, разные phraseTexture для активной строки.

### TitleGlowPass

- Расширен `TitleGlowFrameState` полем `layoutSize`.
- В `setFrameState` сохраняется `layoutSize`, по умолчанию — `phraseTextureSize`.
- В `render` добавлена установка `u_titleLayoutSize`.
- Glow теперь использует те же `worldSize` и `layoutSize`, что и HeroTitlePass.

### title-glow.frag

- Добавлен uniform `u_titleLayoutSize`.
- Скопированы и адаптированы функции `titleLocalMetricFromHitPos` и `titlePhraseUvFromLocalMetric` из `title.glsl`, с использованием `glowBillboardRight`.
- Основная цепочка: `hitPos → localMetric → phraseUv → msdf → signedDistance`.
- Убрана старая логика через `lx/ly`, `phraseAspect` и `GLOW_PAD`, которая жила в другой системе координат.

---

## 5. Полезные материалы

- **GM Shaders Mini — Design Choices**
  Обсуждение архитектуры «atlas + layout + эффекты», выбор между per‑glyph MSDF и precomposed текстурами. [web:168]

- **GM Shaders Mini — Vector Spaces**
  Как не плодить параллельные системы координат и держать один «источник истины» для world/layout/uv. [web:171]

- **Red Blob Games — Signed Distance Field Fonts**
  Базовая теория SDF/MSDF‑шрифтов, масштабирование в screen‑space, работа с `fwidth`. [web:124]

- **Babylon.js MSDF Text docs**
  Практический пример MSDF‑рендеринга и настройки pxRange в шейдере. [web:164]

- **awesome‑msdf / three‑msdf‑text‑utils**
  Сборники и утилиты, подтверждающие паттерн: atlas + per‑glyph layout в одном домене. [web:163][web:166]
