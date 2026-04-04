import { Program } from "../gl/Program"
import { FullscreenQuad } from "../gl/FullscreenQuad"
import { RenderPass } from "../render/RenderPass"
import quadVert from "../shaders/landscape.vert?raw"
import morningFogFrag from "../shaders/morning-fog.frag?raw"

type MorningFogFrameState = {
  phase: number
  debugDensity?: boolean
}

export class MorningFogPass extends RenderPass {

  private program: Program
  private quad: FullscreenQuad
  private phase = 0
  private debugDensity = false

  constructor(gl: WebGL2RenderingContext) {
    super(gl)
    this.program = new Program(gl, quadVert, morningFogFrag)
    this.quad = new FullscreenQuad(gl)
  }

  setFrameState(state: MorningFogFrameState) {
    this.phase = state.phase
    this.debugDensity = state.debugDensity ?? false
  }

  render(time: number, input: WebGLTexture | null) {
    const gl = this.gl
    this.bindOutputFramebuffer()
    gl.viewport(0, 0, this.width, this.height)

    if (this.debugDensity) {
      gl.disable(gl.BLEND)
    } else {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    }

    this.program.use()
    this.program.setVec2("u_resolution", this.width, this.height)
    this.program.setFloat("u_phase", this.phase)
    this.program.setFloat("u_time", time)
    this.program.setFloat("u_debugDensity", this.debugDensity ? 1 : 0)
    this.quad.draw()

    if (!this.debugDensity) {
      gl.disable(gl.BLEND)
    }
    return input
  }

  dispose() {
    this.program.dispose()
    this.quad.dispose()
  }

}
