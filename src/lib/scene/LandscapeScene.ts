import { RipplePass } from "../passes/RipplePass"
import { LandscapePass, type LandscapeDebugMode } from "../passes/LandscapePass"
import { BushesPass } from "../passes/BushesPass"
import { HeroTitlePass } from "../passes/HeroTitlePass"
import { LandscapeResources, type FoliageAtlasSourceSet } from "./LandscapeResources"
import {
  computeSceneCamera,
  computeVegetationHorizon,
  computeTitleHeroState,
  intersectRayWithWaterPlane,
  RIPPLE_WORLD_RECT,
  screenPointToWorldRay,
  SHORELINE_WORLD_Z,
  WATER_LEVEL,
  waterWorldToRippleUV,
} from "./sceneCamera"
import { computeSceneFrame } from "./sceneFraming"
import type { Scene } from "./Scene"

const DEFAULT_FOLIAGE_ATLAS_SOURCES: FoliageAtlasSourceSet = {
  albedo: "/grass-atlas-web/TCom_Grass12_512_albedo.png",
  alpha: "/grass-atlas-web/TCom_Grass12_512_alpha.png",
  normal: "/grass-atlas-web/TCom_Grass12_512_normal.png",
  roughness: "/grass-atlas-web/TCom_Grass12_512_roughness.png",
  translucency: "/grass-atlas-web/TCom_Grass12_512_translucency.png",
}
const DROP_THROTTLE_MS = 45
const VEGETATION_DEBUG_CLEAR: [number, number, number, number] = [0.03, 0.04, 0.06, 1.0]

export type PassDebugView = "final" | "ripple" | "landscape" | "vegetation"

export type SceneDebugState = {
  passView: PassDebugView
  landscapeMode: Exclude<LandscapeDebugMode, "ripple">
}

export class LandscapeScene implements Scene {

  private gl: WebGL2RenderingContext
  private projectName: string
  private atlasSources: FoliageAtlasSourceSet

  private ripple: RipplePass
  private landscape: LandscapePass
  private bushes: BushesPass
  private heroTitle: HeroTitlePass
  private resources: LandscapeResources

  private width = 1
  private height = 1
  private scrollNorm = 0
  private lastDropMs = 0
  private initialized = false
  private passView: PassDebugView = "final"
  private landscapeMode: Exclude<LandscapeDebugMode, "ripple"> = "beauty"

  private readonly scrollHandler = () => {
    const max = document.body.scrollHeight - window.innerHeight
    this.scrollNorm = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const uv = this.pointerToRippleUV(event.clientX, event.clientY)
    if (!uv) return

    this.ripple.queueDrop(uv.x, uv.y)
    this.lastDropMs = performance.now()
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pressure === 0 && event.pointerType === "mouse") {
      return
    }

    const now = performance.now()
    if (now - this.lastDropMs < DROP_THROTTLE_MS) {
      return
    }

    const uv = this.pointerToRippleUV(event.clientX, event.clientY)
    if (!uv) return

    this.ripple.queueDrop(uv.x, uv.y)
    this.lastDropMs = now
  }

  constructor(
    gl: WebGL2RenderingContext,
    projectName: string,
    atlasSources = DEFAULT_FOLIAGE_ATLAS_SOURCES
  ) {
    this.gl = gl
    this.projectName = projectName
    this.atlasSources = atlasSources

    this.ripple = new RipplePass(gl)
    this.landscape = new LandscapePass(gl)
    this.bushes = new BushesPass(gl)
    this.heroTitle = new HeroTitlePass(gl, projectName)
    this.resources = new LandscapeResources(gl)
  }

  async init() {
    if (this.initialized) return

    // AI: keep LandscapeScene focused on input + pass orchestration by delegating GPU asset setup to LandscapeResources.
    await this.resources.load({
      projectName: this.projectName,
      atlasSources: this.atlasSources,
      needsRippleFallback: !this.ripple.enabled,
    })

    this.scrollHandler()
    window.addEventListener("scroll", this.scrollHandler, { passive: true })
    window.addEventListener("pointerdown", this.onPointerDown)
    window.addEventListener("pointermove", this.onPointerMove)

    this.initialized = true
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height

    this.ripple.resize(width, height)
    this.landscape.resize(width, height)
    this.bushes.resize(width, height)
    this.heroTitle.resize(width, height)
  }

  setDebugState(state: Partial<SceneDebugState>) {
    if (state.passView) {
      this.passView = state.passView
    }

    if (state.landscapeMode) {
      this.landscapeMode = state.landscapeMode
    }
  }

  update(_dt: number) {}

  render(time: number) {
    const textTexture = this.resources.textTexture
    if (!textTexture) {
      return
    }

    const rippleTex = this.ripple.render(time, null) ?? this.resources.rippleFallbackTexture
    const sceneFrame = computeSceneFrame(this.width, this.height)
    const camera = computeSceneCamera(this.scrollNorm, this.width, this.height)
    const vegetationHorizon = computeVegetationHorizon(camera, this.width, this.height)
    const textTexSize = this.resources.textTextureSize
    const titleLayout = this.resources.heroTitleLayout
    const titleHero = computeTitleHeroState(this.scrollNorm, titleLayout.aspect, textTexSize.contentRect)
    const heroTitleAtlasRenderData = this.resources.heroTitleAtlasRenderData
    const heroTitleAtlas = heroTitleAtlasRenderData?.atlas ?? this.resources.heroTitleAtlas
    const useGlyphTitle = Boolean(heroTitleAtlasRenderData?.atlas.texture)

    this.landscape.setFrameState({
      camera,
      scroll: this.scrollNorm,
      textTexture,
      titleHero,
      useTitleBillboard: !useGlyphTitle,
      titleAtlasRenderData: heroTitleAtlasRenderData,
      rippleTexelSize: this.ripple.texelSize,
      rippleWorldRect: RIPPLE_WORLD_RECT,
      sceneScale: {
        x: sceneFrame.scaleX,
        y: sceneFrame.scaleY,
      },
      shorePlaneZ: SHORELINE_WORLD_Z,
      waterLevel: WATER_LEVEL,
    })
    this.heroTitle.setFrameState({
      camera,
      phase: this.scrollNorm,
      titleHero,
      atlas: heroTitleAtlas,
      gpuLayout: heroTitleAtlasRenderData?.gpuLayout ?? null,
    })

    if (this.passView === "ripple") {
      this.landscape.setDebugMode("ripple")
      this.landscape.render(time, rippleTex)
      return
    }

    if (this.passView === "vegetation") {
      this.gl.clearColor(...VEGETATION_DEBUG_CLEAR)
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)
      this.bushes.setFrameState({
        camera,
        horizon: vegetationHorizon,
        phase: this.scrollNorm,
        atlasTextures: this.resources.foliageAtlas,
        sceneScale: {
          x: sceneFrame.scaleX,
          y: sceneFrame.scaleY,
        },
      })
      this.bushes.render(time, null)
      return
    }

    // ══════════════════════════════════════════════════════════════════
    // PATCH: render passes in correct order for proper layering of transparent elements, without depth test.
    //
    // Fix render order: heroTitle must render AFTER bushes.
    // Depth test is disabled (Context.ts: gl.disable(gl.DEPTH_TEST)),
    // so render order = painter's algorithm.
    // Current: landscape → heroTitle → bushes  (bushes occlude title)
    // Fixed:   landscape → bushes  → heroTitle (title renders on top)
    // ══════════════════════════════════════════════════════════════════

        const landscapeMode = this.passView === "landscape" ? this.landscapeMode : "beauty"
    this.landscape.setDebugMode(landscapeMode)
    this.landscape.render(time, rippleTex)

    // AI: bushes render BEFORE heroTitle — depth test is disabled (painter's algorithm).
    // Old order (landscape → heroTitle → bushes) caused vegetation to occlude the title.
    // New order: landscape → bushes → heroTitle keeps title always in front of shore vegetation.
    if (this.passView === "final") {
      this.bushes.setFrameState({
        camera,
        horizon: vegetationHorizon,
        phase: this.scrollNorm,
        atlasTextures: this.resources.foliageAtlas,
        sceneScale: {
          x: sceneFrame.scaleX,
          y: sceneFrame.scaleY,
        },
      })
      this.bushes.render(time, null)
    }

    const shouldRenderHeroTitle =
      useGlyphTitle &&
      (this.passView === "final" ||
        (this.passView === "landscape" && this.landscapeMode === "beauty"))

    if (shouldRenderHeroTitle) {
      this.heroTitle.render(time, null)
    }
  }

  dispose() {
    if (this.initialized) {
      window.removeEventListener("scroll", this.scrollHandler)
      window.removeEventListener("pointerdown", this.onPointerDown)
      window.removeEventListener("pointermove", this.onPointerMove)
    }

    this.landscape.dispose()
    this.bushes.dispose()
    this.heroTitle.dispose()
    this.ripple.dispose()
    this.resources.dispose()

    this.initialized = false
  }

  private pointerToRippleUV(clientX: number, clientY: number) {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const camera = computeSceneCamera(this.scrollNorm, viewportWidth, viewportHeight)
    const direction = screenPointToWorldRay(
      camera,
      clientX,
      clientY,
      viewportWidth,
      viewportHeight
    )
    const waterHit = intersectRayWithWaterPlane(camera.position, direction)
    if (!waterHit) {
      return null
    }

    // AI: Phase 1 upgrades ripple input to the same world-water mapping used by the landscape shader, so interaction no longer depends on the screen's lower half.
    return waterWorldToRippleUV(waterHit)
  }

}
