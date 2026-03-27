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
}

export type { HeroTitleAtlasResource }

export type HeroTitleAtlasRenderData = {
  atlas: HeroTitleAtlasResource
  gpuLayout: HeroTitlePhraseGpuLayout
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
      ? this.buildHeroTitleAtlasRenderData(projectName, this.heroTitleAtlasRef)
      : null
    this.heroTitleLayoutRef = this.heroTitleAtlasRef
      ? measureHeroTitleLayoutFromAtlas(projectName, this.heroTitleAtlasRef.font)
      : textResult.layout
    // AI: the new grass atlas ships as a small PBR bundle, so keep the bundle load owned here instead of pushing that into the scene.
    this.foliageAtlasRef = await this.loadFoliageAtlas(atlasSources)

    if (needsRippleFallback) {
      this.rippleFallbackTextureRef = this.createDummyRippleTexture()
    }
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

  dispose() {
    if (this.textTextureRef) {
      this.gl.deleteTexture(this.textTextureRef)
      this.textTextureRef = null
    }

    if (this.heroTitleAtlasRef?.texture) {
      this.gl.deleteTexture(this.heroTitleAtlasRef.texture)
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
      const texture = imageUrl ? await this.loadTexture(imageUrl) : null

      return {
        font,
        texture,
        imageUrl,
      }
    } catch {
      return null
    }
  }

  private buildHeroTitleAtlasRenderData(
    text: string,
    atlas: HeroTitleAtlasResource
  ): HeroTitleAtlasRenderData | null {
    const gpuLayout = buildHeroTitlePhraseGpuLayout(text, atlas.font)
    if (!gpuLayout) {
      return null
    }

    return {
      atlas,
      gpuLayout,
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
