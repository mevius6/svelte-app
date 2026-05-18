# Пространства заголовка и поток данных

Цель: зафиксировать единый способ думать о заголовке (фраза/цифры), чтобы следующие итерации и рефакторинг не повторяли баг с «растянутым» текстом.

---

## 1. Три пространства заголовка

Заголовок живёт сразу в трёх «пространствах». Их нельзя смешивать.

### 1.1 Пространство макета (layout space)

**Термин:** «пространство макета», размер — «размер макета заголовка», отношение сторон — «соотношение сторон макета».

- Единицы: абстрактные, завязаны на `HeroTitlePhraseGpuLayout`.
- Источник: `phraseLayout.width`, `phraseLayout.height`.
- Используется:
  - для GPU‑раскладки глифов заголовка в `HeroTitlePass`,
  - для преобразования `hitPos → UV` в glow и reflection (`titleLocalMetricFromHitPos`, `titlePhraseUvFromLocalMetric`).
- Ментальная модель: «геометрический макет заголовка» — насколько широким и высоким считается текст в своих условных единицах.

**Соотношение сторон макета**

```ts
layoutAspect = phraseLayout.width / phraseLayout.height
```

В доке: **«соотношение сторон макета заголовка»**.

### 1.2 Пространство текстуры (texture space)

**Термин:** «пространство текстуры», размер — «размер текстуры фразы заголовка».

- Единицы: пиксели phrase‑текстуры (canvas, precomposed MSDF).
- Источник: `phraseTextureSize.width`, `phraseTextureSize.height`.
- Используется:
  - для uniform’а `u_titlePhraseTexSize`,
  - для расчёта `pxRange` в MSDF‑шейдерах (`titlePhraseScreenPxRange`).
- Модель: «на каком реальном холсте (в пикселях) напечатан макет заголовка».

### 1.3 Пространство мира (world space)

**Термин:** «пространство мира», размер — «мировой размер заголовка», соотношение сторон — «соотношение сторон заголовка в мире».

- Единицы: метры/юниты сцены (`TitleHeroState` и камера).
- Источник: `titleHero.size.w/h`, `titleHero.center`.
- Используется:
  - в `hero-title.vert` для размещения глиф‑квадов заголовка,
  - в glow/reflection для пересечения луча с плоскостью заголовка и расчёта `hitPos`.

**Соотношение сторон заголовка в мире** получается из соотношения сторон макета + высоты в мире:

```glsl
float layoutAspect = u_titleLayoutSize.x / max(u_titleLayoutSize.y, 0.001); // соотношение сторон макета
float worldHeight  = u_titleWorldSize.y;
float worldWidth   = worldHeight * layoutAspect; // ширина заголовка в мире
```

---

## 2. Источники данных заголовка

### 2.1 TitleResources

Загружает MSDF‑атлас и строит:

- **макет заголовка** (логические метрики),
- **GPU‑раскладку глифов заголовка**,
- **текстуру фразы заголовка**.

**Фраза заголовка**

```ts
export type HeroTitleAtlasRenderData = {
  atlas: HeroTitleAtlasResource
  gpuLayout: HeroTitlePhraseGpuLayout          // GPU‑раскладка фразы заголовка в пространстве макета
  phraseTexture: WebGLTexture | null           // MSDF‑текстура фразы заголовка
  phraseTextureSize: { width: number; height: number } // размер текстуры фразы заголовка
}
```

- `gpuLayout.phraseLayout.width/height` → размер макета фразы заголовка.
- `phraseTexture` + `phraseTextureSize` → текстура фразы заголовка в пространстве текстуры.

**Цифровой заголовок 1..7**

```ts
export type HeroTitleDigitRenderData = {
  digit: number
  gpuLayout: HeroTitlePhraseGpuLayout
  phraseTexture: WebGLTexture | null
  phraseTextureSize: { width: number; height: number }
}
```

Каждая цифра заголовка имеет свой макет (через `gpuLayout.phraseLayout`) и свою текстуру фразы.

### 2.2 FrameState (LandscapeScene)

Для активного заголовка (фраза или цифра) `FrameState` хранит:

```ts
interface FrameState {
  ...
  heroTitleAtlasRenderData: HeroTitleAtlasRenderData | null
  heroTitleAtlas: HeroTitleAtlasResource | null

  // Активный заголовок (фраза или цифра)
  activeTitleRenderData: HeroTitleAtlasRenderData | null

  // Пространство макета
  activeLayoutSize: { width: number; height: number } | null

  // Пространство текстуры
  activePhraseTexSize: { width: number; height: number } | null

  useGlyphTitle: boolean

  digit: number
  digitTitleRenderData: HeroTitleDigitRenderData | null
}
```

Выбор активного заголовка (упрощённо):

```ts
const phraseGlyphRenderData = heroTitleAtlasRenderData?.atlas.texture
  ? heroTitleAtlasRenderData
  : null

const digitGlyphRenderData: HeroTitleAtlasRenderData | null =
  heroTitleAtlas?.texture && digitTitleRenderData
    ? {
        atlas: heroTitleAtlas,
        gpuLayout: digitTitleRenderData.gpuLayout,
        phraseTexture: digitTitleRenderData.phraseTexture,
        phraseTextureSize: digitTitleRenderData.phraseTextureSize,
      }
    : null

const activeTitleRenderData =
  this.titleRenderMode === "digit" ? digitGlyphRenderData : phraseGlyphRenderData

const useGlyphTitle = Boolean(
  activeTitleRenderData?.atlas.texture && activeTitleRenderData.gpuLayout
)
```

**Размер макета заголовка (пространство макета)**

```ts
const activeLayoutSize = activeTitleRenderData?.gpuLayout
  ? {
      width:  activeTitleRenderData.gpuLayout.phraseLayout.width,
      height: activeTitleRenderData.gpuLayout.phraseLayout.height,
    }
  : {
      width:  this.resources.heroTitleLayout.width,
      height: this.resources.heroTitleLayout.height,
    }
```

- `activeLayoutSize.width/height` → размеры макета активного заголовка (фраза или цифра).
- Соотношение сторон макета: `activeLayoutSize.width / activeLayoutSize.height`.

**Размер текстуры фразы заголовка (пространство текстуры)**

```ts
const activePhraseTexSize =
  activeTitleRenderData?.phraseTextureSize ?? null
```

- `activePhraseTexSize.width/height` → физический размер текстуры фразы заголовка.

---

## 3. Uniform’ы и их роль

### 3.1 HeroTitlePass — макет заголовка + мир

Сетап:

```ts
this.program.use();

this.program.setVec3("u_titleWorldCenter",
  this.titleHero.center.x,
  this.titleHero.center.y,
  this.titleHero.center.z
);

this.program.setVec2("u_titleWorldSize",
  this.titleHero.size.w,
  this.titleHero.size.h
);

const layoutWidth  = this.layoutSize?.width  ?? this.phraseLayout.width;
const layoutHeight = this.layoutSize?.height ?? this.phraseLayout.height;
this.program.setVec2("u_titleLayoutSize", layoutWidth, layoutHeight);
```

В `hero-title.vert`:

```glsl
float layoutAspect = u_titleLayoutSize.x / max(u_titleLayoutSize.y, 0.001); // соотношение сторон макета заголовка
float worldHeight  = u_titleWorldSize.y;
float worldWidth   = worldHeight * layoutAspect; // мировая ширина заголовка

vec3 worldPos = u_titleWorldCenter
              + titleRight * (localNorm.x * worldWidth)
              + titleUp    * (localNorm.y * worldHeight);
```

Итого:

- `u_titleLayoutSize` — размер макета заголовка.
- `u_titleWorldSize` — мировые размеры заголовка.
- Соотношение сторон макета определяет соотношение сторон заголовка в мире.

### 3.2 TitleGlowPass — glow вокруг заголовка

Сетап:

```ts
this.sourceProgram.use();

this.sourceProgram.setVec3("u_titleWorldCenter",
  this.titleHero.center.x,
  this.titleHero.center.y,
  this.titleHero.center.z
);

this.sourceProgram.setVec2("u_titleWorldSize",
  this.titleHero.size.w,
  this.titleHero.size.h
);

this.sourceProgram.setTexture("u_titlePhraseTex", this.phraseTexture, 0);
this.sourceProgram.setVec2(
  "u_titlePhraseTexSize",
  Math.max(this.phraseTextureSize.width, 1),
  Math.max(this.phraseTextureSize.height, 1)
);
this.sourceProgram.setFloat("u_titleAtlasPxRange", this.titleAtlasPxRange);
```

В `title-glow.frag`:

```glsl
vec2 titlePhraseUvFromLocalMetric(vec2 localMetric) {
    return vec2(
        localMetric.x / max(u_titleLayoutSize.x, 0.001) + 0.5,
        localMetric.y / max(u_titleLayoutSize.y, 0.001) + 0.5
    );
}

vec2 titleLocalMetricFromHitPos(vec3 hitPos) {
    vec3 titleRight = glowBillboardRight();
    vec3 titleUp    = vec3(0.0, 1.0, 0.0);
    vec3 local      = hitPos - u_titleWorldCenter;

    float layoutAspect = u_titleLayoutSize.x / max(u_titleLayoutSize.y, 0.001); // соотношение сторон макета заголовка
    float worldHeight  = u_titleWorldSize.y;
    float worldWidth   = worldHeight * layoutAspect;

    float nx = dot(local, titleRight) / max(worldWidth, 0.001);
    float ny = dot(local, titleUp)    / max(worldHeight, 0.001);

    return vec2(
        nx * u_titleLayoutSize.x,
        ny * u_titleLayoutSize.y
    );
}
```

MSDF‑часть:

```glsl
vec2 phraseUv = titlePhraseUvFromLocalMetric(localMetric);

float titlePhraseScreenPxRange(vec2 phraseUv) {
    vec2 unitRange     = vec2(u_titleAtlasPxRange) / max(u_titlePhraseTexSize, vec2(1.0));
    vec2 screenTexSize = vec2(1.0) / max(fwidth(phraseUv), vec2(1e-5));
    return max(0.5 * dot(unitRange, screenTexSize), 1.0);
}
```

Итого:

- `u_titleLayoutSize` — размер макета заголовка; его соотношение сторон задаёт форму UV.
- `u_titleWorldSize` — мировые размеры заголовка; вместе с макетом определяют форму заголовка в мире.
- `u_titlePhraseTexSize` — размер текстуры фразы заголовка; влияет только на качество и толщину MSDF‑штриха, не на геометрию.

---

## 4. Типичная ошибка и как её избежать

### Ошибка

Ранее `FrameState.activeLayoutSize` заполнялся по размеру текстуры фразы заголовка:

```ts
activeLayoutSize = activeTitleRenderData?.phraseTextureSize
  ? {
      width:  activeTitleRenderData.phraseTextureSize.width,
      height: activeTitleRenderData.phraseTextureSize.height,
    }
  : {
      width:  this.resources.heroTitleLayout.width,
      height: this.resources.heroTitleLayout.height,
    }
```

Этот размер макета стал равен размеру текстуры, а затем:

- шёл в `u_titleLayoutSize` HeroTitlePass,
- и в `u_titleLayoutSize` TitleGlowPass.

Эффект:

- Соотношение сторон заголовка стало определяться пиксельным размером текстуры, а не логическим макетом.
- Соотношение сторон в мире «поехало» → визуально заголовок выглядел растянутым.

### Правильный паттерн

- Для формы/геометрии/соотношения сторон заголовка:
  - использовать **размер макета заголовка**:

    ```ts
    activeLayoutSize.width  = gpuLayout.phraseLayout.width;
    activeLayoutSize.height = gpuLayout.phraseLayout.height;
    ```

- Для качества рендеринга MSDF:
  - использовать **размер текстуры фразы заголовка**:

    ```ts
    activePhraseTexSize.width  = phraseTextureSize.width;
    activePhraseTexSize.height = phraseTextureSize.height;
    ```

**Чек‑вопрос**

> Нужен размер, чтобы понять форму / соотношение сторон заголовка (в макете или в мире)?
> → берём **размер макета заголовка** (`phraseLayout.width/height`, `u_titleLayoutSize`).

> Нужен размер, чтобы понять детализацию / резкость текстуры шрифта?
> → берём **размер текстуры фразы заголовка** (`phraseTextureSize`, `u_titlePhraseTexSize`).

---

## 5. Рекомендуемая терминология и нейминг для уменьшения путаницы

Рекомендуемые имена (для будущего рефакторинга):

- `layoutSize` → `logicalLayoutSize` или `msdfLayoutSize`.
- `phraseTextureSize` → `msdfTextureSize`.
- `worldSize` → `titleWorldSize`.

Для кода и документации проекта:

- **title** → «заголовок»
  - `HeroTitle` → «герой‑заголовок» (основной заголовок сцены),
  - `TitleHeroState` → «состояние героя‑заголовка»,
  - `TitleGlowPass` → «пасс свечения вокруг заголовка».

- **layout** → «макет»
  - `HeroTitleLayoutMetrics` → «метрики макета заголовка»,
  - `layoutSize` → «размер макета заголовка»,
  - `layoutAspect` → «соотношение сторон макета заголовка».

- **glyph layout / gpuLayout** → «GPU‑раскладка фразы заголовка» / «раскладка глифов заголовка в макете».

- **aspect**:
  - в пространстве макета → «соотношение сторон макета заголовка»,
  - в мире → «соотношение сторон заголовка в мире».

- **phraseTextureSize** → «размер текстуры фразы заголовка» (или «размер MSDF‑текстуры фразы заголовка»).

Правило:

> Любой код, который влияет на форму заголовка (размер в мире, соотношение сторон макета, UV), должен опираться на **макет заголовка** и его **соотношение сторон**, а не на размер текстуры фразы заголовка.

## Полезные ссылки

- [Awesome MSDF](https://github.com/Blatko1/awesome-msdf)
- [Signed Distance Field Rendering](https://deepwiki.com/ficool2/sdk_screenspace_shaders/7.7-signed-distance-field-rendering)
- [MSDF Fragment Shader Antialiasing](https://www.fractolog.com/2025/01/msdf-fragment-shader-antialiasing/)
- [WebGPU Text Rendering - MSDF](https://webgpu.github.io/webgpu-samples/?sample=textRenderingMsdf)
