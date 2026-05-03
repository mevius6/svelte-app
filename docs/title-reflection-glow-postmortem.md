# Title Reflection Glow — Postmortem и план возврата

Дата: 2026-05-03
Статус: reflection glow на воде отключён (стабильный fallback)

## 1) Цель

Убрать белую/светлую обводку вокруг отражённого текста на воде и получить мягкое,
атмосферное свечение, визуально близкое к основному title glow.

## 2) Наблюдаемые артефакты

1. Гребенчатый/пикселизованный паттерн отражения.
2. Контурная обводка вместо мягкого halo.
3. Тонкая рамка phrase-rect и паразитная засветка между буквами.

## 3) Поэтапный разбор патчей

### Шаг A — стабилизация reflection coverage (phrase path)

Файл: `src/lib/shaders/landscape.frag`

Изменения:
- `sampleTitlePhraseReflectionCoverage(...)` переведён с `fwidth(phraseUv)` на фиксированный мягкий радиус.
- `uvEdgeFade` расширен: `smoothstep(0.025, 0.090, edgeUv)`.
- добавлен `glyphProximity` для подавления glow в пустом фоне между буквами.

Зачем:
- в отражении (скользящий угол) экранные производные UV нестабильны; это ломает MSDF-aa.

Итог:
- часть прямоугольных артефактов ушла, но полностью проблема не исчезла.

### Шаг B — сглаживание нормали для reflection ray

Файл: `src/lib/shaders/landscape.frag`

Изменение:
- `titleNormBlend`:
  - было: `smoothstep(0.0, 0.48, rippleStrength) * 0.70`
  - стало: `0.30 + smoothstep(0.0, 0.48, rippleStrength) * 0.42`

Зачем:
- снизить "сканирование" MSDF отражающим лучом на спокойной воде.

Итог:
- меньше дрожания формы, но контурный артефакт glow всё ещё появлялся.

### Шаг C — ослабление fill в reflection composite

Файл: `src/lib/shaders/landscape.frag`

Изменение:
- `titleReflFill` вес `0.28 -> 0.18`.

Зачем:
- уменьшить жёсткий контурный вклад, читающийся как обводка.

Итог:
- картинка мягче, но не устраняет первопричину полностью.

### Шаг D — найден важный ранний источник артефакта (pre-gate)

Файл: `src/lib/shaders/landscape.frag`

Изменения:
- `sampleTitlePhraseAlpha(...)` (используется в `intersectTitleAtlas`) тоже переведён
  на фиксированный soft radius + `glyphProximity`.
- порог раннего отсечения: `alpha > 0.012 -> alpha > 0.001`.

Почему это критично:
- артефакт рождался ДО финального reflection coverage.
- старый pre-gate на `fwidth` мог давать дискретные провалы/гребёнку при рефракции волн.

Итог:
- заметно стабилизирует отражение глифов, но reflected glow всё равно оставался источником
  тонкой контурной обводки в ряде кадров/фаз.

### Шаг E — fallback: выключить reflected glow

Файл: `src/lib/shaders/landscape.frag`

Изменение:
- убран glow composite в отражении (billboard + phrase path).
- оставлено только отражение текста (fill path) и стабилизация MSDF.

Итог:
- самый надёжный режим: белая halo-обводка не формируется.

### Шаг F — controlled re-enable (эксперимент)

Файлы:
- `src/lib/shaders/landscape.frag`
- `src/lib/passes/LandscapePass.ts`
- `src/lib/scene/LandscapeScene.ts`
- `src/lib/components/LandscapeViewport.svelte`

Изменения:
- введён toggle `reflectionGlowEnabled` + uniform `u_titleReflectionGlowEnabled`.
- glow ограничен `nightMask`, low-cap alpha, halo-only mask.

Итог:
- в ряде сцен/ракурсов всё ещё проявлялась тонкая обводка.
- эксперимент признан недостаточно надёжным.

### Шаг G — rollback к стабильному варианту

Текущее состояние:
- reflected glow снова отключён.
- сохранены стабилизации reflection MSDF (Шаги A-D), полезные даже без glow.

## 4) Почему задача оказалась сложной

1. Отражение текста зависит от волновых нормалей и нестабильных углов луча.
2. Любая добавка halo в том же pass, где живёт отражённый fill, легко превращается
   в контурный ring при градиенте MSDF.
3. Даже низкий alpha halo может визуально "проявляться" как обводка на ровной воде.

## 5) Текущий стабильный baseline

- Reflection glow на воде: **OFF**.
- Reflection text fill: **ON**.
- Сохранены анти-алиас правки MSDF reflection:
  - fixed soft radius в `sampleTitlePhraseReflectionCoverage`.
  - fixed soft radius + мягкий threshold в `sampleTitlePhraseAlpha`.
  - `glyphProximity` suppression.
  - `titleNormBlend` с базой `0.30`.
  - `titleReflFill` вес `0.18`.

## 6) План безопасного возврата к эффекту в будущем

1. Не смешивать halo в текущем reflection fill пути напрямую.
2. Делать reflected glow отдельным контролируемым этапом, где источник формируется
   только из narrow-band signed-distance и проходит явный blur (без UV-rect background).
3. Держать жёсткий cap alpha и night-gating.
4. Обязательная проверка в debug `landscape/reflection` на фазах:
   `0.92 / 0.96 / 1.00` и разных ripple-амплитудах.

## 7) Референсы

Локальные документы:
- `docs/night-phase-review.txt`
- `docs/landscape-refactor-guide.md`

Внешние источники (из `landscape-refactor-guide.md`):
- GM Shaders — Common Shader Mistakes:
  https://mini.gmshaders.com/p/mistakes
- GM Shaders — SDF Tricks:
  https://mini.gmshaders.com/p/gm-shaders-mini-sdf-tricks
- Book of Shaders — Noise (ch.11):
  https://thebookofshaders.com/11/
- Book of Shaders — fBM (ch.13):
  https://thebookofshaders.com/13/
- IQ — Distance Functions:
  https://iquilezles.org/articles/distfunctions/
- IQ — Fog:
  https://iquilezles.org/articles/fog/
- Björn Ottosson — colorwrong:
  https://bottosson.github.io/posts/colorwrong/
- GPU Gems 3, ch.24 (Linear workflow):
  https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-24-importance-being-linear

## 8) Рекомендация для следующей итерации

Стартовать от текущего baseline (без reflected glow) и делать новую ветку
`experiment/reflection-glow-v2` с отдельным pass-прототипом и визуальным QA-чеклистом.
