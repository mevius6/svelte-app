import { Program } from "../gl/Program"
import heroTitleVert from "../shaders/hero-title.vert?raw"
import heroTitleFrag from "../shaders/hero-title.frag?raw"
import { RenderPass } from "../render/RenderPass"
import type { HeroTitlePhraseGpuLayout } from "../text/heroTitleAtlas"
import type { HeroTitleAtlasResource } from "../scene/LandscapeResources"
import type { SceneCameraState, TitleHeroState } from "../scene/sceneCamera"

import { HERO_TITLE_ANCHOR } from '$lib/scene/sceneFraming';

type HeroTitleFrameState = {
  camera: SceneCameraState
  phase: number
  titleHero: TitleHeroState
  atlas: HeroTitleAtlasResource | null
  gpuLayout: HeroTitlePhraseGpuLayout | null
}

export class HeroTitlePass extends RenderPass {

  private program: Program
  private vao: WebGLVertexArrayObject
  private quadBuffer: WebGLBuffer
  private glyphBoundsBuffer: WebGLBuffer
  private atlasRectBuffer: WebGLBuffer
  private phraseLayout: HeroTitlePhraseGpuLayout["phraseLayout"] | null = null
  private instanceCount = 0
  private currentLayoutKey = ""
  private currentAtlas: HeroTitleAtlasResource | null = null
  private camera: SceneCameraState = {
    position: { x: 0, y: 0, z: 1 },
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovY: Math.PI / 4,
  }
  private phase = 0
  private titleHero: TitleHeroState = {
    center: { x: 0, y: 0, z: 0 },
    size: { w: 1, h: 1 },
    uvRect: { x: 0, y: 0, w: 1, h: 1 },
  }

  constructor(
    gl: WebGL2RenderingContext,
    private text: string
  ) {
    super(gl)

    this.program = new Program(gl, heroTitleVert, heroTitleFrag)
    const vao = gl.createVertexArray()
    const quadBuffer = gl.createBuffer()
    const glyphBoundsBuffer = gl.createBuffer()
    const atlasRectBuffer = gl.createBuffer()

    if (!vao || !quadBuffer || !glyphBoundsBuffer || !atlasRectBuffer) {
      throw new Error("Failed to create hero title pass buffers")
    }

    this.vao = vao
    this.quadBuffer = quadBuffer
    this.glyphBoundsBuffer = glyphBoundsBuffer
    this.atlasRectBuffer = atlasRectBuffer

    gl.bindVertexArray(this.vao)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0.0, 0.0,
        1.0, 0.0,
        0.0, 1.0,
        0.0, 1.0,
        1.0, 0.0,
        1.0, 1.0,
      ]),
      gl.STATIC_DRAW
    )
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphBoundsBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(1, 1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.atlasRectBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(2, 1)

    gl.bindVertexArray(null)
  }

  setFrameState(state: HeroTitleFrameState) {
    this.camera = state.camera
    this.phase = state.phase
    this.titleHero = state.titleHero
    this.syncAtlas(state.atlas, state.gpuLayout)
  }

  render(time: number, input: WebGLTexture | null) {
    if (!this.currentAtlas?.texture || !this.phraseLayout || this.instanceCount === 0) {
      return input
    }

    const gl = this.gl

    gl.viewport(0, 0, this.width, this.height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    this.program.use()
    this.program.setVec2("u_resolution", this.width, this.height)
    this.program.setVec3(
      "u_cameraPos",
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z
    )
    this.program.setVec3(
      "u_cameraRight",
      this.camera.right.x,
      this.camera.right.y,
      this.camera.right.z
    )
    this.program.setVec3(
      "u_cameraUp",
      this.camera.up.x,
      this.camera.up.y,
      this.camera.up.z
    )
    this.program.setVec3(
      "u_cameraForward",
      this.camera.forward.x,
      this.camera.forward.y,
      this.camera.forward.z
    )
    this.program.setFloat("u_cameraTanHalfFovY", Math.tan(this.camera.fovY * 0.5))
    this.program.setVec3(
      "u_titleWorldCenter",
      this.titleHero.center.x,
      this.titleHero.center.y,
      this.titleHero.center.z
    )
    this.program.setVec2(
      "u_titleWorldSize",
      this.titleHero.size.w,
      this.titleHero.size.h
    )
    this.program.setVec2(
      "u_titleLayoutSize",
      this.phraseLayout.width,
      this.phraseLayout.height
    )
    this.program.setVec2(
      "u_titleAtlasSize",
      this.currentAtlas.font.atlas.width,
      this.currentAtlas.font.atlas.height
    )
    this.program.setFloat("u_titleAtlasPxRange", this.currentAtlas.font.atlas.distanceRange)
    this.program.setFloat("u_phase", this.phase)
    this.program.setFloat("u_waterLevel", 0)
    this.program.setFloat("u_time", time)
    this.program.setTexture("u_titleAtlas", this.currentAtlas.texture, 0)

    gl.bindVertexArray(this.vao)
    this.program.setFloat("u_passMode", 0)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount)
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)

    return input
  }

  dispose() {
    this.program.dispose()
    this.gl.deleteBuffer(this.quadBuffer)
    this.gl.deleteBuffer(this.glyphBoundsBuffer)
    this.gl.deleteBuffer(this.atlasRectBuffer)
    this.gl.deleteVertexArray(this.vao)
  }

  private syncAtlas(
    atlas: HeroTitleAtlasResource | null,
    gpuLayout: HeroTitlePhraseGpuLayout | null
  ) {
    const nextKey = atlas?.imageUrl && gpuLayout
      ? `${this.text}:${atlas.imageUrl}:${gpuLayout.phraseLayout.glyphs.length}`
      : ""
    if (nextKey === this.currentLayoutKey) {
      this.currentAtlas = atlas
      return
    }

    this.currentAtlas = atlas
    this.currentLayoutKey = nextKey

    if (!atlas?.texture || !gpuLayout) {
      this.instanceCount = 0
      this.phraseLayout = null
      return
    }

    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphBoundsBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, gpuLayout.glyphBoundsData, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.atlasRectBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, gpuLayout.glyphAtlasData, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)

    this.phraseLayout = gpuLayout.phraseLayout
    this.instanceCount = gpuLayout.phraseLayout.glyphs.length
  }

}
