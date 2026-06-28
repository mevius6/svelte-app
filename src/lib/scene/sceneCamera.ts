export type Vec3 = {
  x: number
  y: number
  z: number
}

export type SceneCameraState = {
  position: Vec3
  forward: Vec3
  right: Vec3
  up: Vec3
  fovY: number
  // NOTE: Phase C — cached to avoid Math.tan() in every render pass.
  tanHalfFovY: number
}

export type TitleHeroState = {
  center: Vec3
  size: {
    w: number
    h: number
  }
  uvRect: {
    x: number
    y: number
    w: number
    h: number
  }
}

export type RippleWorldRect = {
  x: number
  z: number
  w: number
  depth: number
}

const DEG_TO_RAD = Math.PI / 180
const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 }
const CAMERA_TARGET: Vec3 = { x: 0, y: 0.06, z: -0.22 }

export const WATER_LEVEL = 0
export const SHORELINE_WORLD_Z = -0.95
/** Mirrors `SHORE_BANK_*` in landscape/common/constants.glsl */
export const SHORE_BANK_TOE_OFFSET = 0.028
export const SHORE_BANK_CREST_SETBACK = 0.02
export const SHORE_BANK_FOOT_OFFSET_Y = 0
const VEGETATION_ANCHOR_HEIGHT = 0.09
/** Legacy crest-line anchor; prefer roots on `shorelineVegetationRootOnBank`. */
export const VEGETATION_WORLD_Z = SHORELINE_WORLD_Z - 0.035

// NOTE: title anchor — middle of the pond, between camera and shore.
// Camera z≈+2.69, shore z=-0.95 → z=+0.35 sits clearly over open water.
// Widths scaled to preserve apparent screen size at the new depth.
const TITLE_WORLD_Z_NEAR = 0.35
const TITLE_WORLD_Z_FAR = -0.20
const TITLE_WORLD_WIDTH_NEAR = 1.75
const TITLE_WORLD_WIDTH_FAR = 2.10
// NOTE: title reveal window — keep in sync with TITLE_REVEAL_* in landscape/common/constants.glsl.
// Default END <= START: full size from scroll 0. Late-sunset: e.g. 0.78 / 0.94.
export const TITLE_REVEAL_START = 0.0
export const TITLE_REVEAL_END = 0.0
const TITLE_REVEAL_SCALE_MIN = 0.965

export const RIPPLE_WORLD_RECT: RippleWorldRect = {
  x: -2.15,
  z: SHORELINE_WORLD_Z,
  w: 4.3,
  depth: 3.15,
}

// NOTE: Phase 2 — named anchor for the world-space title billboard.
// Describes where the title billboard sits at scroll=0:
//   z: between camera and shoreline, over open water near pond center
//   y: just above water level (actual center y also depends on text aspect)
// computeTitleHeroState() keeps z fixed (no scroll-driven z animation);
// HERO_TITLE_ANCHOR_Z is the scroll=0 reference used by intersectTitleAtlas
// in landscape.frag (same value as TITLE_WORLD_Z_NEAR).
// Ref: landscape.frag intersectTitleAtlas, HeroTitlePass.ts u_titleWorldCenter
export const HERO_TITLE_ANCHOR_Z = TITLE_WORLD_Z_NEAR   //  0.35
export const HERO_TITLE_ANCHOR_Y_BASE = WATER_LEVEL     //  0.0 (text center lifts above this)

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function fract(value: number) {
  return value - Math.floor(value)
}

function smoothstep01(value: number) {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function add(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  }
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }
}

function scale(v: Vec3, amount: number): Vec3 {
  return {
    x: v.x * amount,
    y: v.y * amount,
    z: v.z * amount,
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function length(v: Vec3) {
  return Math.hypot(v.x, v.y, v.z)
}

function normalize(v: Vec3): Vec3 {
  const len = length(v)
  if (len <= 1e-6) {
    return { x: 0, y: 0, z: 0 }
  }

  return scale(v, 1 / len)
}

function hash2(x: number, y: number) {
  let px = fract(x * 127.1)
  let py = fract(y * 311.7)
  const dotValue = px * (px + 74.51) + py * (py + 74.51)
  px += dotValue
  py += dotValue
  return fract(px * py)
}

function vnoise(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fract(x)
  const fy = fract(y)
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)

  return mix(
    mix(hash2(ix, iy), hash2(ix + 1, iy), ux),
    mix(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux),
    uy
  )
}

function shoreFbm(x: number, seedY: number) {
  let value = 0
  let amplitude = 0.5
  let point = x

  for (let i = 0; i < 5; i += 1) {
    value += amplitude * vnoise(point, seedY)
    point *= 2.3
    amplitude *= 0.48
  }

  return value
}

export function baselineSilhouetteAtWorldX(worldX: number) {
  const x = clamp(worldX * 0.16 + 0.5, 0, 1)
  const hLarge = shoreFbm(x * 4.2, 55.5) * 0.052
  const hDetail = shoreFbm(x * 16.0, 88.2) * 0.016
  return 0.5 + 0.018 + hLarge + hDetail
}

export function shorelineHeightAtWorldX(worldX: number) {
  return WATER_LEVEL + Math.max((baselineSilhouetteAtWorldX(worldX) - 0.513) * 1.45, 0)
}

export function shorelineWaterEdgeZAt() {
  return SHORELINE_WORLD_Z + SHORE_BANK_TOE_OFFSET
}

export function shorelineCrestZAt() {
  return SHORELINE_WORLD_Z - SHORE_BANK_CREST_SETBACK
}

/** CPU mirror of `shorelineBankSurfaceYAt` in landscape/domains/shore.glsl */
export function shorelineBankSurfaceYAt(worldX: number, worldZ: number) {
  const crestY = shorelineHeightAtWorldX(worldX)
  const yBase = WATER_LEVEL + SHORE_BANK_FOOT_OFFSET_Y
  const zToe = shorelineWaterEdgeZAt()
  const zCrest = shorelineCrestZAt()
  const slopeT = clamp((zToe - worldZ) / Math.max(zToe - zCrest, 0.001), 0, 1)
  return mix(yBase, crestY, slopeT)
}

/**
 * Place vegetation on the baked bank slope.
 * @param slopeT 0 = water/toe edge, 1 = crest (top of shore profile).
 */
export function shorelineVegetationRootOnBank(worldX: number, slopeT: number): Vec3 {
  const zToe = shorelineWaterEdgeZAt()
  const zCrest = shorelineCrestZAt()
  const t = clamp(slopeT, 0, 1)
  const worldZ = zToe - t * (zToe - zCrest)
  return {
    x: worldX,
    y: shorelineBankSurfaceYAt(worldX, worldZ),
    z: worldZ,
  }
}

/** @deprecated Use shorelineVegetationRootOnBank — crest-only placement. */
export function shorelineVegetationRootAtWorldX(worldX: number): Vec3 {
  return shorelineVegetationRootOnBank(worldX, 1)
}

export function computeTitleHeroState(
  scroll: number,
  textAspect: number, // height / width
  uvRect = { x: 0, y: 0, w: 1, h: 1 }
): TitleHeroState {
  const clampedAspect = Math.max(textAspect, 1e-4);

  // 1) Окно появления по скроллу — оставляем как есть.
  const revealT =
    TITLE_REVEAL_END <= TITLE_REVEAL_START
      ? 1
      : smoothstep01(
          (scroll - TITLE_REVEAL_START) / Math.max(TITLE_REVEAL_END - TITLE_REVEAL_START, 1e-6)
        )
  const revealScale = mix(TITLE_REVEAL_SCALE_MIN, 1, revealT);

  // 2) Базовый world-height — единый для всех заголовков.
  // Подбирается «на глаз» под сцену.
  const baseHeight = 0.45; // раньше это было baseWidth * textAspect
  const height = baseHeight * revealScale;

  // 3) Ширина выводится из aspect: width = height / (height/width)
  const width = height / clampedAspect;

  // 4) Центр: используем ВЫСОТУ, а не width, чтобы текст висел над водой
  return {
    center: {
      x: 0,
      y: WATER_LEVEL + height * 0.5 + 0.06,
      z: TITLE_WORLD_Z_NEAR,
    },
    size: {
      w: width,
      h: height,
    },
    uvRect,
  };
}

// NOTE: Phase 1.5 retunes the orbital framing from open-water scale toward a compact city-pond read: nearer opposite bank, lower eye height, less "sea horizon".
export function computeSceneCamera(
  width: number,
  height: number
): SceneCameraState {
  // NOTE: time-of-day scroll does not affect camera orbit.
  // Camera is fixed at a static angle looking over the pond.
  // Small constants chosen so: horizon sits at ~45% screen height,
  // title is fully over water, shore visible behind it.
  const aspect = Math.max(width, 1) / Math.max(height, 1)
  const yaw   = -0.08   // slight left of center — matches asymmetric shore silhouette
  const pitch  = 0.068  // gentle downward look, water fills lower half
  const radius = 2.92   // fixed distance from CAMERA_TARGET

  const orbitOffset = {
    x: Math.sin(yaw) * Math.cos(pitch) * radius,
    y: Math.sin(pitch) * radius + 0.11,
    z: Math.cos(yaw) * Math.cos(pitch) * radius,
  }

  const position = add(CAMERA_TARGET, orbitOffset)
  const forward = normalize(subtract(CAMERA_TARGET, position))
  const fallbackRight = { x: 1, y: 0, z: 0 }
  const right = normalize(cross(forward, WORLD_UP))
  const safeRight = length(right) > 1e-6 ? right : fallbackRight
  const up = normalize(cross(safeRight, forward))

  const fovY = mix(46, 49, clamp(aspect - 1, 0, 1)) * DEG_TO_RAD
  // NOTE: Phase C — tanHalfFovY cached here so passes don't call Math.tan() each frame.
  const tanHalfFovY = Math.tan(fovY * 0.5)

  return {
    position,
    forward,
    right: safeRight,
    up,
    fovY,
    tanHalfFovY,
  }
}

export function screenPointToWorldRay(
  camera: SceneCameraState,
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number
) {
  const safeWidth = Math.max(viewportWidth, 1)
  const safeHeight = Math.max(viewportHeight, 1)
  const screenX = clientX / safeWidth
  const screenY = 1 - clientY / safeHeight
  const ndcX = screenX * 2 - 1
  const ndcY = screenY * 2 - 1
  const aspect = safeWidth / safeHeight
  const tanHalfFovY = camera.tanHalfFovY

  return normalize({
    x:
      camera.forward.x +
      camera.right.x * ndcX * aspect * tanHalfFovY +
      camera.up.x * ndcY * tanHalfFovY,
    y:
      camera.forward.y +
      camera.right.y * ndcX * aspect * tanHalfFovY +
      camera.up.y * ndcY * tanHalfFovY,
    z:
      camera.forward.z +
      camera.right.z * ndcX * aspect * tanHalfFovY +
      camera.up.z * ndcY * tanHalfFovY,
  })
}

export function intersectRayWithWaterPlane(origin: Vec3, direction: Vec3) {
  if (direction.y >= -1e-4) {
    return null
  }

  const t = (WATER_LEVEL - origin.y) / direction.y
  if (t <= 0) {
    return null
  }

  return add(origin, scale(direction, t))
}

export function waterWorldToRippleUV(point: Vec3) {
  const u = (point.x - RIPPLE_WORLD_RECT.x) / RIPPLE_WORLD_RECT.w
  const v = (point.z - RIPPLE_WORLD_RECT.z) / RIPPLE_WORLD_RECT.depth

  if (u < 0 || u > 1 || v < 0 || v > 1) {
    return null
  }

  return {
    x: clamp(u, 0.001, 0.999),
    y: clamp(v, 0.001, 0.999),
  }
}

export function projectWorldToScreenUV(
  camera: SceneCameraState,
  point: Vec3,
  viewportWidth: number,
  viewportHeight: number
) {
  const safeWidth = Math.max(viewportWidth, 1)
  const safeHeight = Math.max(viewportHeight, 1)
  const aspect = safeWidth / safeHeight
  const tanHalfFovY = camera.tanHalfFovY
  const relative = subtract(point, camera.position)
  const viewX = dot(relative, camera.right)
  const viewY = dot(relative, camera.up)
  const viewZ = dot(relative, camera.forward)

  if (viewZ <= 1e-4) {
    return null
  }

  return {
    x: (viewX / (viewZ * tanHalfFovY * aspect)) * 0.5 + 0.5,
    y: (viewY / (viewZ * tanHalfFovY)) * 0.5 + 0.5,
  }
}

export function computeVegetationHorizon(
  camera: SceneCameraState,
  viewportWidth: number,
  viewportHeight: number
) {
  const projected = projectWorldToScreenUV(
    camera,
    { x: 0, y: VEGETATION_ANCHOR_HEIGHT, z: VEGETATION_WORLD_Z },
    viewportWidth,
    viewportHeight
  )

  return clamp(projected?.y ?? 0.5, 0.08, 0.92)
}

/** Screen UV: x/y in [0,1], origin bottom-left (matches projectWorldToScreenUV). */
export function worldRayFromScreenUV(
  camera: SceneCameraState,
  viewportWidth: number,
  viewportHeight: number,
  screenX: number,
  screenY: number
) {
  const safeWidth = Math.max(viewportWidth, 1)
  const safeHeight = Math.max(viewportHeight, 1)
  const ndcX = screenX * 2 - 1
  const ndcY = screenY * 2 - 1
  const aspect = safeWidth / safeHeight
  const tanHalfFovY = camera.tanHalfFovY

  return {
    origin: camera.position,
    direction: normalize({
      x:
        camera.forward.x +
        camera.right.x * ndcX * aspect * tanHalfFovY +
        camera.up.x * ndcY * tanHalfFovY,
      y:
        camera.forward.y +
        camera.right.y * ndcX * aspect * tanHalfFovY +
        camera.up.y * ndcY * tanHalfFovY,
      z:
        camera.forward.z +
        camera.right.z * ndcX * aspect * tanHalfFovY +
        camera.up.z * ndcY * tanHalfFovY,
    }),
  }
}

export function intersectRayWithPlaneZ(origin: Vec3, direction: Vec3, planeZ: number) {
  if (Math.abs(direction.z) < 1e-5) {
    return null
  }

  const t = (planeZ - origin.z) / direction.z
  if (t <= 0) {
    return null
  }

  return add(origin, scale(direction, t))
}

/**
 * Visible bank span along world X for the current viewport (fullscreen / ultrawide safe).
 * Samples screen edges near the vegetation horizon against mid-bank Z.
 */
export function computeVisibleBankXExtents(
  camera: SceneCameraState,
  viewportWidth: number,
  viewportHeight: number
) {
  const horizon = computeVegetationHorizon(camera, viewportWidth, viewportHeight)
  const bankZ = (shorelineWaterEdgeZAt() + shorelineCrestZAt()) * 0.5
  const sampleScreenX = [0.0, 0.012, 0.988, 1.0]
  const sampleScreenY = [horizon - 0.018, horizon, horizon + 0.028]

  let minX = Infinity
  let maxX = -Infinity

  for (const screenX of sampleScreenX) {
    for (const screenY of sampleScreenY) {
      const ray = worldRayFromScreenUV(
        camera,
        viewportWidth,
        viewportHeight,
        screenX,
        screenY
      )
      const hit = intersectRayWithPlaneZ(ray.origin, ray.direction, bankZ)
      if (!hit) {
        continue
      }

      minX = Math.min(minX, hit.x)
      maxX = Math.max(maxX, hit.x)
    }
  }

  const rippleMin = RIPPLE_WORLD_RECT.x
  const rippleMax = RIPPLE_WORLD_RECT.x + RIPPLE_WORLD_RECT.w
  const pad = 0.08

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return {
      minX: rippleMin + 0.04,
      maxX: rippleMax - 0.04,
    }
  }

  return {
    minX: Math.min(minX, rippleMin) - pad,
    maxX: Math.max(maxX, rippleMax) + pad,
  }
}
