type TextTexture = {
  texture: WebGLTexture
  w: number
  h: number
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

export class LandscapeResources {

  private textTextureRef: WebGLTexture | null = null
  private textTextureSizeRef = { w: 1, h: 1 }
  private foliageAtlasRef: FoliageAtlasTextureSet = createEmptyFoliageAtlasTextures()
  private rippleFallbackTextureRef: WebGLTexture | null = null

  constructor(private gl: WebGL2RenderingContext) {}

  async load(options: LoadLandscapeResourcesOptions) {
    const { projectName, atlasSources, needsRippleFallback } = options

    // AI: keep scene orchestration lean by centralizing landscape resource creation and ownership here.
    const textResult = this.createTextTexture(projectName)
    if (!textResult) {
      throw new Error("Failed to create landscape title texture")
    }

    this.textTextureRef = textResult.texture
    this.textTextureSizeRef = textResult
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

    this.textTextureSizeRef = { w: 1, h: 1 }
  }

  private createTextTexture(text: string): TextTexture | null {
    const off = document.createElement("canvas")
    const ctx = off.getContext("2d")
    if (!ctx) {
      return null
    }

    const fontSize = 96
    const fontStr = `800 ${fontSize}px "roslindale", "Times New Roman", serif`
    const display = text.toUpperCase()

    if ("letterSpacing" in ctx) {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "8px"
    }

    ctx.font = fontStr
    const textW = ctx.measureText(display).width
    const pad = fontSize * 0.85

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
    ctx.shadowColor = "rgba(255,195,120,0.55)"
    ctx.shadowBlur = 56
    ctx.fillStyle = "rgba(255,255,255,0.85)"
    ctx.fillText(display, cx, cy)
    ctx.shadowColor = "rgba(255,225,170,0.80)"
    ctx.shadowBlur = 20
    ctx.fillStyle = "rgba(255,255,255,0.95)"
    ctx.fillText(display, cx, cy)
    ctx.shadowBlur = 0
    ctx.shadowColor = "transparent"
    ctx.fillStyle = "#ffffff"
    ctx.fillText(display, cx, cy)

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

    return { texture, w: off.width, h: off.height }
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
