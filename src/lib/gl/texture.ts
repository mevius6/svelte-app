export type TextureOptions = {
  internalFormat?: number
  format?: number
  type?: number
  minFilter?: number
  magFilter?: number
  wrapS?: number
  wrapT?: number
}

export function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  options: TextureOptions = {}
): WebGLTexture {
  const {
    internalFormat = gl.RGBA,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
    minFilter = gl.LINEAR,
    magFilter = gl.LINEAR,
    wrapS = gl.CLAMP_TO_EDGE,
    wrapT = gl.CLAMP_TO_EDGE,
  } = options

  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    height,
    0,
    format,
    type,
    null
  )

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT)
  gl.bindTexture(gl.TEXTURE_2D, null)

  return tex
}
