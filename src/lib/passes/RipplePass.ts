import { DoubleFBO } from "../gl/DoubleFBO"
import { Program } from "../gl/Program"
import { FullscreenQuad } from "../gl/FullscreenQuad"
import rippleFrag from "../shaders/ripple.frag?raw"
import quadVert from "../shaders/landscape.vert?raw"
import { RenderPass } from "../render/RenderPass"

const DROP_RADIUS = 0.032
const DROP_STRENGTH = 0.38

export class RipplePass extends RenderPass {

  private buffers: DoubleFBO | null = null
  private program: Program | null = null
  private quad: FullscreenQuad | null = null
  private readonly size: number
  private readonly rippleTexelSize: number
  private pendingDrop: { x: number; y: number } | null = null

  constructor(gl: WebGL2RenderingContext, size = 512) {
    super(gl)

    this.size = size
    this.rippleTexelSize = 1 / size

    if (!gl.getExtension("EXT_color_buffer_float")) {
      return
    }

    this.program = new Program(gl, quadVert, rippleFrag)
    this.quad = new FullscreenQuad(gl)
    this.buffers = new DoubleFBO(gl, size, size, {
      // AI: keep the ripple pass on a float ping-pong heightfield so the extracted pass matches the old in-component simulation.
      internalFormat: gl.RG16F,
      format: gl.RG,
      type: gl.HALF_FLOAT,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      clearColor: [0, 0, 0, 0],
    })
  }

  queueDrop(x: number, y: number) {
    if (!this.enabled) return
    this.pendingDrop = { x, y }
  }

  render(_time: number, _input: WebGLTexture | null) {
    if (!this.enabled) {
      return null
    }

    this.compute()
    return this.output
  }

  compute() {
    if (!this.program || !this.quad || !this.buffers) {
      return
    }

    const gl = this.gl
    const drop = this.pendingDrop
    this.pendingDrop = null

    this.buffers.write.bind()
    gl.viewport(0, 0, this.size, this.size)

    this.program.use()
    this.program.setTexture("u_state", this.buffers.read.texture, 0)
    this.program.setVec2("u_texelSize", this.rippleTexelSize, this.rippleTexelSize)

    if (drop) {
      this.program.setVec2("u_dropPos", drop.x, drop.y)
      this.program.setFloat("u_dropRadius", DROP_RADIUS)
      this.program.setFloat("u_dropStrength", DROP_STRENGTH)
      this.program.setFloat("u_dropActive", 1.0)
    } else {
      this.program.setFloat("u_dropActive", 0.0)
    }

    this.quad.draw()

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.buffers.swap()

  }

  get output() {
    return this.buffers?.read.texture ?? null
  }

  get texelSize() {
    return this.enabled ? this.rippleTexelSize : 0
  }

  get enabled() {
    return this.program !== null && this.quad !== null && this.buffers !== null
  }

  dispose() {
    this.program?.dispose()
    this.quad?.dispose()
    this.buffers?.dispose()
    this.pendingDrop = null
  }

}
