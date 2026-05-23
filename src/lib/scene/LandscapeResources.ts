import { createShoreProfileTexture } from "$lib/scene/ShoreProfileBaker"
import { TitleResources, type HeroTitleAtlasRenderData, type HeroTitleAtlasResource } from "./TitleResources"
import { loadFoliageAtlas, type FoliageAtlasSourceSet, type FoliageAtlasTextureSet } from "./loaders/foliageAtlasLoader"
import type { HeroTitleLayoutMetrics } from "../text/heroTitleAtlas"
import { HERO_TITLES } from "../content/heroTitles"

export type { HeroTitleAtlasRenderData, HeroTitleAtlasResource }
export type { FoliageAtlasSourceSet, FoliageAtlasTextureSet } from "./loaders/foliageAtlasLoader"

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

const DEFAULT_HERO_TITLE_LAYOUT = {
  width: 1,
  height: 0.25,
  aspect: 0.25,
  source: "canvas-fallback" as const,
}

export class LandscapeResources {

  private title: TitleResources
  private textTextureRef: WebGLTexture | null = null
  private textTextureSizeRef: {
    w: number
    h: number
    contentRect: { x: number; y: number; w: number; h: number }
    layout: HeroTitleLayoutMetrics
  } = {
    w: 1,
    h: 1,
    contentRect: { x: 0, y: 0, w: 1, h: 1 },
    layout: {
      width: 1,
      height: 0.25,
      aspect: 0.25,
      source: "canvas-fallback",
    },
  }
  private foliageAtlasRef: FoliageAtlasTextureSet = createEmptyFoliageAtlasTextures()
  private rippleFallbackTextureRef: WebGLTexture | null = null
  // AI: Phase A — 1D shore profile, baked once, replaces per-pixel shoreFbm.
  private shoreProfileTexRef: WebGLTexture | null = null

  constructor(private gl: WebGL2RenderingContext) {
    this.title = new TitleResources(gl)
  }

  async load(options: LoadLandscapeResourcesOptions) {
    const { projectName, atlasSources, needsRippleFallback } = options

    // AI: Phase 2 — delegate title resource loading to TitleResources module.
    await this.title.load(projectName)

    // AI: title.textTextureSize is canonical; mirror for compatibility with existing getters.
    // TODO: Faze 2.1 can simplify by migrating all title access through this.title.
    this.textTextureRef = this.title.textTexture
    const titleSize = this.title.textTextureSize
    this.textTextureSizeRef = {
      w: titleSize.w,
      h: titleSize.h,
      contentRect: titleSize.contentRect,
      layout: titleSize.layout,
    }

    // AI: the new grass atlas ships as a small PBR bundle, so keep the bundle load owned here instead of pushing that into the scene.
    this.foliageAtlasRef = await loadFoliageAtlas(this.gl, atlasSources)

    if (needsRippleFallback) {
      this.rippleFallbackTextureRef = this.createDummyRippleTexture()
    }
    // AI: Phase A — bake static shore profile texture (512×1 RGBA32F).
    // Replaces ~90 vnoise calls per water pixel with a single texture fetch.
    this.shoreProfileTexRef = createShoreProfileTexture(this.gl)

    // CMS content: pre-load all hero titles from dummy data
    await this.preloadHeroTitles()
  }

  /**
   * Pre-load render data for all CMS hero titles (from HERO_TITLES).
   * This ensures smooth scrolling without lag when switching between titles.
   */
  private async preloadHeroTitles() {
    const titleTexts = HERO_TITLES.map(t => t.text)
    await Promise.all(
      titleTexts.map(text => this.title.buildHeroTitleRenderDataForText(text))
    )
  }

  getDigitRenderData(digit: number) {
    return this.title.getDigitRenderData(digit);
  }

  buildHeroTitleRenderDataSync(text: string) {
    return this.title.buildHeroTitleRenderDataSync(text)
  }

  get titleResources() {
    return this.title
  }

  get textTexture() {
    return this.title.textTexture
  }

  get textTextureSize() {
    return this.textTextureSizeRef
  }

  get heroTitleAtlas() {
    return this.title.heroTitleAtlas
  }

  get heroTitleAtlasRenderData() {
    return this.title.heroTitleAtlasRenderData
  }

  get heroTitleLayout() {
    return this.title.heroTitleLayout
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
    this.title.dispose()

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
