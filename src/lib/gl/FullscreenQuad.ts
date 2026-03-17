export class FullscreenQuad {

  private vao: WebGLVertexArrayObject
  private buffer: WebGLBuffer

  constructor(private gl: WebGL2RenderingContext) {

    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)

    const buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

    // 2 triangles (clip space)
    const data = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ])

    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)

    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    gl.bindVertexArray(null)

    this.vao = vao
    this.buffer = buffer
  }

  draw() {
    const gl = this.gl
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  dispose() {
    this.gl.deleteBuffer(this.buffer)
    this.gl.deleteVertexArray(this.vao)
  }

}
