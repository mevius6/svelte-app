export abstract class RenderPass {

  protected gl: WebGL2RenderingContext
  protected width = 0
  protected height = 0
  private outputFramebuffer: WebGLFramebuffer | null = null

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
  }

  resize(w: number, h: number) {
    this.width = w
    this.height = h
  }

  setOutputFramebuffer(framebuffer: WebGLFramebuffer | null) {
    this.outputFramebuffer = framebuffer
  }

  protected bindOutputFramebuffer() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.outputFramebuffer)
  }

  abstract render(
    time: number,
    input: WebGLTexture | null
  ): WebGLTexture | null

}
