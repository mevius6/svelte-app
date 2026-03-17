import { Program } from "../gl/Program"
import bushesVert from "../shaders/bushes.vert?raw"
import bushesFrag from "../shaders/bushes.frag?raw"
import { RenderPass } from "../render/RenderPass"

type BushesFrameState = {
  horizon: number
  atlasTexture: WebGLTexture | null
}

export class BushesPass extends RenderPass {

  private program: Program
  private vao: WebGLVertexArrayObject
  private buffers: WebGLBuffer[] = []
  private instanceCount = 0
  private horizon = 0.5
  private atlasTexture: WebGLTexture | null = null

  constructor(gl: WebGL2RenderingContext) {
    super(gl)

    this.program = new Program(gl, bushesVert, bushesFrag)

    const vao = gl.createVertexArray()
    if (!vao) {
      throw new Error("Failed to create bushes VAO")
    }

    this.vao = vao
    gl.bindVertexArray(this.vao)

    // AI: keep bush instance setup inside BushesPass so the scene only coordinates ordered passes.
    this.makeBuffer(
      new Float32Array([
        -0.5, 0.0,
         0.5, 0.0,
        -0.5, 1.0,
        -0.5, 1.0,
         0.5, 0.0,
         0.5, 1.0,
      ]),
      0,
      2
    )

    const BUSH_COUNT = 6
    const CARDS_PER_BUSH = 3
    this.instanceCount = BUSH_COUNT * CARDS_PER_BUSH

    const instancePos   = new Float32Array(this.instanceCount * 2)
    const instanceScale = new Float32Array(this.instanceCount * 2)
    const instanceType  = new Float32Array(this.instanceCount)
    const cardIndex     = new Float32Array(this.instanceCount)
    const instanceRand  = new Float32Array(this.instanceCount * 2)

    for (let b = 0; b < BUSH_COUNT; b++) {
      const baseX = 0.18 + (b / (BUSH_COUNT - 1)) * 0.64
      const baseH = 0.06 + Math.random() * 0.05
      const baseW = 0.05 + Math.random() * 0.03
      const bushType = Math.random() < 0.5 ? 0 : 1

      for (let c = 0; c < CARDS_PER_BUSH; c++) {
        const i = b * CARDS_PER_BUSH + c
        instancePos[i * 2 + 0]   = baseX + (Math.random() - 0.5) * 0.01
        instancePos[i * 2 + 1]   = 0.0
        instanceScale[i * 2 + 0] = baseW * (0.9 + Math.random() * 0.2)
        instanceScale[i * 2 + 1] = baseH * (0.9 + Math.random() * 0.2)
        instanceType[i]          = bushType
        cardIndex[i]             = c
        instanceRand[i * 2 + 0]  = Math.random()
        instanceRand[i * 2 + 1]  = Math.random()
      }
    }

    this.makeBuffer(instancePos, 1, 2, 1)
    this.makeBuffer(instanceScale, 2, 2, 1)
    this.makeBuffer(instanceType, 3, 1, 1)
    this.makeBuffer(cardIndex, 4, 1, 1)
    this.makeBuffer(instanceRand, 5, 2, 1)

    gl.bindVertexArray(null)
  }

  private makeBuffer(
    data: Float32Array,
    location: number,
    size: number,
    divisor = 0
  ) {
    const gl = this.gl
    const buffer = gl.createBuffer()
    if (!buffer) {
      throw new Error("Failed to create bushes buffer")
    }

    this.buffers.push(buffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)

    if (divisor > 0) {
      gl.vertexAttribDivisor(location, divisor)
    }
  }

  setFrameState(state: BushesFrameState) {
    this.horizon = state.horizon
    this.atlasTexture = state.atlasTexture
  }

  render(time: number, input: WebGLTexture | null) {
    if (!this.atlasTexture) {
      return input
    }

    const gl = this.gl

    gl.viewport(0, 0, this.width, this.height)
    this.program.use()
    this.program.setFloat("u_horizon", this.horizon)
    this.program.setVec2("u_resolution", this.width, this.height)
    this.program.setFloat("u_time", time)
    this.program.setTexture("u_foliageAtlas", this.atlasTexture, 0)

    gl.bindVertexArray(this.vao)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount)
    gl.bindVertexArray(null)

    return input
  }

  dispose() {
    this.program.dispose()
    this.buffers.forEach((buffer) => {
      this.gl.deleteBuffer(buffer)
    })
    this.gl.deleteVertexArray(this.vao)
    this.buffers = []
  }

}
