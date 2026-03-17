export abstract class RenderPass {

  protected gl: WebGL2RenderingContext
  protected width = 0
  protected height = 0

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
  }

  resize(w: number, h: number) {
    this.width = w
    this.height = h
  }

  abstract render(
    time: number,
    input: WebGLTexture | null
  ): WebGLTexture | null

}
