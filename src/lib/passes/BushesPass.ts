import { Program } from "../gl/Program"
import bushesVert from "../shaders/bushes.vert?raw"
import bushesFrag from "../shaders/bushes.frag?raw"
import { RenderPass } from "../render/RenderPass"
import type { FoliageAtlasTextureSet } from "../scene/LandscapeResources"
import {
  WATER_LEVEL,
  computeSceneCamera,
  computeVisibleBankXExtents,
  shorelineVegetationRootOnBank,
  type SceneCameraState,
} from "../scene/sceneCamera"
import {
  VEGETATION_GRASS_MIN_Y_ABOVE_WATER,
  VEGETATION_SLOPE_T_MAX,
  VEGETATION_SLOPE_T_MIN,
} from "../scene/sceneConfig"

type BushesFrameState = {
  camera: SceneCameraState
  phase: number
  debugView?: boolean
  atlasTextures: FoliageAtlasTextureSet
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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
  private quadBuffer: WebGLBuffer
  private instanceBuffers: WebGLBuffer[] = []
  private instanceCount = 0
  private builtAspect = 0
  private phase = 0
  private debugView = false
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

    const quad = gl.createBuffer()
    if (!quad) {
      throw new Error("Failed to create bushes quad buffer")
    }
    this.quadBuffer = quad
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -0.5, 0.0,
         0.5, 0.0,
        -0.5, 1.0,
        -0.5, 1.0,
         0.5, 0.0,
         0.5, 1.0,
      ]),
      gl.STATIC_DRAW
    )
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.rebuildGrassInstances(1920, 1080)
    gl.bindVertexArray(null)
  }

  resize(width: number, height: number) {
    super.resize(width, height)
    const aspect = width / Math.max(height, 1)
    if (this.instanceCount === 0 || Math.abs(aspect - this.builtAspect) > 0.035) {
      this.rebuildGrassInstances(width, height)
      this.builtAspect = aspect
    }
  }

  private clearInstanceBuffers() {
    const gl = this.gl
    gl.bindVertexArray(this.vao)
    for (const buffer of this.instanceBuffers) {
      gl.deleteBuffer(buffer)
    }
    this.instanceBuffers = []
    for (let location = 1; location <= 5; location++) {
      gl.disableVertexAttribArray(location)
      gl.vertexAttribDivisor(location, 0)
    }
  }

  private rebuildGrassInstances(viewportWidth: number, viewportHeight: number) {
    const gl = this.gl
    this.clearInstanceBuffers()
    gl.bindVertexArray(this.vao)

    const camera = computeSceneCamera(viewportWidth, viewportHeight)
    const bankSpan = computeVisibleBankXExtents(camera, viewportWidth, viewportHeight)
    const bankXMin = bankSpan.minX
    const bankXMax = bankSpan.maxX
    const bankWidth = Math.max(bankXMax - bankXMin, 0.5)
    const GRASS_COLUMNS = Math.round(clamp(bankWidth * 54, 112, 172))
    const GRASS_ROWS = 22
    const CARDS_PER_CLUMP = 3
    const FILL_LAYER_CHANCE = 0.82
    const MICRO_FILL_CHANCE = 0.38
    const EDGE_SEED_COUNT = Math.round(22 + bankWidth * 5.5)
    const BASE_CLUMP_HEIGHT = 0.024
    const HEIGHT_JITTER = 0.0024
    const WIDTH_JITTER = 0.035
    const instanceRootData: number[] = []
    const instanceScaleData: number[] = []
    const instanceAtlasData: number[] = []
    const cardIndexData: number[] = []
    const instanceRandData: number[] = []
    const rng = createSeededRng(0x5eedc0de ^ Math.round(bankWidth * 1000))
    const laneStep = 1 / Math.max(GRASS_COLUMNS - 1, 1)
    const minGrassY = WATER_LEVEL + VEGETATION_GRASS_MIN_Y_ABOVE_WATER

    const appendClump = (worldX: number, slopeT: number, laneT: number) => {
      const root = shorelineVegetationRootOnBank(worldX, slopeT)
      if (root.y < minGrassY) {
        return
      }

      root.y -= 0.0016 + rng() * 0.0014
      root.x += (rng() - 0.5) * 0.014
      root.z += (rng() - 0.5) * 0.006

      const atlasRegion =
        FOLIAGE_ATLAS_REGIONS[Math.floor(rng() * FOLIAGE_ATLAS_REGIONS.length)] ??
        FOLIAGE_ATLAS_REGIONS[0]
      const atlasAspect = atlasRegion.uvSize[0] / atlasRegion.uvSize[1]
      const centerBias = 1 - Math.abs(laneT * 2 - 1)
      const slopeLift = slopeT * 0.0035
      const baseHeight =
        BASE_CLUMP_HEIGHT +
        slopeLift +
        (rng() - 0.5) * HEIGHT_JITTER +
        centerBias * 0.0012
      const baseWidth =
        baseHeight * atlasAspect * (0.64 + (rng() - 0.5) * WIDTH_JITTER)

      for (let card = 0; card < CARDS_PER_CLUMP; card++) {
        const buryDepth = baseHeight * (0.11 + rng() * 0.04)
        instanceRootData.push(
          root.x + (rng() - 0.5) * 0.022,
          root.y - buryDepth - rng() * 0.0008,
          root.z + (rng() - 0.5) * 0.005
        )
        instanceScaleData.push(
          baseWidth * (0.94 + rng() * 0.08),
          baseHeight * (0.94 + rng() * 0.08)
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

    for (let row = 0; row < GRASS_ROWS; row++) {
      const rowT = GRASS_ROWS > 1 ? row / (GRASS_ROWS - 1) : 0
      const rowXOffset = (row % 2 === 0 ? 0 : 0.5) * laneStep

      for (let col = 0; col < GRASS_COLUMNS; col++) {
        const laneT = GRASS_COLUMNS > 1 ? col / (GRASS_COLUMNS - 1) : 0.5
        const jitteredLane = Math.min(
          1,
          Math.max(0, laneT + rowXOffset + (rng() - 0.5) * laneStep * 0.72)
        )
        const worldX = mix(bankXMin, bankXMax, jitteredLane)
        const slopeT = mix(
          VEGETATION_SLOPE_T_MIN,
          VEGETATION_SLOPE_T_MAX,
          rowT + (rng() - 0.5) * (1 / Math.max(GRASS_ROWS - 1, 1)) * 0.42
        )
        const clusterWave = 0.5 + 0.5 * Math.sin(worldX * 4.8 + slopeT * 5.6)
        const microWave = 0.5 + 0.5 * Math.sin(worldX * 13.5 + slopeT * 9.5 + 0.8)
        const densityField = 0.68 + (0.22 * clusterWave + 0.14 * microWave)
        const centerDistance = Math.abs(jitteredLane - 0.5)
        const centerCoverage = mix(0.62, 1, smoothstep(0.0, 0.26, centerDistance))
        const edgeBoost = Math.max(
          smoothstep(0.78, 0.98, jitteredLane),
          smoothstep(0.78, 0.98, 1.0 - jitteredLane)
        )
        const keepChance = Math.min(
          Math.max(densityField * mix(centerCoverage, 1.0, edgeBoost * 0.85), 0.64),
          0.99
        )

        if (rng() <= keepChance) {
          appendClump(worldX, slopeT, jitteredLane)
        }

        if (rng() <= FILL_LAYER_CHANCE) {
          const fillX = worldX + (rng() - 0.5) * laneStep * 0.95
          const fillSlope = clamp(
            slopeT + (rng() - 0.5) * 0.08,
            VEGETATION_SLOPE_T_MIN,
            VEGETATION_SLOPE_T_MAX
          )
          appendClump(fillX, fillSlope, jitteredLane)
        }

        if (rng() <= MICRO_FILL_CHANCE) {
          appendClump(
            worldX + (rng() - 0.5) * laneStep * 0.55,
            clamp(slopeT + (rng() - 0.5) * 0.05, VEGETATION_SLOPE_T_MIN, VEGETATION_SLOPE_T_MAX),
            jitteredLane
          )
        }
      }
    }

    for (let edge = 0; edge < 2; edge++) {
      const edgeX = edge === 0 ? bankXMin : bankXMax
      for (let i = 0; i < EDGE_SEED_COUNT; i++) {
        const slopeT = mix(
          VEGETATION_SLOPE_T_MIN,
          VEGETATION_SLOPE_T_MAX,
          rng()
        )
        appendClump(edgeX + (rng() - 0.5) * 0.06, slopeT, edge === 0 ? 0 : 1)
      }
    }

    this.instanceCount = cardIndexData.length
    this.makeInstanceBuffer(new Float32Array(instanceRootData), 1, 3, 1)
    this.makeInstanceBuffer(new Float32Array(instanceScaleData), 2, 2, 1)
    this.makeInstanceBuffer(new Float32Array(instanceAtlasData), 3, 4, 1)
    this.makeInstanceBuffer(new Float32Array(cardIndexData), 4, 1, 1)
    this.makeInstanceBuffer(new Float32Array(instanceRandData), 5, 2, 1)
  }

  private makeInstanceBuffer(
    data: Float32Array,
    location: number,
    size: number,
    divisor: number
  ) {
    const gl = this.gl
    const buffer = gl.createBuffer()
    if (!buffer) {
      throw new Error("Failed to create bushes buffer")
    }

    this.instanceBuffers.push(buffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(location, divisor)
  }

  setFrameState(state: BushesFrameState) {
    this.camera = state.camera
    this.phase = state.phase
    this.debugView = state.debugView ?? false
    this.atlasTextures = state.atlasTextures
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
    this.program.setFloat("u_phase", this.phase)
    this.program.setFloat("u_debugView", this.debugView ? 1 : 0)
    this.program.setVec2("u_resolution", this.width, this.height)
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
    this.gl.deleteBuffer(this.quadBuffer)
    this.clearInstanceBuffers()
    this.gl.deleteVertexArray(this.vao)
  }

}
