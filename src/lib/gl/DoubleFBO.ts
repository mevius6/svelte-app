import { FBO, type FBOOptions } from "./FBO"

export class DoubleFBO {

  read: FBO
  write: FBO

  constructor(
    gl: WebGL2RenderingContext,
    w: number,
    h: number,
    options: FBOOptions = {}
  ) {

    this.read = new FBO(gl, w, h, options)
    this.write = new FBO(gl, w, h, options)

  }

  swap() {
    const tmp = this.read
    this.read = this.write
    this.write = tmp
  }

  dispose() {
    this.read.dispose()
    this.write.dispose()
  }

}
