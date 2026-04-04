import { Program } from "../gl/Program"
import { FullscreenQuad } from "../gl/FullscreenQuad"
import { RenderPass } from "../render/RenderPass"
import quadVert from "../shaders/landscape.vert?raw"
import finalColorFrag from "../shaders/post/final-color.frag?raw"

type FinalColorFrameState = {
  useExactSrgb: boolean
}

export class FinalColorPass extends RenderPass {

  private program: Program
  private quad: FullscreenQuad
  private useExactSrgb = true

  constructor(gl: WebGL2RenderingContext) {
    super(gl)
    this.program = new Program(gl, quadVert, finalColorFrag)
    this.quad = new FullscreenQuad(gl)
  }

  setFrameState(state: FinalColorFrameState) {
    this.useExactSrgb = state.useExactSrgb
  }

  render(_time: number, input: WebGLTexture | null) {
    if (!input) {
      return null
    }

    const gl = this.gl
    this.bindOutputFramebuffer()
    gl.viewport(0, 0, this.width, this.height)
    gl.disable(gl.BLEND)

    this.program.use()
    this.program.setVec2("u_resolution", this.width, this.height)
    this.program.setFloat("u_useExactSrgb", this.useExactSrgb ? 1 : 0)
    this.program.setTexture("u_sceneColor", input, 0)
    this.quad.draw()

    return null
  }

  dispose() {
    this.program.dispose()
    this.quad.dispose()
  }

}
