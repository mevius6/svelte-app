import { Program } from "../gl/Program"
import bushesVert from "../shaders/bushes.vert?raw"
import bushesFrag from "../shaders/bushes.frag?raw"
import { RenderPass } from "../render/RenderPass"
import type { FoliageAtlasTextureSet } from "../scene/LandscapeResources"
import {
  RIPPLE_WORLD_RECT,
  shorelineVegetationRootAtWorldX,
  type SceneCameraState,
} from "../scene/sceneCamera"

type BushesFrameState = {
  camera: SceneCameraState
  horizon: number
  phase: number
  atlasTextures: FoliageAtlasTextureSet
  sceneScale: {
    x: number
    y: number
  }
}

type BushAtlasRegion = {
  id: string
  uvMin: [number, number]
  uvSize: [number, number]
}

const FOLIAGE_ATLAS_SIZE = 512

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function atlasRegionFromPixels(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): BushAtlasRegion {
  return {
    id,
    uvMin: [x / FOLIAGE_ATLAS_SIZE, y / FOLIAGE_ATLAS_SIZE],
    uvSize: [width / FOLIAGE_ATLAS_SIZE, height / FOLIAGE_ATLAS_SIZE],
  }
}

const FOLIAGE_ATLAS_REGIONS: BushAtlasRegion[] = [
  // AI: bounds come from the alpha-mask silhouette, so the card samples the dense clump instead of the full padded texture.
  atlasRegionFromPixels("grass-clump-main", 95, 26, 320, 465),
]

export class BushesPass extends RenderPass {

  private program: Program
  private vao: WebGLVertexArrayObject
  private buffers: WebGLBuffer[] = []
  private instanceCount = 0
  private horizon = 0.5
  private phase = 0
  private sceneScale = { x: 1, y: 1 }
  private camera: SceneCameraState = {
    position: { x: 0, y: 0, z: 1 },
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovY: Math.PI / 4,
    tanHalfFovY: Math.tan(Math.PI / 8),
  }
  private atlasTextures: FoliageAtlasTextureSet = {
    albedo: null,
    alpha: null,
    normal: null,
    roughness: null,
    translucency: null,
  }

  constructor(gl: WebGL2RenderingContext) {
    super(gl)

    this.program = new Program(gl, bushesVert, bushesFrag)

    const vao = gl.createVertexArray()
    if (!vao) {
      throw new Error("Failed to create bushes VAO")
    }

    this.vao = vao
    gl.bindVertexArray(this.vao)

    // AI: keep bush instance setup inside BushesPass so the scene only coordinates ordered passes.
    this.makeBuffer(
      new Float32Array([
        -0.5, 0.0,
         0.5, 0.0,
        -0.5, 1.0,
        -0.5, 1.0,
         0.5, 0.0,
         0.5, 1.0,
      ]),
      0,
      2
    )

    const BUSH_COUNT = 18
    const CARDS_PER_BUSH = 3
    this.instanceCount = BUSH_COUNT * CARDS_PER_BUSH

    const instanceRoot  = new Float32Array(this.instanceCount * 3)
    const instanceScale = new Float32Array(this.instanceCount * 2)
    const instanceAtlas = new Float32Array(this.instanceCount * 4)
    const cardIndex     = new Float32Array(this.instanceCount)
    const instanceRand  = new Float32Array(this.instanceCount * 2)
    const bankXMin = RIPPLE_WORLD_RECT.x + 0.18
    const bankXMax = RIPPLE_WORLD_RECT.x + RIPPLE_WORLD_RECT.w - 0.18

    for (let b = 0; b < BUSH_COUNT; b++) {
      const laneT = b / (BUSH_COUNT - 1)
      const heroBias = 1.0 - Math.abs(laneT * 2.0 - 1.0)
      const baseWorldX = Math.min(
        bankXMax,
        Math.max(bankXMin, mix(bankXMin, bankXMax, laneT) + (Math.random() - 0.5) * 0.12)
      )
      const root = shorelineVegetationRootAtWorldX(baseWorldX)
      root.y += (Math.random() - 0.5) * 0.004 - heroBias * 0.001
      root.z += (Math.random() - 0.5) * 0.018
      const atlasRegion =
        FOLIAGE_ATLAS_REGIONS[Math.floor(Math.random() * FOLIAGE_ATLAS_REGIONS.length)] ??
        FOLIAGE_ATLAS_REGIONS[0]
      const atlasAspect = atlasRegion.uvSize[0] / atlasRegion.uvSize[1]
      const baseH = 0.026 + heroBias * 0.010 + Math.random() * 0.012
      const baseW = baseH * atlasAspect * (0.62 + Math.random() * 0.12)

      for (let c = 0; c < CARDS_PER_BUSH; c++) {
        const i = b * CARDS_PER_BUSH + c
        instanceRoot[i * 3 + 0]  = root.x + (Math.random() - 0.5) * 0.05
        instanceRoot[i * 3 + 1]  = root.y + (Math.random() - 0.5) * 0.002
        instanceRoot[i * 3 + 2]  = root.z + (Math.random() - 0.5) * 0.008
        instanceScale[i * 2 + 0] = baseW * (0.9 + Math.random() * 0.2)
        instanceScale[i * 2 + 1] = baseH * (0.9 + Math.random() * 0.2)
        instanceAtlas[i * 4 + 0] = atlasRegion.uvMin[0]
        instanceAtlas[i * 4 + 1] = atlasRegion.uvMin[1]
        instanceAtlas[i * 4 + 2] = atlasRegion.uvSize[0]
        instanceAtlas[i * 4 + 3] = atlasRegion.uvSize[1]
        cardIndex[i]             = c
        instanceRand[i * 2 + 0]  = Math.random()
        instanceRand[i * 2 + 1]  = Math.random()
      }
    }

    // AI: store vegetation roots directly in world space so placement can follow the same shoreline/camera model as LandscapePass.
    this.makeBuffer(instanceRoot, 1, 3, 1)
    this.makeBuffer(instanceScale, 2, 2, 1)
    // AI: pass explicit atlas rects per instance so the shader no longer hardcodes sprite layout assumptions.
    this.makeBuffer(instanceAtlas, 3, 4, 1)
    this.makeBuffer(cardIndex, 4, 1, 1)
    this.makeBuffer(instanceRand, 5, 2, 1)

    gl.bindVertexArray(null)
  }

  private makeBuffer(
    data: Float32Array,
    location: number,
    size: number,
    divisor = 0
  ) {
    const gl = this.gl
    const buffer = gl.createBuffer()
    if (!buffer) {
      throw new Error("Failed to create bushes buffer")
    }

    this.buffers.push(buffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)

    if (divisor > 0) {
      gl.vertexAttribDivisor(location, divisor)
    }
  }

  setFrameState(state: BushesFrameState) {
    this.camera = state.camera
    this.horizon = state.horizon
    this.phase = state.phase
    this.atlasTextures = state.atlasTextures
    this.sceneScale = state.sceneScale
  }

  render(time: number, input: WebGLTexture | null) {
    if (
      !this.atlasTextures.albedo ||
      !this.atlasTextures.alpha ||
      !this.atlasTextures.normal ||
      !this.atlasTextures.roughness ||
      !this.atlasTextures.translucency
    ) {
      return input
    }

    const gl = this.gl

    gl.viewport(0, 0, this.width, this.height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    this.program.use()
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
    this.program.setFloat("u_cameraTanHalfFovY", this.camera.tanHalfFovY)
    this.program.setFloat("u_horizon", this.horizon)
    this.program.setFloat("u_phase", this.phase)
    this.program.setVec2("u_resolution", this.width, this.height)
    this.program.setVec2("u_sceneScale", this.sceneScale.x, this.sceneScale.y)
    this.program.setFloat("u_time", time)
    this.program.setTexture("u_foliageAlbedo", this.atlasTextures.albedo, 0)
    this.program.setTexture("u_foliageAlpha", this.atlasTextures.alpha, 1)
    this.program.setTexture("u_foliageNormal", this.atlasTextures.normal, 2)
    this.program.setTexture("u_foliageRoughness", this.atlasTextures.roughness, 3)
    this.program.setTexture("u_foliageTranslucency", this.atlasTextures.translucency, 4)

    gl.bindVertexArray(this.vao)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount)
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)

    return input
  }

  dispose() {
    this.program.dispose()
    this.buffers.forEach((buffer) => {
      this.gl.deleteBuffer(buffer)
    })
    this.gl.deleteVertexArray(this.vao)
    this.buffers = []
  }

}
