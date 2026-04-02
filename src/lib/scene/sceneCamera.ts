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
  // AI: Phase C — cached to avoid Math.tan() in every render pass.
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
const VEGETATION_ANCHOR_HEIGHT = 0.09
export const VEGETATION_WORLD_Z = SHORELINE_WORLD_Z - 0.035

// ══════════════════════════════════════════════════════════════════
// PATCH: Retune camera and title hero framing for a more compact, city-pond read of the scene.
//
// Fix 1 — move title into the middle of the pond (not near the shore).
// Fix 2 — remove scroll-driven baseLift animation.
//
// Geometry context:
//   Camera z at scroll=0: ≈ +2.61
//   Shore z (SHORELINE_WORLD_Z): -0.95
//   Pond midpoint: (2.61 + (-0.95)) / 2 ≈ +0.83
//   → TITLE_WORLD_Z_NEAR = +0.35 places title in clear water, well in front of shore
//
// Width is scaled proportionally to maintain apparent screen size:
//   old: width=2.44 at depth=3.19 (2.61-(-0.58))
//   new: width=1.75 at depth=2.26 (2.61-0.35) → same angular size
// ══════════════════════════════════════════════════════════════════

// AI: title anchor — middle of the pond, between camera and shore.
// Camera z≈+2.61, shore z=-0.95 → z=+0.35 sits clearly over open water.
// Widths scaled to preserve apparent screen size at the new depth.
const TITLE_WORLD_Z_NEAR = 0.35
const TITLE_WORLD_Z_FAR = -0.20
const TITLE_WORLD_WIDTH_NEAR = 1.75
const TITLE_WORLD_WIDTH_FAR = 2.10

export const RIPPLE_WORLD_RECT: RippleWorldRect = {
  x: -2.15,
  z: SHORELINE_WORLD_Z,
  w: 4.3,
  depth: 3.15,
}

// AI: Phase 2 — named anchor for the world-space title billboard.
// Describes where the title billboard sits at scroll=0:
//   z: between camera (z≈+2.8) and shoreline (z=-0.95), close to shore side
//   y: just above water level (actual center y also depends on text aspect)
// computeTitleHeroState() uses TITLE_WORLD_Z_NEAR/FAR for scroll animation;
// HERO_TITLE_ANCHOR_Z is the scroll=0 reference used by intersectTitleAtlas
// in landscape.frag (same value as TITLE_WORLD_Z_NEAR).
// Ref: landscape.frag intersectTitleAtlas, HeroTitlePass.ts u_titleWorldCenter
export const HERO_TITLE_ANCHOR_Z = TITLE_WORLD_Z_NEAR   // -0.58
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

export function shorelineVegetationRootAtWorldX(worldX: number): Vec3 {
  return {
    x: worldX,
    y: shorelineHeightAtWorldX(worldX) - 0.006,
    z: VEGETATION_WORLD_Z,
  }
}

export function computeTitleHeroState(
  scroll: number,
  textAspect: number,
  uvRect = { x: 0, y: 0, w: 1, h: 1 }
): TitleHeroState {
  // AI: scroll is time-of-day; title position is fully fixed in world space.
  // No scroll-driven z-movement or width change — parallax comes from
  // the fixed camera observing a static world-space billboard.
  const width = TITLE_WORLD_WIDTH_NEAR
  const height = width * textAspect

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
  }
}

// AI: Phase 1.5 retunes the orbital framing from open-water scale toward a compact city-pond read: nearer opposite bank, lower eye height, less "sea horizon".
export function computeSceneCamera(
  scroll: number,
  width: number,
  height: number
): SceneCameraState {
  // AI: scroll drives time-of-day, not camera orbit.
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
  // AI: Phase C — tanHalfFovY cached here so passes don't call Math.tan() each frame.
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
  const tanHalfFovY = Math.tan(camera.fovY * 0.5)

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
  const tanHalfFovY = Math.tan(camera.fovY * 0.5)
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
