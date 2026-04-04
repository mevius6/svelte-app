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
  debugView?: boolean
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

function smoothstep(edge0: number, edge1: number, value: number) {
  const width = Math.max(edge1 - edge0, 1e-6)
  const t = Math.min(Math.max((value - edge0) / width, 0), 1)
  return t * t * (3 - 2 * t)
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

function createSeededRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export class BushesPass extends RenderPass {

  private program: Program
  private vao: WebGLVertexArrayObject
  private buffers: WebGLBuffer[] = []
  private instanceCount = 0
  private horizon = 0.5
  private phase = 0
  private debugView = false
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

    // AI: vegetation PoC — cover full shoreline strip, but preserve
    // painterly rhythm via clustered density + intentional gaps.
    const GRASS_COLUMNS = 90
    const GRASS_ROWS = 4
    const CARDS_PER_CLUMP = 3
    const instanceRootData: number[] = []
    const instanceScaleData: number[] = []
    const instanceAtlasData: number[] = []
    const cardIndexData: number[] = []
    const instanceRandData: number[] = []
    const bankXMin = RIPPLE_WORLD_RECT.x + 0.18
    const bankXMax = RIPPLE_WORLD_RECT.x + RIPPLE_WORLD_RECT.w - 0.18
    const rng = createSeededRng(0x5eedc0de)
    const laneStep = 1 / Math.max(GRASS_COLUMNS - 1, 1)
    const rowDepthStep = 0.016

    for (let row = 0; row < GRASS_ROWS; row++) {
      const rowT = GRASS_ROWS > 1 ? row / (GRASS_ROWS - 1) : 0
      const rowXOffset = (row % 2 === 0 ? 0 : 0.5) * laneStep

      for (let col = 0; col < GRASS_COLUMNS; col++) {
        const laneT = GRASS_COLUMNS > 1 ? col / (GRASS_COLUMNS - 1) : 0.5
        const jitteredLane = Math.min(
          1,
          Math.max(0, laneT + rowXOffset + (rng() - 0.5) * laneStep * 0.9)
        )
        const worldX = mix(bankXMin, bankXMax, jitteredLane)
        const centerBias = 1 - Math.abs(jitteredLane * 2 - 1)
        // AI: PoC tuning — distribute vegetation into soft clusters and preserve
        // a readability corridor around the center title zone.
        const clusterWave = 0.5 + 0.5 * Math.sin(worldX * 5.4 + row * 1.7)
        const microWave = 0.5 + 0.5 * Math.sin(worldX * 15.7 + row * 3.9 + 1.2)
        const clusteredCoverage = 0.18 + (0.58 * clusterWave + 0.42 * microWave) * 0.74
        const centerDistance = Math.abs(jitteredLane - 0.5)
        const centerCoverage = mix(0.28, 1, smoothstep(0.0, 0.20, centerDistance))
        const keepChance = Math.min(Math.max(clusteredCoverage * centerCoverage, 0.08), 0.96)
        if (rng() > keepChance) {
          continue
        }

        const root = shorelineVegetationRootAtWorldX(worldX)
        // AI: seating fix — keep roots biased below ground to avoid floating clumps.
        // Positive Y jitter is intentionally removed; random shift stays negative only.
        root.y -= 0.0012 + rng() * 0.003 + centerBias * 0.0005
        root.z += (rng() - 0.5) * 0.010 - row * rowDepthStep

        const atlasRegion =
          FOLIAGE_ATLAS_REGIONS[Math.floor(rng() * FOLIAGE_ATLAS_REGIONS.length)] ??
          FOLIAGE_ATLAS_REGIONS[0]
        const atlasAspect = atlasRegion.uvSize[0] / atlasRegion.uvSize[1]
        const clumpShape = mix(0.86, 1.08, clusterWave)
        const baseHeight =
          (0.018 +
          rowT * 0.009 +
          rng() * 0.010 +
          centerBias * 0.003) * clumpShape
        const baseWidth = baseHeight * atlasAspect * (0.58 + rng() * 0.18)

        for (let card = 0; card < CARDS_PER_CLUMP; card++) {
          // AI: bury each card a bit deeper based on card height so the transparent
          // atlas foot does not read as hovering over the shoreline.
          const buryDepth = baseHeight * (0.10 + rng() * 0.06)
          instanceRootData.push(
            root.x + (rng() - 0.5) * 0.032,
            root.y - buryDepth - rng() * 0.0012,
            root.z + (rng() - 0.5) * 0.006
          )
          instanceScaleData.push(
            baseWidth * (0.86 + rng() * 0.22),
            baseHeight * (0.88 + rng() * 0.24)
          )
          instanceAtlasData.push(
            atlasRegion.uvMin[0],
            atlasRegion.uvMin[1],
            atlasRegion.uvSize[0],
            atlasRegion.uvSize[1]
          )
          cardIndexData.push(card)
          instanceRandData.push(rng(), rng())
        }
      }
    }

    this.instanceCount = cardIndexData.length
    const instanceRoot = new Float32Array(instanceRootData)
    const instanceScale = new Float32Array(instanceScaleData)
    const instanceAtlas = new Float32Array(instanceAtlasData)
    const cardIndex = new Float32Array(cardIndexData)
    const instanceRand = new Float32Array(instanceRandData)

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
    this.debugView = state.debugView ?? false
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

    this.bindOutputFramebuffer()
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
    this.program.setFloat("u_debugView", this.debugView ? 1 : 0)
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
