export function createGL(canvas: HTMLCanvasElement) {

  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true
  }) as WebGL2RenderingContext | null

  if (!gl) {
    throw new Error("WebGL2 not supported")
  }

  gl.getExtension("EXT_color_buffer_float")
  gl.getExtension("OES_texture_float_linear")

  return gl
}
