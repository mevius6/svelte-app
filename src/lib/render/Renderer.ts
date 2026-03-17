import { createGL } from "../gl/Context"
import type { Scene } from "../scene/Scene"

// Renderer — низкоуровневый менеджер GPU. Он отвечает за создание контекста WebGL, управление рендерингом и обновлением сцены, а также за запуск основного цикла рендеринга.

export class Renderer {

  gl: WebGL2RenderingContext
  canvas: HTMLCanvasElement
  private scene: Scene | null = null
  private frameId = 0
  private lastTime = 0
  private mountToken = 0
  private width = 0
  private height = 0

  constructor(canvas: HTMLCanvasElement) {

    this.canvas = canvas
    const gl = createGL(canvas)

    this.gl = gl

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)

  }

  async mount(scene: Scene) {
    this.disposeScene()

    const mountToken = ++this.mountToken
    this.scene = scene
    await scene.init()

    if (this.scene !== scene || this.mountToken !== mountToken) {
      return
    }

    this.resizeToDisplaySize()
    this.lastTime = 0
    this.frameId = requestAnimationFrame(this.loop)
  }

  private readonly loop = (timeMs: number) => {
    if (!this.scene) {
      return
    }

    this.resizeToDisplaySize()

    const time = timeMs * 0.001
    const dt = this.lastTime === 0 ? 0 : time - this.lastTime
    this.lastTime = time

    this.scene.update(dt)
    this.scene.render(time)

    this.frameId = requestAnimationFrame(this.loop)
  }

  private resizeToDisplaySize() {
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr))
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr))

    if (this.width === width && this.height === height) {
      return
    }

    this.width = width
    this.height = height

    this.canvas.width = width
    this.canvas.height = height

    this.gl.viewport(0, 0, width, height)
    this.scene?.resize(width, height)
  }

  private disposeScene() {
    if (!this.scene) {
      return
    }

    this.scene.dispose()
    this.scene = null
  }

  dispose() {
    this.mountToken += 1

    if (this.frameId) {
      cancelAnimationFrame(this.frameId)
      this.frameId = 0
    }

    this.lastTime = 0
    this.disposeScene()
  }

}
