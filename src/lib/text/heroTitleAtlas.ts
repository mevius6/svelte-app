export type HeroTitleLayoutMetrics = {
  width: number
  height: number
  aspect: number
  source: "canvas-fallback" | "msdf-atlas"
}

export type HeroTitleGlyphLayout = {
  unicode: number
  localBounds: {
    left: number
    bottom: number
    right: number
    top: number
  }
  atlasRect: {
    x: number
    y: number
    w: number
    h: number
  }
}

export type HeroTitlePhraseLayout = {
  width: number
  height: number
  glyphs: HeroTitleGlyphLayout[]
}

export type HeroTitlePhraseGpuLayout = {
  phraseLayout: HeroTitlePhraseLayout
  glyphBoundsData: Float32Array
  glyphAtlasData: Float32Array
}

export type HeroTitleGlyphMetric = {
  unicode: number
  advance: number
  planeBounds: {
    left: number
    bottom: number
    right: number
    top: number
  } | null
  atlasBounds: {
    left: number
    bottom: number
    right: number
    top: number
  } | null
}

export type HeroTitleAtlasFont = {
  format: "msdf-atlas-gen"
  atlas: {
    type: string
    width: number
    height: number
    size: number
    distanceRange: number
    imagePath: string | null
  }
  metrics: {
    lineHeight: number
    ascender: number
    descender: number
  }
  glyphs: HeroTitleGlyphMetric[]
  glyphMap: Map<number, HeroTitleGlyphMetric>
  kerningMap: Map<string, number>
}

type MsdfAtlasJson = {
  atlas?: {
    type?: unknown
    width?: unknown
    height?: unknown
    size?: unknown
    distanceRange?: unknown
    image?: unknown
  }
  metrics?: {
    lineHeight?: unknown
    ascender?: unknown
    descender?: unknown
  }
  glyphs?: Array<{
    unicode?: unknown
    advance?: unknown
    planeBounds?: {
      left?: unknown
      bottom?: unknown
      right?: unknown
      top?: unknown
    } | null
    atlasBounds?: {
      left?: unknown
      bottom?: unknown
      right?: unknown
      top?: unknown
    } | null
  }>
  kerning?: Array<{
    unicode1?: unknown
    unicode2?: unknown
    advance?: unknown
  }>
}

function toFinite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function normalizeBounds(
  bounds:
    | {
        left?: unknown
        bottom?: unknown
        right?: unknown
        top?: unknown
      }
    | null
    | undefined
) {
  if (!bounds) {
    return null
  }

  const left = toFinite(bounds.left, 0)
  const bottom = toFinite(bounds.bottom, 0)
  const right = toFinite(bounds.right, left)
  const top = toFinite(bounds.top, bottom)

  return { left, bottom, right, top }
}

function kerningKey(unicode1: number, unicode2: number) {
  return `${unicode1}:${unicode2}`
}

export function parseHeroTitleAtlas(
  raw: unknown,
  fallbackImagePath: string | null = null
): HeroTitleAtlasFont | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const data = raw as MsdfAtlasJson
  if (!Array.isArray(data.glyphs) || data.glyphs.length === 0) {
    return null
  }

  const glyphs: HeroTitleGlyphMetric[] = []
  const glyphMap = new Map<number, HeroTitleGlyphMetric>()
  for (const rawGlyph of data.glyphs) {
    const unicode = toFinite(rawGlyph?.unicode, NaN)
    if (!Number.isFinite(unicode)) {
      continue
    }

    const glyph: HeroTitleGlyphMetric = {
      unicode,
      advance: toFinite(rawGlyph?.advance, 0),
      planeBounds: normalizeBounds(rawGlyph?.planeBounds),
      atlasBounds: normalizeBounds(rawGlyph?.atlasBounds),
    }

    glyphs.push(glyph)
    glyphMap.set(unicode, glyph)
  }

  if (glyphs.length === 0) {
    return null
  }

  const kerningMap = new Map<string, number>()
  for (const pair of data.kerning ?? []) {
    const unicode1 = toFinite(pair?.unicode1, NaN)
    const unicode2 = toFinite(pair?.unicode2, NaN)
    if (!Number.isFinite(unicode1) || !Number.isFinite(unicode2)) {
      continue
    }
    kerningMap.set(kerningKey(unicode1, unicode2), toFinite(pair?.advance, 0))
  }

  return {
    format: "msdf-atlas-gen",
    atlas: {
      type: typeof data.atlas?.type === "string" ? data.atlas.type : "msdf",
      width: Math.max(toFinite(data.atlas?.width, 0), 0),
      height: Math.max(toFinite(data.atlas?.height, 0), 0),
      size: Math.max(toFinite(data.atlas?.size, 1), 1),
      distanceRange: Math.max(toFinite(data.atlas?.distanceRange, 4), 0),
      imagePath: typeof data.atlas?.image === "string" ? data.atlas.image : fallbackImagePath,
    },
    metrics: {
      lineHeight: Math.max(toFinite(data.metrics?.lineHeight, 1), 1),
      ascender: toFinite(data.metrics?.ascender, 0),
      descender: toFinite(data.metrics?.descender, 0),
    },
    glyphs,
    glyphMap,
    kerningMap,
  }
}

export function measureHeroTitleLayoutFromAtlas(
  text: string,
  atlas: HeroTitleAtlasFont
): HeroTitleLayoutMetrics {
  const layout = buildHeroTitlePhraseLayout(text, atlas)
  if (layout) {
    return {
      width: layout.width,
      height: layout.height,
      aspect: layout.height / layout.width,
      source: "msdf-atlas",
    }
  }

  const chars = Array.from(text.toUpperCase())
  let penX = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let prevUnicode: number | null = null
  let hadBounds = false

  for (const char of chars) {
    const unicode = char.codePointAt(0)
    if (unicode == null) {
      continue
    }

    if (prevUnicode != null) {
      penX += atlas.kerningMap.get(kerningKey(prevUnicode, unicode)) ?? 0
    }

    const glyph = atlas.glyphMap.get(unicode)
    if (!glyph) {
      prevUnicode = unicode
      continue
    }

    if (glyph.planeBounds) {
      const left = penX + glyph.planeBounds.left
      const right = penX + glyph.planeBounds.right
      minX = Math.min(minX, left)
      maxX = Math.max(maxX, right)
      minY = Math.min(minY, glyph.planeBounds.bottom)
      maxY = Math.max(maxY, glyph.planeBounds.top)
      hadBounds = true
    }

    penX += glyph.advance
    prevUnicode = unicode
  }

  const width = hadBounds
    ? Math.max(maxX - minX, penX, 1e-3)
    : Math.max(penX, atlas.metrics.lineHeight * 0.5, 1e-3)
  const height = hadBounds
    ? Math.max(maxY - minY, atlas.metrics.lineHeight * 0.5, 1e-3)
    : Math.max(atlas.metrics.lineHeight, 1e-3)

  return {
    width,
    height,
    aspect: height / width,
    source: "msdf-atlas",
  }
}

export function buildHeroTitlePhraseLayout(
  text: string,
  atlas: HeroTitleAtlasFont
): HeroTitlePhraseLayout | null {
  const chars = Array.from(text.toUpperCase())
  let penX = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let prevUnicode: number | null = null
  const pendingGlyphs: Array<{
    unicode: number
    penX: number
    glyph: HeroTitleGlyphMetric
  }> = []

  for (const char of chars) {
    const unicode = char.codePointAt(0)
    if (unicode == null) {
      continue
    }

    if (prevUnicode != null) {
      penX += atlas.kerningMap.get(kerningKey(prevUnicode, unicode)) ?? 0
    }

    const glyph = atlas.glyphMap.get(unicode)
    if (!glyph) {
      prevUnicode = unicode
      continue
    }

    if (glyph.planeBounds && glyph.atlasBounds) {
      pendingGlyphs.push({ unicode, penX, glyph })
      minX = Math.min(minX, penX + glyph.planeBounds.left)
      maxX = Math.max(maxX, penX + glyph.planeBounds.right)
      minY = Math.min(minY, glyph.planeBounds.bottom)
      maxY = Math.max(maxY, glyph.planeBounds.top)
    }

    penX += glyph.advance
    prevUnicode = unicode
  }

  if (pendingGlyphs.length === 0) {
    return null
  }

  const layoutLeft = Math.min(minX, 0)
  const layoutRight = Math.max(maxX, penX)
  const layoutBottom = minY
  const layoutTop = maxY
  const width = Math.max(layoutRight - layoutLeft, 1e-3)
  const height = Math.max(layoutTop - layoutBottom, 1e-3)
  const centerX = (layoutLeft + layoutRight) * 0.5
  const centerY = (layoutBottom + layoutTop) * 0.5
  const atlasWidth = Math.max(atlas.atlas.width, 1)
  const atlasHeight = Math.max(atlas.atlas.height, 1)

  return {
    width,
    height,
    glyphs: pendingGlyphs.map(({ unicode, penX: glyphPenX, glyph }) => {
      const plane = glyph.planeBounds!
      const atlasBounds = glyph.atlasBounds!
      return {
        unicode,
        localBounds: {
          left: glyphPenX + plane.left - centerX,
          bottom: plane.bottom - centerY,
          right: glyphPenX + plane.right - centerX,
          top: plane.top - centerY,
        },
        atlasRect: {
          x: atlasBounds.left / atlasWidth,
          y: 1 - atlasBounds.top / atlasHeight,
          w: (atlasBounds.right - atlasBounds.left) / atlasWidth,
          h: (atlasBounds.top - atlasBounds.bottom) / atlasHeight,
        },
      }
    }),
  }
}

export function buildHeroTitlePhraseGpuLayout(
  text: string,
  atlas: HeroTitleAtlasFont
): HeroTitlePhraseGpuLayout | null {
  const phraseLayout = buildHeroTitlePhraseLayout(text, atlas)
  if (!phraseLayout) {
    return null
  }

  const glyphBoundsData = new Float32Array(phraseLayout.glyphs.length * 4)
  const glyphAtlasData = new Float32Array(phraseLayout.glyphs.length * 4)

  phraseLayout.glyphs.forEach((glyph, index) => {
    glyphBoundsData[index * 4 + 0] = glyph.localBounds.left
    glyphBoundsData[index * 4 + 1] = glyph.localBounds.bottom
    glyphBoundsData[index * 4 + 2] = glyph.localBounds.right
    glyphBoundsData[index * 4 + 3] = glyph.localBounds.top

    glyphAtlasData[index * 4 + 0] = glyph.atlasRect.x
    glyphAtlasData[index * 4 + 1] = glyph.atlasRect.y
    glyphAtlasData[index * 4 + 2] = glyph.atlasRect.w
    glyphAtlasData[index * 4 + 3] = glyph.atlasRect.h
  })

  return {
    phraseLayout,
    glyphBoundsData,
    glyphAtlasData,
  }
}

export function measureHeroTitleLayoutFromCanvas(
  metrics: TextMetrics,
  fontSize: number,
  letterSpacingPx: number
): HeroTitleLayoutMetrics {
  const width = Math.max(metrics.width + letterSpacingPx, 1)
  const fallbackHeight = fontSize * 0.92
  const height = Math.max(
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
    fallbackHeight
  )

  return {
    width,
    height,
    aspect: height / width,
    source: "canvas-fallback",
  }
}
