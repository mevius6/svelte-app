import { Program } from "../gl/Program"
import { FullscreenQuad } from "../gl/FullscreenQuad"
import { RenderPass } from "../render/RenderPass"
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
  scroll: number
  textTexture: WebGLTexture
  textRect: TextRect
  rippleTexelSize: number
  sceneScale: {
    x: number
    y: number
  }
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
  private sceneScale = { x: 1, y: 1 }

  constructor(gl: WebGL2RenderingContext) {
    super(gl)
    this.program = this.createProgram("beauty")
    this.quad = new FullscreenQuad(gl)
  }

  setFrameState(state: LandscapeFrameState) {
    this.scroll = state.scroll
    this.textTexture = state.textTexture
    this.textRect = state.textRect
    this.rippleTexelSize = state.rippleTexelSize
    this.sceneScale = state.sceneScale
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
