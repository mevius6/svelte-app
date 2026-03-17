import { createTexture, type TextureOptions } from "./texture"

export type FBOOptions = TextureOptions & {
  clearColor?: [number, number, number, number]
}

export class FBO {

  framebuffer: WebGLFramebuffer
  texture: WebGLTexture

  constructor(
    private gl: WebGL2RenderingContext,
    width: number,
    height: number,
    options: FBOOptions = {}
  ) {

    this.texture = createTexture(gl, width, height, options)

    const fb = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)

    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0
    )

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteFramebuffer(fb)
      gl.deleteTexture(this.texture)
      throw new Error("Framebuffer is incomplete")
    }

    const clearColor = options.clearColor
    if (clearColor) {
      gl.clearColor(...clearColor)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    this.framebuffer = fb

  }

  bind() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer)
  }

  dispose() {
    this.gl.deleteFramebuffer(this.framebuffer)
    this.gl.deleteTexture(this.texture)
  }

}
