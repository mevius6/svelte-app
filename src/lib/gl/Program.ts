export class Program {

  gl: WebGL2RenderingContext
  program: WebGLProgram
  uniforms = new Map<string, WebGLUniformLocation | null>()

  constructor(gl: WebGL2RenderingContext, vs: string, fs: string) {

    this.gl = gl
    this.program = this.createProgram(vs, fs)

  }

  use() {
    this.gl.useProgram(this.program)
  }

  setFloat(name: string, v: number) {
    const l = this.loc(name)
    if (l !== null) this.gl.uniform1f(l, v)
  }

  setVec2(name: string, x: number, y: number) {
    const l = this.loc(name)
    if (l !== null) this.gl.uniform2f(l, x, y)
  }

  setVec3(name: string, x: number, y: number, z: number) {
    const l = this.loc(name)
    if (l !== null) this.gl.uniform3f(l, x, y, z)
  }

  setVec4(name: string, x: number, y: number, z: number, w: number) {
    const l = this.loc(name)
    if (l !== null) this.gl.uniform4f(l, x, y, z, w)
  }

  setTexture(name: string, tex: WebGLTexture | null, unit: number) {

    const gl = this.gl
    const l = this.loc(name)

    if (l === null || !tex) return

    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(l, unit)

  }

  private loc(name: string): WebGLUniformLocation | null {

    if (!this.uniforms.has(name)) {

      const loc = this.gl.getUniformLocation(this.program, name)
      this.uniforms.set(name, loc)

    }

    return this.uniforms.get(name)!

  }

  dispose() {
    this.gl.deleteProgram(this.program)
  }

  private createProgram(vs: string, fs: string) {

    const gl = this.gl

    const vsShader = this.compile(gl.VERTEX_SHADER, vs)
    const fsShader = this.compile(gl.FRAGMENT_SHADER, fs)

    const prog = gl.createProgram()!

    gl.attachShader(prog, vsShader)
    gl.attachShader(prog, fsShader)
    gl.linkProgram(prog)

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog)
      throw new Error(`Program link error:\n${log}`)
    }

    gl.deleteShader(vsShader)
    gl.deleteShader(fsShader)

    return prog

  }

  private compile(type: number, src: string) {

    const gl = this.gl

    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)
      throw new Error(`Shader compile error:\n${log}`)
    }

    return shader

  }

}
