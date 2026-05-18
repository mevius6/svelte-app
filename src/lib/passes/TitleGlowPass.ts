import { Program } from "../gl/Program"
import { FullscreenQuad } from "../gl/FullscreenQuad"
import { FBO } from "../gl/FBO"
import { RenderPass } from "../render/RenderPass"
import type { SceneCameraState, TitleHeroState } from "../scene/sceneCamera"
import quadVert from "../shaders/landscape.vert?raw"
import titleGlowSourceFrag from "../shaders/title-glow.frag?raw"
import titleGlowBlurFrag from "../shaders/post/title-glow-blur.frag?raw"
import titleGlowCompositeFrag from "../shaders/post/title-glow-composite.frag?raw"

type TitleGlowFrameState = {
  enabled: boolean
  debugIsolate: boolean
  camera: SceneCameraState
  phase: number
  waterLevel: number
  titleHero: TitleHeroState
  phraseTexture: WebGLTexture | null
  phraseTextureSize: {
    width: number
    height: number
  }
  titleAtlasPxRange: number
  layoutSize?: { width: number; height: number } | null
}

export class TitleGlowPass extends RenderPass {

  private sourceProgram: Program
  private blurProgram: Program
  private compositeProgram: Program
  private quad: FullscreenQuad
  private sourceBuffer: FBO | null = null
  private pingBuffer: FBO | null = null
  private pongBuffer: FBO | null = null
  private glowWidth = 0
  private glowHeight = 0
  private enabled = true
  private debugIsolate = false
  private camera: SceneCameraState = {
    position: { x: 0, y: 0, z: 1 },
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovY: Math.PI / 4,
    tanHalfFovY: Math.tan(Math.PI / 8),
  }
  private phase = 0
  private waterLevel = 0
  private titleHero: TitleHeroState = {
    center: { x: 0, y: 0, z: 0 },
    size: { w: 1, h: 1 },
    uvRect: { x: 0, y: 0, w: 1, h: 1 },
  }
  private phraseTexture: WebGLTexture | null = null
  private phraseTextureSize = { width: 1, height: 1 }
  private titleAtlasPxRange = 4

  private layoutSize = { width: 1, height: 1 }

  constructor(gl: WebGL2RenderingContext) {
    super(gl)
    this.sourceProgram = new Program(gl, quadVert, titleGlowSourceFrag)
    this.blurProgram = new Program(gl, quadVert, titleGlowBlurFrag)
    this.compositeProgram = new Program(gl, quadVert, titleGlowCompositeFrag)
    this.quad = new FullscreenQuad(gl)
  }

  override resize(width: number, height: number) {
    super.resize(width, height)
    this.ensureBuffers()
  }

  setFrameState(state: TitleGlowFrameState) {
    this.enabled = state.enabled
    this.debugIsolate = state.debugIsolate
    this.camera = state.camera
    this.phase = state.phase
    this.waterLevel = state.waterLevel
    this.titleHero = state.titleHero
    this.phraseTexture = state.phraseTexture
    this.phraseTextureSize = state.phraseTextureSize
    this.titleAtlasPxRange = state.titleAtlasPxRange
    this.layoutSize = state.layoutSize ?? this.phraseTextureSize
  }

  render(time: number, input: WebGLTexture | null) {
    if (!this.enabled || !this.phraseTexture) {
      return input
    }

    this.ensureBuffers()
    if (!this.sourceBuffer || !this.pingBuffer || !this.pongBuffer) {
      return input
    }

    const gl = this.gl
    const glowWidth = this.glowWidth
    const glowHeight = this.glowHeight

    // NOTE: Stage 1 (Bloom source) — render only glow source mask/color.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sourceBuffer.framebuffer)
    gl.viewport(0, 0, glowWidth, glowHeight)
    gl.disable(gl.BLEND)
    gl.clearColor(0.0, 0.0, 0.0, 0.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    this.sourceProgram.use()
    this.sourceProgram.setVec2("u_resolution", glowWidth, glowHeight)
    this.sourceProgram.setVec3(
      "u_cameraPos",
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z
    )
    this.sourceProgram.setVec3(
      "u_cameraRight",
      this.camera.right.x,
      this.camera.right.y,
      this.camera.right.z
    )
    this.sourceProgram.setVec3(
      "u_cameraUp",
      this.camera.up.x,
      this.camera.up.y,
      this.camera.up.z
    )
    this.sourceProgram.setVec3(
      "u_cameraForward",
      this.camera.forward.x,
      this.camera.forward.y,
      this.camera.forward.z
    )
    this.sourceProgram.setFloat("u_cameraTanHalfFovY", this.camera.tanHalfFovY)
    this.sourceProgram.setVec3(
      "u_titleWorldCenter",
      this.titleHero.center.x,
      this.titleHero.center.y,
      this.titleHero.center.z
    )
    this.sourceProgram.setVec2(
      "u_titleWorldSize",
      this.titleHero.size.w,
      this.titleHero.size.h
    )
    this.sourceProgram.setTexture("u_titlePhraseTex", this.phraseTexture, 0)
    this.sourceProgram.setVec2(
      "u_titlePhraseTexSize",
      Math.max(this.phraseTextureSize.width, 1),
      Math.max(this.phraseTextureSize.height, 1)
    )
    this.sourceProgram.setVec2(
      "u_titleLayoutSize",
      this.layoutSize.width,
      this.layoutSize.height
    )
    this.sourceProgram.setFloat("u_titleAtlasPxRange", this.titleAtlasPxRange)
    this.sourceProgram.setFloat("u_phase", this.phase)
    this.sourceProgram.setFloat("u_waterLevel", this.waterLevel)
    // Glow MSDF parameters
    this.sourceProgram.setFloat("u_glowStrokeOffset", 0.0)
    this.sourceProgram.setFloat("u_glowSoftness", 1.0)
    this.sourceProgram.setFloat("u_glowGamma", 1.0)
    this.quad.draw()

    // NOTE: Stage 2 (Separable blur) — multi-pass gaussian radii for smooth halo.
    let readTexture: WebGLTexture = this.sourceBuffer.texture
    const blurRadii = [1.0, 2.25, 4.0]
    for (const radius of blurRadii) {
      this.runBlurPass(readTexture, this.pingBuffer.framebuffer, glowWidth, glowHeight, 1, 0, radius)
      this.runBlurPass(this.pingBuffer.texture, this.pongBuffer.framebuffer, glowWidth, glowHeight, 0, 1, radius)
      readTexture = this.pongBuffer.texture
    }

    // NOTE: Stage 3 (Layered composite) — additive in final pass, isolate mode for debug.
    this.bindOutputFramebuffer()
    gl.viewport(0, 0, this.width, this.height)
    gl.enable(gl.BLEND)
    if (this.debugIsolate) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    } else {
      gl.blendFunc(gl.ONE, gl.ONE)
    }

    this.compositeProgram.use()
    this.compositeProgram.setVec2("u_resolution", this.width, this.height)
    this.compositeProgram.setVec2("u_glowResolution", glowWidth, glowHeight)
    this.compositeProgram.setTexture("u_glowTex", readTexture, 0)
    this.compositeProgram.setFloat("u_phase", this.phase)
    this.compositeProgram.setFloat("u_time", time)
    this.compositeProgram.setFloat("u_debugIsolate", this.debugIsolate ? 1 : 0)

    // console.log('Glow uniforms', {
    //   worldSize: this.titleHero.size,
    //   layoutSize: this.layoutSize,
    //   phraseTexSize: this.phraseTextureSize,
    // })

    this.quad.draw()

    gl.disable(gl.BLEND)
    return input
  }

  dispose() {
    this.sourceProgram.dispose()
    this.blurProgram.dispose()
    this.compositeProgram.dispose()
    this.quad.dispose()
    this.disposeBuffers()
  }

  private runBlurPass(
    sourceTexture: WebGLTexture,
    targetFramebuffer: WebGLFramebuffer,
    width: number,
    height: number,
    dirX: number,
    dirY: number,
    radius: number
  ) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer)
    gl.viewport(0, 0, width, height)
    gl.disable(gl.BLEND)

    this.blurProgram.use()
    this.blurProgram.setVec2("u_resolution", width, height)
    this.blurProgram.setTexture("u_sourceTex", sourceTexture, 0)
    this.blurProgram.setVec2("u_texelSize", 1 / Math.max(width, 1), 1 / Math.max(height, 1))
    this.blurProgram.setVec2("u_direction", dirX, dirY)
    this.blurProgram.setFloat("u_radius", radius)
    this.quad.draw()
  }

  private ensureBuffers() {
    const targetWidth = Math.max(1, Math.round(this.width * 0.72))
    const targetHeight = Math.max(1, Math.round(this.height * 0.72))
    if (
      this.sourceBuffer &&
      this.pingBuffer &&
      this.pongBuffer &&
      targetWidth === this.glowWidth &&
      targetHeight === this.glowHeight
    ) {
      return
    }

    this.disposeBuffers()
    this.sourceBuffer = new FBO(this.gl, targetWidth, targetHeight, { clearColor: [0, 0, 0, 0] })
    this.pingBuffer = new FBO(this.gl, targetWidth, targetHeight, { clearColor: [0, 0, 0, 0] })
    this.pongBuffer = new FBO(this.gl, targetWidth, targetHeight, { clearColor: [0, 0, 0, 0] })
    this.glowWidth = targetWidth
    this.glowHeight = targetHeight
  }

  private disposeBuffers() {
    this.sourceBuffer?.dispose()
    this.pingBuffer?.dispose()
    this.pongBuffer?.dispose()
    this.sourceBuffer = null
    this.pingBuffer = null
    this.pongBuffer = null
    this.glowWidth = 0
    this.glowHeight = 0
  }

}
