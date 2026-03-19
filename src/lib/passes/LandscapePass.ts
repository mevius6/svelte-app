import { Program } from "../gl/Program"
import { FullscreenQuad } from "../gl/FullscreenQuad"
import { RenderPass } from "../render/RenderPass"
import type { RippleWorldRect, SceneCameraState } from "../scene/sceneCamera"
import landscapeVert from "../shaders/landscape.vert?raw"
import landscapeFrag from "../shaders/landscape.frag?raw"

export type LandscapeDebugMode = "beauty" | "ripple" | "normals" | "reflection"

type TextRect = {
  x: number
  y: number
  w: number
  h: number
}

type LandscapeFrameState = {
  camera: SceneCameraState
  scroll: number
  textTexture: WebGLTexture
  textRect: TextRect
  rippleTexelSize: number
  rippleWorldRect: RippleWorldRect
  sceneScale: {
    x: number
    y: number
  }
  shorePlaneZ: number
  waterLevel: number
}

function injectShaderDefines(source: string, defines: string[]) {
  if (defines.length === 0) {
    return source
  }

  const defineBlock = defines.map((define) => `#define ${define}`).join("\n")
  const versionMatch = source.match(/^#version[^\n]*\n/)

  if (!versionMatch) {
    return `${defineBlock}\n${source}`
  }

  const versionLine = versionMatch[0]
  return `${versionLine}${defineBlock}\n${source.slice(versionLine.length)}`
}

export class LandscapePass extends RenderPass {

  private program: Program
  private quad: FullscreenQuad
  private debugMode: LandscapeDebugMode = "beauty"
  private scroll = 0
  private textTexture: WebGLTexture | null = null
  private textRect: TextRect = { x: 0, y: 0, w: 0, h: 0 }
  private rippleTexelSize = 0
  private rippleWorldRect: RippleWorldRect = { x: 0, z: 0, w: 1, depth: 1 }
  private sceneScale = { x: 1, y: 1 }
  private camera: SceneCameraState = {
    position: { x: 0, y: 0, z: 1 },
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovY: Math.PI / 4,
  }
  private shorePlaneZ = -1
  private waterLevel = 0

  constructor(gl: WebGL2RenderingContext) {
    super(gl)
    this.program = this.createProgram("beauty")
    this.quad = new FullscreenQuad(gl)
  }

  setFrameState(state: LandscapeFrameState) {
    this.camera = state.camera
    this.scroll = state.scroll
    this.textTexture = state.textTexture
    this.textRect = state.textRect
    this.rippleTexelSize = state.rippleTexelSize
    this.rippleWorldRect = state.rippleWorldRect
    this.sceneScale = state.sceneScale
    this.shorePlaneZ = state.shorePlaneZ
    this.waterLevel = state.waterLevel
  }

  setDebugMode(mode: LandscapeDebugMode) {
    if (mode === this.debugMode) {
      return
    }

    // AI: compile isolated debug shader variants behind explicit defines so debug views stay off by default.
    this.program.dispose()
    this.program = this.createProgram(mode)
    this.debugMode = mode
  }

  render(time: number, rippleTex: WebGLTexture | null) {
    if (!this.textTexture) {
      return rippleTex
    }

    const gl = this.gl

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)

    this.program.use()

    // AI: move fullscreen landscape shading behind LandscapePass so the component only feeds frame state. No behavior change intended.
    this.program.setFloat("u_time", time)
    this.program.setFloat("u_scroll", this.scroll)
    this.program.setVec2("u_resolution", this.width, this.height)
    this.program.setVec2("u_sceneScale", this.sceneScale.x, this.sceneScale.y)
    // AI: Phase 1 passes orbital camera state into the fullscreen shader so depth can come from world rays instead of only screen UV composition.
    this.program.setVec3(
      "u_cameraPos",
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z
    )
    this.program.setVec3(
      "u_cameraRight",
      this.camera.right.x,
      this.camera.right.y,
      this.camera.right.z
    )
    this.program.setVec3(
      "u_cameraUp",
      this.camera.up.x,
      this.camera.up.y,
      this.camera.up.z
    )
    this.program.setVec3(
      "u_cameraForward",
      this.camera.forward.x,
      this.camera.forward.y,
      this.camera.forward.z
    )
    this.program.setFloat("u_cameraTanHalfFovY", Math.tan(this.camera.fovY * 0.5))
    this.program.setVec4(
      "u_textRect",
      this.textRect.x,
      this.textRect.y,
      this.textRect.w,
      this.textRect.h
    )
    this.program.setTexture("u_textTex", this.textTexture, 0)

    this.program.setTexture("u_rippleTex", rippleTex, 1)
    this.program.setFloat("u_rippleTexel", this.rippleTexelSize)
    this.program.setVec4(
      "u_rippleWorldRect",
      this.rippleWorldRect.x,
      this.rippleWorldRect.z,
      this.rippleWorldRect.w,
      this.rippleWorldRect.depth
    )
    this.program.setFloat("u_shorePlaneZ", this.shorePlaneZ)
    this.program.setFloat("u_waterLevel", this.waterLevel)

    this.quad.draw()

    return null
  }

  dispose() {
    this.program.dispose()
    this.quad.dispose()
  }

  private createProgram(mode: LandscapeDebugMode) {
    const defines: string[] = []

    if (mode === "ripple") {
      defines.push("DEBUG_RIPPLE")
    } else if (mode === "normals") {
      defines.push("DEBUG_NORMALS")
    } else if (mode === "reflection") {
      defines.push("DEBUG_REFLECTION")
    }

    return new Program(this.gl, landscapeVert, injectShaderDefines(landscapeFrag, defines))
  }

}
