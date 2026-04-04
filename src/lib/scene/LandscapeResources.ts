import { createShoreProfileTexture } from "$lib/scene/ShoreProfileBaker"
import {
  buildHeroTitlePhraseGpuLayout,
  measureHeroTitleLayoutFromAtlas,
  measureHeroTitleLayoutFromCanvas,
  parseHeroTitleAtlas,
  type HeroTitleAtlasFont,
  type HeroTitleLayoutMetrics,
  type HeroTitlePhraseGpuLayout,
} from "../text/heroTitleAtlas"

type TextTexture = {
  texture: WebGLTexture
  w: number
  h: number
  contentRect: {
    x: number
    y: number
    w: number
    h: number
  }
  layout: HeroTitleLayoutMetrics
}

type HeroTitleAtlasResource = {
  font: HeroTitleAtlasFont
  texture: WebGLTexture | null
  imageUrl: string | null
  image: HTMLImageElement | null
}

export type { HeroTitleAtlasResource }

export type HeroTitleAtlasRenderData = {
  atlas: HeroTitleAtlasResource
  gpuLayout: HeroTitlePhraseGpuLayout
  // AI: Phase E — precomposed phrase MSDF texture used by landscape reflection path
  // to avoid per-fragment 32-glyph loops in landscape.frag.
  phraseTexture: WebGLTexture | null
  phraseTextureSize: {
    width: number
    height: number
  }
}

export type FoliageAtlasSourceSet = {
  albedo: string
  alpha: string
  normal: string
  roughness: string
  translucency: string
}

export type FoliageAtlasTextureSet = {
  albedo: WebGLTexture | null
  alpha: WebGLTexture | null
  normal: WebGLTexture | null
  roughness: WebGLTexture | null
  translucency: WebGLTexture | null
}

type LoadLandscapeResourcesOptions = {
  projectName: string
  atlasSources: FoliageAtlasSourceSet
  needsRippleFallback: boolean
}

function createEmptyFoliageAtlasTextures(): FoliageAtlasTextureSet {
  return {
    albedo: null,
    alpha: null,
    normal: null,
    roughness: null,
    translucency: null,
  }
}

const HERO_TITLE_ATLAS_JSON_URL = "/hero-title/roslindale-msdf.json"
const HERO_TITLE_ATLAS_IMAGE_URL = "/hero-title/roslindale-msdf.png"
const DEFAULT_HERO_TITLE_LAYOUT: HeroTitleLayoutMetrics = {
  width: 1,
  height: 0.25,
  aspect: 0.25,
  source: "canvas-fallback",
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export class LandscapeResources {

  private textTextureRef: WebGLTexture | null = null
  private textTextureSizeRef = {
    w: 1,
    h: 1,
    contentRect: { x: 0, y: 0, w: 1, h: 1 },
    layout: DEFAULT_HERO_TITLE_LAYOUT,
  }
  private heroTitleAtlasRef: HeroTitleAtlasResource | null = null
  private heroTitleAtlasRenderDataRef: HeroTitleAtlasRenderData | null = null
  private heroTitleLayoutRef: HeroTitleLayoutMetrics = DEFAULT_HERO_TITLE_LAYOUT
  private foliageAtlasRef: FoliageAtlasTextureSet = createEmptyFoliageAtlasTextures()
  private rippleFallbackTextureRef: WebGLTexture | null = null
  // AI: Phase A — 1D shore profile, baked once, replaces per-pixel shoreFbm.
  private shoreProfileTexRef: WebGLTexture | null = null

  constructor(private gl: WebGL2RenderingContext) {}

  async load(options: LoadLandscapeResourcesOptions) {
    const { projectName, atlasSources, needsRippleFallback } = options

    // AI: Phase 2.1 starts the atlas-driven hero-title path by attempting to load MSDF atlas metadata first; canvas text stays only as a fallback/render bridge.
    this.heroTitleAtlasRef = await this.loadHeroTitleAtlas()

    // AI: keep scene orchestration lean by centralizing landscape resource creation and ownership here.
    const textResult = this.createTextTexture(projectName)
    if (!textResult) {
      throw new Error("Failed to create landscape title texture")
    }

    this.textTextureRef = textResult.texture
    this.textTextureSizeRef = textResult
    this.heroTitleAtlasRenderDataRef = this.heroTitleAtlasRef
      ? await this.buildHeroTitleAtlasRenderData(projectName, this.heroTitleAtlasRef)
      : null
    this.heroTitleLayoutRef = this.heroTitleAtlasRef
      ? measureHeroTitleLayoutFromAtlas(projectName, this.heroTitleAtlasRef.font)
      : textResult.layout
    // AI: the new grass atlas ships as a small PBR bundle, so keep the bundle load owned here instead of pushing that into the scene.
    this.foliageAtlasRef = await this.loadFoliageAtlas(atlasSources)

    if (needsRippleFallback) {
      this.rippleFallbackTextureRef = this.createDummyRippleTexture()
    }
    // AI: Phase A — bake static shore profile texture (512×1 RGBA32F).
    // Replaces ~90 vnoise calls per water pixel with a single texture fetch.
    this.shoreProfileTexRef = createShoreProfileTexture(this.gl)
  }

  get textTexture() {
    return this.textTextureRef
  }

  get textTextureSize() {
    return this.textTextureSizeRef
  }

  get heroTitleAtlas() {
    return this.heroTitleAtlasRef
  }

  get heroTitleAtlasRenderData() {
    return this.heroTitleAtlasRenderDataRef
  }

  get heroTitleLayout() {
    return this.heroTitleLayoutRef
  }

  get foliageAtlas() {
    return this.foliageAtlasRef
  }

  get rippleFallbackTexture() {
    return this.rippleFallbackTextureRef
  }

  // AI: Phase A — shore profile 1D texture for landscape.frag.
  get shoreProfileTexture() {
    return this.shoreProfileTexRef
  }

  dispose() {
    if (this.textTextureRef) {
      this.gl.deleteTexture(this.textTextureRef)
      this.textTextureRef = null
    }

    if (this.heroTitleAtlasRef?.texture) {
      this.gl.deleteTexture(this.heroTitleAtlasRef.texture)
    }
    if (this.heroTitleAtlasRenderDataRef?.phraseTexture) {
      this.gl.deleteTexture(this.heroTitleAtlasRenderDataRef.phraseTexture)
    }
    this.heroTitleAtlasRef = null
    this.heroTitleAtlasRenderDataRef = null

    this.deleteTexture(this.foliageAtlasRef.albedo)
    this.deleteTexture(this.foliageAtlasRef.alpha)
    this.deleteTexture(this.foliageAtlasRef.normal)
    this.deleteTexture(this.foliageAtlasRef.roughness)
    this.deleteTexture(this.foliageAtlasRef.translucency)
    this.foliageAtlasRef = createEmptyFoliageAtlasTextures()

    if (this.rippleFallbackTextureRef) {
      this.gl.deleteTexture(this.rippleFallbackTextureRef)
      this.rippleFallbackTextureRef = null
    }
    if (this.shoreProfileTexRef) {
      this.gl.deleteTexture(this.shoreProfileTexRef)
      this.shoreProfileTexRef = null
    }

    this.textTextureSizeRef = {
      w: 1,
      h: 1,
      contentRect: { x: 0, y: 0, w: 1, h: 1 },
      layout: DEFAULT_HERO_TITLE_LAYOUT,
    }
    this.heroTitleLayoutRef = DEFAULT_HERO_TITLE_LAYOUT
  }

  private createTextTexture(text: string): TextTexture | null {
    const off = document.createElement("canvas")
    const ctx = off.getContext("2d")
    if (!ctx) {
      return null
    }

    const fontSize = 96
    const letterSpacingPx = 8
    const fontStr = `800 ${fontSize}px "roslindale", "Times New Roman", serif`
    const display = text.toUpperCase()

    if ("letterSpacing" in ctx) {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "8px"
    }

    ctx.font = fontStr
    const letterSpacingTotal = Math.max(display.length - 1, 0) * letterSpacingPx
    const textW = ctx.measureText(display).width + letterSpacingTotal
    const pad = fontSize * 0.85
    const layout = measureHeroTitleLayoutFromCanvas(
      ctx.measureText(display),
      fontSize,
      letterSpacingTotal
    )

    off.width = Math.ceil(textW + pad * 2)
    off.height = Math.ceil(fontSize * 1.3 + pad * 2)

    ctx.font = fontStr
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    if ("letterSpacing" in ctx) {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "8px"
    }

    const cx = off.width / 2
    const cy = off.height / 2
    ctx.clearRect(0, 0, off.width, off.height)
    ctx.fillStyle = "#ffffff"
    ctx.fillText(display, cx, cy)

    const measure = document.createElement("canvas")
    const measureCtx = measure.getContext("2d")
    if (!measureCtx) {
      return null
    }

    measure.width = off.width
    measure.height = off.height
    measureCtx.font = fontStr
    measureCtx.textAlign = "center"
    measureCtx.textBaseline = "middle"
    if ("letterSpacing" in measureCtx) {
      ;(measureCtx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "8px"
    }
    measureCtx.fillStyle = "#ffffff"
    measureCtx.fillText(display, cx, cy)

    const pixels = measureCtx.getImageData(0, 0, measure.width, measure.height).data
    let minX = off.width
    let minY = off.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < off.height; y += 1) {
      for (let x = 0; x < off.width; x += 1) {
        const alpha = pixels[(y * off.width + x) * 4 + 3]
        if (alpha <= 8) {
          continue
        }

        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }

    if (maxX < minX || maxY < minY) {
      minX = 0
      minY = 0
      maxX = off.width - 1
      maxY = off.height - 1
    }

    const cropPadX = Math.ceil(fontSize * 0.02)
    const cropPadY = Math.ceil(fontSize * 0.015)
    minX = Math.max(minX - cropPadX, 0)
    minY = Math.max(minY - cropPadY, 0)
    maxX = Math.min(maxX + cropPadX, off.width - 1)
    maxY = Math.min(maxY + cropPadY, off.height - 1)

    const contentRect = {
      x: minX / off.width,
      y: 1 - (maxY + 1) / off.height,
      w: (maxX + 1 - minX) / off.width,
      h: (maxY + 1 - minY) / off.height,
    }

    const texture = this.gl.createTexture()
    if (!texture) {
      return null
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true)
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, off)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.generateMipmap(this.gl.TEXTURE_2D)
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)

    return { texture, w: off.width, h: off.height, contentRect, layout }
  }

  private async loadHeroTitleAtlas(): Promise<HeroTitleAtlasResource | null> {
    try {
      const response = await fetch(HERO_TITLE_ATLAS_JSON_URL)
      if (!response.ok) {
        return null
      }

      const raw = await response.json()
      const font = parseHeroTitleAtlas(raw, HERO_TITLE_ATLAS_IMAGE_URL)
      if (!font) {
        return null
      }

      const imageUrl = font.atlas.imagePath
        ? new URL(font.atlas.imagePath, new URL(HERO_TITLE_ATLAS_JSON_URL, window.location.origin)).toString()
        : null
      const atlasResource = imageUrl ? await this.loadTextureWithImage(imageUrl) : null

      return {
        font,
        texture: atlasResource?.texture ?? null,
        imageUrl,
        image: atlasResource?.image ?? null,
      }
    } catch {
      return null
    }
  }

  private async buildHeroTitleAtlasRenderData(
    text: string,
    atlas: HeroTitleAtlasResource
  ): Promise<HeroTitleAtlasRenderData | null> {
    const gpuLayout = buildHeroTitlePhraseGpuLayout(text, atlas.font)
    if (!gpuLayout) {
      return null
    }

    const phraseTextureData = this.createTitlePhraseTexture(atlas, gpuLayout)

    return {
      atlas,
      gpuLayout,
      phraseTexture: phraseTextureData.texture,
      phraseTextureSize: {
        width: phraseTextureData.width,
        height: phraseTextureData.height,
      },
    }
  }

  private async loadFoliageAtlas(sources: FoliageAtlasSourceSet): Promise<FoliageAtlasTextureSet> {
    const [albedo, alpha, normal, roughness, translucency] = await Promise.all([
      this.loadTexture(sources.albedo),
      this.loadTexture(sources.alpha),
      this.loadTexture(sources.normal),
      this.loadTexture(sources.roughness),
      this.loadTexture(sources.translucency),
    ])

    return {
      albedo,
      alpha,
      normal,
      roughness,
      translucency,
    }
  }

  private loadTexture(url: string): Promise<WebGLTexture | null> {
    return new Promise((resolve) => {
      const img = new Image()

      img.onload = () => {
        const tex = this.gl.createTexture()
        if (!tex) {
          resolve(null)
          return
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, tex)
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true)
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img)
        this.gl.generateMipmap(this.gl.TEXTURE_2D)
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR)
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
        this.gl.bindTexture(this.gl.TEXTURE_2D, null)
        resolve(tex)
      }

      img.onerror = () => resolve(null)
      img.src = url
    })
  }

  private loadTextureWithImage(
    url: string
  ): Promise<{ texture: WebGLTexture | null; image: HTMLImageElement | null }> {
    return new Promise((resolve) => {
      const img = new Image()

      img.onload = () => {
        const texture = this.gl.createTexture()
        if (!texture) {
          resolve({ texture: null, image: img })
          return
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true)
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img)
        this.gl.generateMipmap(this.gl.TEXTURE_2D)
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR)
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
        this.gl.bindTexture(this.gl.TEXTURE_2D, null)

        resolve({ texture, image: img })
      }

      img.onerror = () => resolve({ texture: null, image: null })
      img.src = url
    })
  }

  private createTitlePhraseTexture(
    atlas: HeroTitleAtlasResource,
    gpuLayout: HeroTitlePhraseGpuLayout
  ) {
    const image = atlas.image
    if (!image) {
      return { texture: null, width: 1, height: 1 }
    }

    const phraseLayout = gpuLayout.phraseLayout
    if (
      phraseLayout.width <= 0 ||
      phraseLayout.height <= 0 ||
      phraseLayout.glyphs.length === 0
    ) {
      return { texture: null, width: 1, height: 1 }
    }

    const atlasWidth = Math.max(atlas.font.atlas.width, 1)
    const atlasHeight = Math.max(atlas.font.atlas.height, 1)
    let ratioSum = 0
    let ratioCount = 0
    for (const glyph of phraseLayout.glyphs) {
      const localW = Math.max(glyph.localBounds.right - glyph.localBounds.left, 1e-4)
      const localH = Math.max(glyph.localBounds.top - glyph.localBounds.bottom, 1e-4)
      const sourceW = Math.max(glyph.atlasRect.w * atlasWidth, 1e-4)
      const sourceH = Math.max(glyph.atlasRect.h * atlasHeight, 1e-4)
      ratioSum += sourceW / localW + sourceH / localH
      ratioCount += 2
    }
    const pxPerUnit = ratioCount > 0 ? ratioSum / ratioCount : 96
    // AI: Phase E quality tuning — keep phrase texture slightly supersampled so
    // reflection path stays close to per-glyph MSDF sharpness without per-fragment loop.
    const phraseResolutionScale = 1.12
    const phraseWidth = clampInteger(phraseLayout.width * pxPerUnit * phraseResolutionScale, 384, 3072)
    const phraseHeight = clampInteger(phraseLayout.height * pxPerUnit * phraseResolutionScale, 96, 1536)

    const offscreen = document.createElement("canvas")
    offscreen.width = phraseWidth
    offscreen.height = phraseHeight
    const ctx = offscreen.getContext("2d")
    if (!ctx) {
      return { texture: null, width: 1, height: 1 }
    }

    ctx.clearRect(0, 0, phraseWidth, phraseHeight)
    ctx.imageSmoothingEnabled = false

    const layoutHalfW = phraseLayout.width * 0.5
    const layoutHalfH = phraseLayout.height * 0.5
    for (const glyph of phraseLayout.glyphs) {
      const sourceX = glyph.atlasRect.x * atlasWidth
      const sourceY = (1 - glyph.atlasRect.y - glyph.atlasRect.h) * atlasHeight
      const sourceW = glyph.atlasRect.w * atlasWidth
      const sourceH = glyph.atlasRect.h * atlasHeight
      if (sourceW <= 0.5 || sourceH <= 0.5) {
        continue
      }

      const destX = ((glyph.localBounds.left + layoutHalfW) / phraseLayout.width) * phraseWidth
      const destTopNorm = (glyph.localBounds.top + layoutHalfH) / phraseLayout.height
      const destY = (1 - destTopNorm) * phraseHeight
      const destW = ((glyph.localBounds.right - glyph.localBounds.left) / phraseLayout.width) * phraseWidth
      const destH = ((glyph.localBounds.top - glyph.localBounds.bottom) / phraseLayout.height) * phraseHeight
      if (destW <= 0.5 || destH <= 0.5) {
        continue
      }

      ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, destX, destY, destW, destH)
    }

    const texture = this.gl.createTexture()
    if (!texture) {
      return { texture: null, width: 1, height: 1 }
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true)
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, offscreen)
    // AI: phrase MSDF is sampled analytically in shader (screen-space pxRange).
    // Disable mipmaps to avoid extra blur in reflection path.
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)

    return { texture, width: phraseWidth, height: phraseHeight }
  }

  private createDummyRippleTexture() {
    const texture = this.gl.createTexture()
    if (!texture) {
      return null
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RG8,
      1,
      1,
      0,
      this.gl.RG,
      this.gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0])
    )
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST)
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)

    return texture
  }

  private deleteTexture(texture: WebGLTexture | null) {
    if (!texture) {
      return
    }

    this.gl.deleteTexture(texture)
  }

}
