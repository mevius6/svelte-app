import { RipplePass } from "../passes/RipplePass"
import { LandscapePass, type LandscapeDebugMode } from "../passes/LandscapePass"
import { BushesPass } from "../passes/BushesPass"
import { LandscapeResources } from "./LandscapeResources"
import type { Scene } from "./Scene"

const DEFAULT_FOLIAGE_ATLAS_SRC = "/RobiniaViscosa_2_basecolor-1K.png"
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
  private atlasSrc: string

  private ripple: RipplePass
  private landscape: LandscapePass
  private bushes: BushesPass
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
    atlasSrc = DEFAULT_FOLIAGE_ATLAS_SRC
  ) {
    this.gl = gl
    this.projectName = projectName
    this.atlasSrc = atlasSrc

    this.ripple = new RipplePass(gl)
    this.landscape = new LandscapePass(gl)
    this.bushes = new BushesPass(gl)
    this.resources = new LandscapeResources(gl)
  }

  async init() {
    if (this.initialized) return

    // AI: keep LandscapeScene focused on input + pass orchestration by delegating GPU asset setup to LandscapeResources.
    await this.resources.load({
      projectName: this.projectName,
      atlasSrc: this.atlasSrc,
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
    const aspect = this.width / this.height
    const hw = 0.22
    const textTexSize = this.resources.textTextureSize
    const hh = hw * aspect * (textTexSize.h / textTexSize.w)

    this.landscape.setFrameState({
      scroll: this.scrollNorm,
      textTexture,
      textRect: { x: 0.5, y: 0.67, w: hw, h: hh },
      rippleTexelSize: this.ripple.texelSize,
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
        horizon: 0.5,
        atlasTexture: this.resources.foliageAtlas,
      })
      this.bushes.render(time, null)
      return
    }

    const landscapeMode = this.passView === "landscape" ? this.landscapeMode : "beauty"
    this.landscape.setDebugMode(landscapeMode)
    this.landscape.render(time, rippleTex)

    if (this.passView === "final") {
      this.bushes.setFrameState({
        horizon: 0.5,
        atlasTexture: this.resources.foliageAtlas,
      })
      this.bushes.render(time, null)
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
    this.ripple.dispose()
    this.resources.dispose()

    this.initialized = false
  }

  private pointerToRippleUV(clientX: number, clientY: number) {
    const normX = clientX / window.innerWidth
    const normY = clientY / window.innerHeight

    if (normY < 0.5) {
      return null
    }

    const ry = (normY - 0.5) * 2.0

    return {
      x: Math.max(0.001, Math.min(0.999, normX)),
      y: Math.max(0.001, Math.min(0.999, ry)),
    }
  }

}
