import { RipplePass } from "../passes/RipplePass"
import { LandscapePass, type LandscapeDebugMode } from "../passes/LandscapePass"
import { BushesPass } from "../passes/BushesPass"
import { HeroTitlePass } from "../passes/HeroTitlePass"
import { MorningFogPass } from "../passes/MorningFogPass"
import { TitleGlowPass } from "../passes/TitleGlowPass"
import { FinalColorPass } from "../passes/FinalColorPass"
import { FBO } from "../gl/FBO"
import {
  LandscapeResources,
  type FoliageAtlasSourceSet,
  type HeroTitleAtlasResource,
  type HeroTitleAtlasRenderData,
} from "./LandscapeResources"
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

import type { HeroTitleDigitRenderData } from "./TitleResources"

const DEFAULT_FOLIAGE_ATLAS_SOURCES: FoliageAtlasSourceSet = {
  albedo: "/grass-atlas-web/TCom_Grass12_512_albedo.png",
  alpha: "/grass-atlas-web/TCom_Grass12_512_alpha.png",
  normal: "/grass-atlas-web/TCom_Grass12_512_normal.png",
  roughness: "/grass-atlas-web/TCom_Grass12_512_roughness.png",
  translucency: "/grass-atlas-web/TCom_Grass12_512_translucency.png",
}
const DROP_THROTTLE_MS = 45
const VEGETATION_DEBUG_CLEAR: [number, number, number, number] = [0.03, 0.04, 0.06, 1.0]

export type PassDebugView = "final" | "ripple" | "landscape" | "vegetation" | "fog" | "glow"
export type TitleRenderMode = "digit" | "phrase"

export type SceneDebugState = {
  passView: PassDebugView
  landscapeMode: Exclude<LandscapeDebugMode, "ripple">
  glowEnabled: boolean
  titleRenderMode: TitleRenderMode
}

// NOTE: Phase 1 — extracted frame state to separate structure for cleaner dispatch logic.
// Collects all per-frame computed data once, then passes to appropriate renderDebug* or renderFinal.
interface FrameState {
  time: number
  rippleTex: WebGLTexture | null
  sceneFrame: ReturnType<typeof computeSceneFrame>
  camera: SceneCameraState
  vegetationHorizon: number

  titleHero: ReturnType<typeof computeTitleHeroState>

  heroTitleAtlasRenderData: HeroTitleAtlasRenderData | null
  heroTitleAtlas: HeroTitleAtlasResource | null
  digit: number // 1..7 — новый слайдовый шаг
  digitTitleRenderData: HeroTitleDigitRenderData | null

  activeTitleRenderData: HeroTitleAtlasRenderData | null
  activeLayoutSize: { width: number; height: number } | null // логический layout (phraseLayout)
  activePhraseTexSize: { width: number; height: number } | null // физический размер текстуры

  useGlyphTitle: boolean
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
  private titleGlow: TitleGlowPass
  private finalColor: FinalColorPass
  private resources: LandscapeResources
  private sceneColor: FBO | null = null

  private width = 1
  private height = 1
  private scrollNorm = 0
  // NOTE: Phase C — camera is now effectively static (time-of-day scroll,
  // fixed orbital params). Cache to avoid trig on every RAF call.
  private cachedCamera: SceneCameraState | null = null
  private cameraWidth = 0
  private cameraHeight = 0
  private lastDropMs = 0
  private initialized = false
  private passView: PassDebugView = "final"
  private landscapeMode: Exclude<LandscapeDebugMode, "ripple"> = "beauty"
  private glowEnabled = true
  private titleRenderMode: TitleRenderMode = "digit"

  private readonly scrollHandler = () => {
    const max = document.body.scrollHeight - window.innerHeight
    this.scrollNorm = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0
  }

  /**
   * Phase 6: Convert scroll position to phase (0-1) with new semantics.
   * This is the single point of control for day-night cycle ordering.
   */
  private scrollToPhase(scroll: number): number {
    // Currently identity mapping; shader functions interpret phase semantics.
    // Future: can add easing (slow dawn, fast sunset) here without changing shaders.
    return Math.max(0, Math.min(scroll, 1.0))
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
    this.titleGlow = new TitleGlowPass(gl)
    this.finalColor = new FinalColorPass(gl)
    this.resources = new LandscapeResources(gl)
  }

  async init() {
    if (this.initialized) return

    // NOTE: keep LandscapeScene focused on input + pass orchestration by delegating GPU asset setup to LandscapeResources.
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
    this.titleGlow.resize(width, height)
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

    if (state.glowEnabled !== undefined) {
      this.glowEnabled = state.glowEnabled
    }
    if (state.titleRenderMode) {
      this.titleRenderMode = state.titleRenderMode
    }

  }

  update(_dt: number) {}

  // NOTE: Phase 1 — builds frame state once per render cycle, centralizing all per-frame data computation.
  // Reduces render() method complexity and enables clean dispatch to renderDebug*/renderFinal.
  private buildFrameState(time: number): FrameState | null {
    const textTexture = this.resources.textTexture
    if (!textTexture) return null

    const rippleTex = this.ripple.render(time, null) ?? this.resources.rippleFallbackTexture
    const sceneFrame = computeSceneFrame(this.width, this.height)
    const camera = this.resolveCamera()
    const vegetationHorizon = computeVegetationHorizon(camera, this.width, this.height)
    const textTexSize = this.resources.textTextureSize
    const titleLayout = this.resources.heroTitleLayout

    const heroTitleAtlasRenderData = this.resources.heroTitleAtlasRenderData
    const heroTitleAtlas = heroTitleAtlasRenderData?.atlas ?? this.resources.heroTitleAtlas ?? null

    // Вычисляем digit на основе scrollNorm (phase01)
    const rawPhase = this.scrollNorm // 0..1
    const digit = Math.min(7, Math.max(1, Math.floor(rawPhase * 7) + 1))
    const digitTitleRenderData = this.resources.getDigitRenderData(digit)
    const phraseGlyphRenderData = heroTitleAtlasRenderData?.atlas.texture
      ? heroTitleAtlasRenderData
      : null

    const activeTitleRenderData = this.titleRenderMode === "digit"
      ? digitTitleRenderData
      : phraseGlyphRenderData

    const useGlyphTitle = Boolean(
      activeTitleRenderData?.atlas.texture && activeTitleRenderData.gpuLayout
    )

    // ЛОГИЧЕСКИЙ layout берём из gpuLayout.phraseLayout
    const activeLayoutSize = activeTitleRenderData?.gpuLayout
      ? {
          width: activeTitleRenderData.gpuLayout.phraseLayout.width,
          height: activeTitleRenderData.gpuLayout.phraseLayout.height,
        }
      : {
          width: this.resources.heroTitleLayout.width,
          height: this.resources.heroTitleLayout.height,
        }

    // ФИЗИЧЕСКИЙ размер текстуры для MSDF
    const activePhraseTexSize = activeTitleRenderData?.phraseTextureSize ?? null

    const titleHero = computeTitleHeroState(
      this.scrollNorm,
      titleLayout.aspect,
      textTexSize.contentRect
    )

    return {
      time,
      rippleTex,
      sceneFrame,
      camera,
      vegetationHorizon,
      titleHero,

      heroTitleAtlasRenderData,
      heroTitleAtlas,
      activeTitleRenderData,
      activeLayoutSize,
      activePhraseTexSize,
      useGlyphTitle,

      digit,
      digitTitleRenderData
    }
  }

  render(time: number) {
    const frame = this.buildFrameState(time)
    if (!frame) return

    switch (this.passView) {
      case 'ripple':
        return this.renderDebugRipple(frame)
      case 'vegetation':
        return this.renderDebugVegetation(frame)
      case 'fog':
        return this.renderDebugFog(frame)
      case 'glow':
        return this.renderDebugGlow(frame)
      case 'landscape':
        return this.renderDebugLandscape(frame)
      default:
        return this.renderFinal(frame)
    }
  }

  // MARK:- Debug views
  // NOTE: Phase 1 — debug view for ripple simulation pass.
  private renderDebugRipple(frame: FrameState) {
    this.setSceneOutputFramebuffer(null)
    this.landscape.setDebugMode('ripple')
    this.landscape.render(frame.time, frame.rippleTex)
  }

  // NOTE: Phase 1 — debug view for vegetation (bushes) pass; fog/haze disabled for readability.
  private renderDebugVegetation(frame: FrameState) {
    this.gl.clearColor(...VEGETATION_DEBUG_CLEAR)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.bushes.setFrameState({
      camera: frame.camera,
      horizon: frame.vegetationHorizon,
      phase: this.scrollToPhase(this.scrollNorm),
      debugView: true,
      atlasTextures: this.resources.foliageAtlas,
      sceneScale: {
        x: frame.sceneFrame.scaleX,
        y: frame.sceneFrame.scaleY,
      },
    })
    this.bushes.render(frame.time, null)
  }

  // NOTE: Phase 1 — debug view for morning fog pass; shows density profile in isolation.
  private renderDebugFog(frame: FrameState) {
    this.gl.clearColor(0.02, 0.03, 0.05, 1.0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.morningFog.setFrameState({
      phase: this.scrollToPhase(this.scrollNorm),
      debugDensity: true,
    })
    this.morningFog.render(frame.time, null)
  }

  // NOTE: Phase 1 — debug view for title glow pass; shows glow isolation.
  private renderDebugGlow(frame: FrameState) {
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.setupTitleGlowState(frame)
    this.titleGlow.render(frame.time, null)
  }

  // NOTE: Phase 1 — debug view for landscape pass; allows viewing specific shader domains (ripple, normals, reflection, wave LOD).
  private renderDebugLandscape(frame: FrameState) {
    this.landscape.setDebugMode(this.landscapeMode)
    this.landscape.render(frame.time, frame.rippleTex)
  }

  // MARK:- Final render
  // NOTE: Phase 1 — full render: landscape → bushes → fog → heroTitle → titleGlow → final color transfer (linear→sRGB).
  // All passes write to offscreen sceneColor FBO, then FinalColorPass applies single display transfer.
  private renderFinal(frame: FrameState) {
    if (!this.sceneColor) return

    // Setup all pass state up front
    this.setupLandscapeState(frame)
    this.setupBushesState(frame)
    this.setupMorningFogState(frame)
    this.setupHeroTitleState(frame)
    this.setupTitleGlowState(frame)

    // Offscreen composition: linear scene in sceneColor FBO
    this.setSceneOutputFramebuffer(this.sceneColor.framebuffer)
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.sceneColor.framebuffer)
    this.gl.viewport(0, 0, this.width, this.height)
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)

    // Painter's algorithm: pass order defines layering. Do not reorder.
    this.landscape.setDebugMode('beauty')
    this.landscape.render(frame.time, frame.rippleTex)
    this.bushes.render(frame.time, null)
    this.morningFog.render(frame.time, null)

    if (frame.useGlyphTitle) {
      this.heroTitle.render(frame.time, null)
      if (this.glowEnabled) {
        this.titleGlow.render(frame.time, null)
      }
    }

    // Single display transfer: linear → sRGB in FinalColorPass
    this.setSceneOutputFramebuffer(null)
    this.finalColor.setOutputFramebuffer(null)
    this.finalColor.setFrameState({ useExactSrgb: true })
    this.finalColor.render(frame.time, this.sceneColor.texture)
  }

  // MARK:- Setup helpers
  // NOTE: Phase 1 — setup helpers extract pass-specific configuration from frame state.
  private setupLandscapeState(frame: FrameState) {
    this.landscape.setFrameState({
      camera: frame.camera,
      scroll: this.scrollToPhase(this.scrollNorm),
      textTexture: this.resources.textTexture!,
      titleHero: frame.titleHero,
      useTitleBillboard: !frame.useGlyphTitle,
      titleAtlasRenderData: frame.activeTitleRenderData,
      rippleTexelSize: this.ripple.texelSize,
      rippleWorldRect: RIPPLE_WORLD_RECT,
      sceneScale: {
        x: frame.sceneFrame.scaleX,
        y: frame.sceneFrame.scaleY,
      },
      shorePlaneZ: SHORELINE_WORLD_Z,
      waterLevel: WATER_LEVEL,
      shoreProfileTexture: this.resources.shoreProfileTexture,
    })
  }

  private setupBushesState(frame: FrameState) {
    this.bushes.setFrameState({
      camera: frame.camera,
      horizon: frame.vegetationHorizon,
      phase: this.scrollToPhase(this.scrollNorm),
      debugView: false,
      atlasTextures: this.resources.foliageAtlas,
      sceneScale: {
        x: frame.sceneFrame.scaleX,
        y: frame.sceneFrame.scaleY,
      },
    })
  }

  private setupMorningFogState(frame: FrameState) {
    this.morningFog.setFrameState({
      phase: this.scrollToPhase(this.scrollNorm),
      debugDensity: false,
    })
  }

  private setupHeroTitleState(frame: FrameState) {
    this.heroTitle.setFrameState({
      camera: frame.camera,
      phase: this.scrollToPhase(this.scrollNorm),
      waterLevel: WATER_LEVEL,
      titleHero: frame.titleHero,
      atlas: frame.activeTitleRenderData?.atlas ?? frame.heroTitleAtlas,
      digit: frame.activeTitleRenderData?.digit ?? 1,
      gpuLayout: frame.activeTitleRenderData?.gpuLayout ?? null,
      layoutSize: frame.activeLayoutSize
    })
  }

  private setupTitleGlowState(frame: FrameState) {
    const active = frame.activeTitleRenderData

    this.titleGlow.setFrameState({
      enabled: this.glowEnabled && frame.useGlyphTitle,
      debugIsolate: this.passView === "glow",
      camera: frame.camera,
      phase: this.scrollToPhase(this.scrollNorm),
      waterLevel: WATER_LEVEL,
      titleHero: frame.titleHero,
      phraseTexture: active?.phraseTexture ?? null,
      phraseTextureSize: frame.activePhraseTexSize ?? { width: 1, height: 1 }, // размер текстуры
      titleAtlasPxRange: active?.atlas.font.atlas.distanceRange ?? 4,
      layoutSize: frame.activeLayoutSize // логический layout
    })
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
    this.titleGlow.dispose()
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
    this.titleGlow.setOutputFramebuffer(framebuffer)
  }

  private pointerToRippleUV(clientX: number, clientY: number) {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const camera = this.resolveCamera()

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

    // NOTE: Phase 1 upgrades ripple input to the same world-water mapping used by the landscape shader, so interaction no longer depends on the screen's lower half.
    return waterWorldToRippleUV(waterHit)
  }

  private resolveCamera() {
    // NOTE: Phase C — recompute only when viewport size changes.
    // If cinematic camera motion is introduced later, include that motion phase/revision
    // in this cache invalidation key.
    if (
      !this.cachedCamera ||
      this.width !== this.cameraWidth ||
      this.height !== this.cameraHeight
    ) {
      this.cachedCamera = computeSceneCamera(this.width, this.height)
      this.cameraWidth = this.width
      this.cameraHeight = this.height
    }

    return this.cachedCamera
  }

}
