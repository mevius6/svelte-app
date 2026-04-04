import { RipplePass } from "../passes/RipplePass"
import { LandscapePass, type LandscapeDebugMode } from "../passes/LandscapePass"
import { BushesPass } from "../passes/BushesPass"
import { HeroTitlePass } from "../passes/HeroTitlePass"
import { MorningFogPass } from "../passes/MorningFogPass"
import { FinalColorPass } from "../passes/FinalColorPass"
import { FBO } from "../gl/FBO"
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
  type SceneCameraState,
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

export type PassDebugView = "final" | "ripple" | "landscape" | "vegetation" | "fog"

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
  private morningFog: MorningFogPass
  private heroTitle: HeroTitlePass
  private finalColor: FinalColorPass
  private resources: LandscapeResources
  private sceneColor: FBO | null = null

  private width = 1
  private height = 1
  private scrollNorm = 0
  // AI: Phase C — camera is now effectively static (time-of-day scroll,
  // fixed orbital params). Cache to avoid trig on every RAF call.
  private cachedCamera: SceneCameraState | null = null
  private cameraWidth = 0
  private cameraHeight = 0
  private cameraScroll = -1
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
    this.morningFog = new MorningFogPass(gl)
    this.heroTitle = new HeroTitlePass(gl, projectName)
    this.finalColor = new FinalColorPass(gl)
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
    this.morningFog.resize(width, height)
    this.heroTitle.resize(width, height)
    this.finalColor.resize(width, height)

    this.sceneColor?.dispose()
    this.sceneColor = new FBO(this.gl, width, height)
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

    this.setSceneOutputFramebuffer(null)

    const rippleTex = this.ripple.render(time, null) ?? this.resources.rippleFallbackTexture
    const sceneFrame = computeSceneFrame(this.width, this.height)
    const camera = computeSceneCamera(this.scrollNorm, this.width, this.height)
    const vegetationHorizon = computeVegetationHorizon(camera, this.width, this.height)
    const textTexSize = this.resources.textTextureSize
    const titleLayout = this.resources.heroTitleLayout
    const titleHero = computeTitleHeroState(this.scrollNorm, titleLayout.aspect, textTexSize.contentRect)
    const heroTitleAtlasRenderData = this.resources.heroTitleAtlasRenderData
    const heroTitleAtlas = heroTitleAtlasRenderData?.atlas ?? this.resources.heroTitleAtlas
    // AI: Phase E — require both atlas texture and precomposed phrase texture so
    // direct title and reflection stay on the same MSDF source.
    const useGlyphTitle = Boolean(
      heroTitleAtlasRenderData?.atlas.texture &&
      heroTitleAtlasRenderData?.phraseTexture
    )

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
      // AI: Phase A — pre-baked shore profile texture.
      shoreProfileTexture: this.resources.shoreProfileTexture,
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
        debugView: true,
        atlasTextures: this.resources.foliageAtlas,
        sceneScale: {
          x: sceneFrame.scaleX,
          y: sceneFrame.scaleY,
        },
      })
      this.bushes.render(time, null)
      return
    }

    if (this.passView === "fog") {
      this.gl.clearColor(0.02, 0.03, 0.05, 1.0)
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)
      this.morningFog.setFrameState({
        phase: this.scrollNorm,
        debugDensity: true,
      })
      this.morningFog.render(time, null)
      return
    }

    const shouldRenderHeroTitle =
      useGlyphTitle &&
      (this.passView === "final" ||
        (this.passView === "landscape" && this.landscapeMode === "beauty"))

    if (this.passView === "landscape" && this.landscapeMode !== "beauty") {
      this.landscape.setDebugMode(this.landscapeMode)
      this.landscape.render(time, rippleTex)
      return
    }

    if (!this.sceneColor) {
      return
    }

    // AI: linear scene composition is now done in offscreen target first, then a single
    // display transfer pass applies sRGB output conversion.
    this.setSceneOutputFramebuffer(this.sceneColor.framebuffer)
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.sceneColor.framebuffer)
    this.gl.viewport(0, 0, this.width, this.height)
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)

    // AI: renderer uses painter's algorithm (depth test disabled), so pass order defines layering.
    // Final chain: landscape → bushes → morningFog → heroTitle.
    this.landscape.setDebugMode("beauty")
    this.landscape.render(time, rippleTex)

    // AI: bushes + fog render before heroTitle so text remains crisp/legible over atmosphere.
    if (this.passView === "final") {
      this.bushes.setFrameState({
        camera,
        horizon: vegetationHorizon,
        phase: this.scrollNorm,
        debugView: false,
        atlasTextures: this.resources.foliageAtlas,
        sceneScale: {
          x: sceneFrame.scaleX,
          y: sceneFrame.scaleY,
        },
      })
      this.bushes.render(time, null)

      this.morningFog.setFrameState({
        phase: this.scrollNorm,
        debugDensity: false,
      })
      this.morningFog.render(time, null)
    }

    if (shouldRenderHeroTitle) {
      this.heroTitle.render(time, null)
    }

    this.setSceneOutputFramebuffer(null)
    this.finalColor.setOutputFramebuffer(null)
    this.finalColor.setFrameState({ useExactSrgb: true })
    this.finalColor.render(time, this.sceneColor.texture)
  }

  dispose() {
    if (this.initialized) {
      window.removeEventListener("scroll", this.scrollHandler)
      window.removeEventListener("pointerdown", this.onPointerDown)
      window.removeEventListener("pointermove", this.onPointerMove)
    }

    this.landscape.dispose()
    this.bushes.dispose()
    this.morningFog.dispose()
    this.heroTitle.dispose()
    this.finalColor.dispose()
    this.ripple.dispose()
    this.resources.dispose()
    this.sceneColor?.dispose()
    this.sceneColor = null

    this.initialized = false
  }

  private setSceneOutputFramebuffer(framebuffer: WebGLFramebuffer | null) {
    this.landscape.setOutputFramebuffer(framebuffer)
    this.bushes.setOutputFramebuffer(framebuffer)
    this.morningFog.setOutputFramebuffer(framebuffer)
    this.heroTitle.setOutputFramebuffer(framebuffer)
  }

  private pointerToRippleUV(clientX: number, clientY: number) {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // AI: Phase C — recompute only on resize or scroll change.
    if (
      !this.cachedCamera ||
      this.width    !== this.cameraWidth  ||
      this.height   !== this.cameraHeight ||
      this.scrollNorm !== this.cameraScroll
    ) {
      this.cachedCamera   = computeSceneCamera(this.scrollNorm, this.width, this.height)
      this.cameraWidth    = this.width
      this.cameraHeight   = this.height
      this.cameraScroll   = this.scrollNorm
    }
    const camera = this.cachedCamera

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
