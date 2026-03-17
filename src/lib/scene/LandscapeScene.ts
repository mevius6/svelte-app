import { RipplePass } from "../passes/RipplePass"
import { LandscapePass, type LandscapeDebugMode } from "../passes/LandscapePass"
import { BushesPass } from "../passes/BushesPass"
import type { Scene } from "./Scene"

const DEFAULT_FOLIAGE_ATLAS_SRC = "/RobiniaViscosa_2_basecolor-1K.png"
const DROP_THROTTLE_MS = 45
const VEGETATION_DEBUG_CLEAR: [number, number, number, number] = [0.03, 0.04, 0.06, 1.0]

export type PassDebugView = "final" | "ripple" | "landscape" | "vegetation"

export type SceneDebugState = {
  passView: PassDebugView
  landscapeMode: Exclude<LandscapeDebugMode, "ripple">
}

type TextTexture = {
  texture: WebGLTexture
  w: number
  h: number
}

export class LandscapeScene implements Scene {

  private gl: WebGL2RenderingContext
  private projectName: string
  private atlasSrc: string

  private ripple: RipplePass
  private landscape: LandscapePass
  private bushes: BushesPass

  private textTexture: WebGLTexture | null = null
  private textTexSize = { w: 1, h: 1 }
  private foliageAtlas: WebGLTexture | null = null
  private dummyRippleTex: WebGLTexture | null = null

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
  }

  async init() {
    if (this.initialized) return

    const textResult = this.createTextTexture(this.projectName)
    if (!textResult) {
      throw new Error("Failed to create landscape title texture")
    }

    this.textTexture = textResult.texture
    this.textTexSize = textResult
    this.foliageAtlas = await this.loadTexture(this.atlasSrc)

    if (!this.ripple.enabled) {
      this.dummyRippleTex = this.createDummyRippleTexture()
    }

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
    if (!this.textTexture) {
      return
    }

    const rippleTex = this.ripple.render(time, null) ?? this.dummyRippleTex
    const aspect = this.width / this.height
    const hw = 0.22
    const hh = hw * aspect * (this.textTexSize.h / this.textTexSize.w)

    this.landscape.setFrameState({
      scroll: this.scrollNorm,
      textTexture: this.textTexture,
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
        atlasTexture: this.foliageAtlas,
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
        atlasTexture: this.foliageAtlas,
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

    if (this.textTexture) {
      this.gl.deleteTexture(this.textTexture)
      this.textTexture = null
    }

    if (this.foliageAtlas) {
      this.gl.deleteTexture(this.foliageAtlas)
      this.foliageAtlas = null
    }

    if (this.dummyRippleTex) {
      this.gl.deleteTexture(this.dummyRippleTex)
      this.dummyRippleTex = null
    }

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

  private createTextTexture(text: string): TextTexture | null {
    const off = document.createElement("canvas")
    const ctx = off.getContext("2d")
    if (!ctx) {
      return null
    }

    const fontSize = 96
    const fontStr = `300 ${fontSize}px "Georgia", "Times New Roman", serif`
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

}
