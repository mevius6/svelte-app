import { Program } from "../gl/Program"
import { FullscreenQuad } from "../gl/FullscreenQuad"
import { RenderPass } from "../render/RenderPass"
import type { RippleWorldRect, SceneCameraState, TitleHeroState } from "../scene/sceneCamera"
import type { HeroTitleAtlasRenderData } from "../scene/LandscapeResources"
import landscapeVert from "../shaders/landscape.vert?raw"
import landscapeFrag from "../shaders/landscape.frag?raw"

export type LandscapeDebugMode = "beauty" | "ripple" | "normals" | "reflection"

type LandscapeFrameState = {
  camera: SceneCameraState
  scroll: number
  textTexture: WebGLTexture
  titleHero: TitleHeroState
  useTitleBillboard: boolean
  titleAtlasRenderData: HeroTitleAtlasRenderData | null
  rippleTexelSize: number
  rippleWorldRect: RippleWorldRect
  sceneScale: {
    x: number
    y: number
  }
  shorePlaneZ: number
  waterLevel: number
  // AI: Phase A — pre-baked shore profile (512×1 RGBA32F).
  shoreProfileTexture: WebGLTexture | null
}

function injectShaderDefines(source: string, defines: string[]) {
  if (defines.length === 0) {
    return source
  }

  const defineBlock = defines.map((define) => `#define ${define}`).join("\n")
  const versionMatch = source.match(/^#version[^\n]*\n/)

  if (!versionMatch) {
    return `${defineBlock}\n${source}`
  }

  const versionLine = versionMatch[0]
  return `${versionLine}${defineBlock}\n${source.slice(versionLine.length)}`
}

export class LandscapePass extends RenderPass {

  private program: Program
  private quad: FullscreenQuad
  private debugMode: LandscapeDebugMode = "beauty"
  private scroll = 0
  private textTexture: WebGLTexture | null = null
  private titleHero: TitleHeroState = {
    center: { x: 0, y: 0, z: 0 },
    size: { w: 1, h: 1 },
    uvRect: { x: 0, y: 0, w: 1, h: 1 },
  }
  private useTitleBillboard = true
  private titleAtlasRenderData: HeroTitleAtlasRenderData | null = null
  private rippleTexelSize = 0
  private rippleWorldRect: RippleWorldRect = { x: 0, z: 0, w: 1, depth: 1 }
  private sceneScale = { x: 1, y: 1 }
  private camera: SceneCameraState = {
    position: { x: 0, y: 0, z: 1 },
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovY: Math.PI / 4,
    tanHalfFovY: Math.tan(Math.PI / 8),
  }
  private shorePlaneZ = -1
  private waterLevel = 0
  // AI: Phase A
  private shoreProfileTexture: WebGLTexture | null = null

  constructor(gl: WebGL2RenderingContext) {
    super(gl)
    this.program = this.createProgram("beauty")
    this.quad = new FullscreenQuad(gl)
  }

  setFrameState(state: LandscapeFrameState) {
    this.camera = state.camera
    this.scroll = state.scroll
    this.textTexture = state.textTexture
    this.titleHero = state.titleHero
    this.useTitleBillboard = state.useTitleBillboard

    this.titleAtlasRenderData = state.titleAtlasRenderData

    this.rippleTexelSize = state.rippleTexelSize
    this.rippleWorldRect = state.rippleWorldRect
    this.sceneScale = state.sceneScale
    this.shorePlaneZ = state.shorePlaneZ
    this.waterLevel = state.waterLevel
    this.shoreProfileTexture = state.shoreProfileTexture ?? null
  }

  setDebugMode(mode: LandscapeDebugMode) {
    if (mode === this.debugMode) {
      return
    }

    // AI: compile isolated debug shader variants behind explicit defines so debug views stay off by default.
    this.program.dispose()
    this.program = this.createProgram(mode)
    this.debugMode = mode
  }

  render(time: number, rippleTex: WebGLTexture | null) {
    if (!this.textTexture) {
      return rippleTex
    }

    const gl = this.gl

    this.bindOutputFramebuffer()
    gl.viewport(0, 0, this.width, this.height)

    this.program.use()

    // AI: move fullscreen landscape shading behind LandscapePass so the component only feeds frame state. No behavior change intended.
    this.program.setFloat("u_time", time)
    this.program.setFloat("u_scroll", this.scroll)
    this.program.setVec2("u_resolution", this.width, this.height)
    this.program.setVec2("u_sceneScale", this.sceneScale.x, this.sceneScale.y)
    // AI: Phase 1 passes orbital camera state into the fullscreen shader so depth can come from world rays instead of only screen UV composition.
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
    // AI: Phase C — tanHalfFovY pre-computed in computeSceneCamera.
    this.program.setFloat("u_cameraTanHalfFovY", this.camera.tanHalfFovY)
    this.program.setTexture("u_textTex", this.textTexture, 0)
    this.program.setFloat("u_useTitleBillboard", this.useTitleBillboard ? 1 : 0)
    this.program.setFloat("u_useTitlePhraseReflection", this.titleAtlasRenderData?.phraseTexture ? 1 : 0)
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
    this.program.setVec4(
      "u_titleTexRect",
      this.titleHero.uvRect.x,
      this.titleHero.uvRect.y,
      this.titleHero.uvRect.w,
      this.titleHero.uvRect.h
    )
    this.program.setFloat(
      "u_titleAtlasPxRange",
      this.titleAtlasRenderData?.atlas.font.atlas.distanceRange ?? 4
    )
    this.program.setVec2(
      "u_titleLayoutSize",
      this.titleAtlasRenderData?.gpuLayout.phraseLayout.width ?? 1,
      this.titleAtlasRenderData?.gpuLayout.phraseLayout.height ?? 1
    )
    this.program.setTexture("u_titlePhraseTex", this.titleAtlasRenderData?.phraseTexture ?? null, 4)
    this.program.setVec2(
      "u_titlePhraseTexSize",
      this.titleAtlasRenderData?.phraseTextureSize.width ?? 1,
      this.titleAtlasRenderData?.phraseTextureSize.height ?? 1
    )

    this.program.setTexture("u_rippleTex", rippleTex, 1)
    this.program.setFloat("u_rippleTexel", this.rippleTexelSize)
    // AI: texture units:
    // 0=textTex, 1=ripple, 3=shoreProfile, 4=titlePhraseTex (2 currently free).
    this.program.setTexture("u_shoreProfileTex", this.shoreProfileTexture, 3)
    this.program.setVec4(
      "u_rippleWorldRect",
      this.rippleWorldRect.x,
      this.rippleWorldRect.z,
      this.rippleWorldRect.w,
      this.rippleWorldRect.depth
    )
    this.program.setFloat("u_shorePlaneZ", this.shorePlaneZ)
    this.program.setFloat("u_waterLevel", this.waterLevel)

    this.quad.draw()

    return null
  }

  dispose() {
    this.program.dispose()
    this.quad.dispose()
  }

  private createProgram(mode: LandscapeDebugMode) {
    const defines: string[] = []

    if (mode === "ripple") {
      defines.push("DEBUG_RIPPLE")
    } else if (mode === "normals") {
      defines.push("DEBUG_NORMALS")
    } else if (mode === "reflection") {
      defines.push("DEBUG_REFLECTION")
    }

    return new Program(this.gl, landscapeVert, injectShaderDefines(landscapeFrag, defines))
  }

}
