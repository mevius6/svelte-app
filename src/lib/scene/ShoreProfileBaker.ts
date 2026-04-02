/**
 * shoreProfileBaker.ts
 *
 * AI: Phase A optimisation — bake shore silhouette + bank/shelf noise into a
 * 512×1 RGBA32F texture at startup. Replaces per-pixel 5-octave shoreFbm calls
 * in landscape.frag (≈ 90+ vnoise invocations per water-pixel → 1 texture fetch).
 *
 * Texture layout (worldX → u = clamp(worldX * 0.16 + 0.5, 0, 1)):
 *   R : baselineSilhouette(u)  — shore profile    [~.518..0.586]
 *   G : bankNoise              — bankMaterialBase [0..~0.94]
 *   B : shelfNoiseSrc          — underwaterShelf  [0..~0.94] (offset -0.5 in shader)
 *   A : 1.0                    — unused
 *
 * CPU math mirrors the GLSL functions in landscape.frag exactly.
 * Uses the same seed constants so results are bit-for-bit identical.
 *
 * Ref: IQ "Terrain" — envelope * fbm; GPU Gems 3 ch.1 Procedural Terrains
 */

const SHORE_SIZE = 512

// ── CPU-side noise — mirrors landscape.frag vnoise/hash ──────────

function fract(x: number): number {
  return x - Math.floor(x)
}

function hash2(px: number, py: number): number {
  let fx = fract(px * 127.1)
  let fy = fract(py * 311.7)
  const d = fx * (fx + 74.51) + fy * (fy + 74.51)
  fx += d
  fy += d
  return fract(fx * fy)
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fract(x)
  const fy = fract(y)
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return (
    (hash2(ix, iy) * (1 - ux) + hash2(ix + 1, iy) * ux) * (1 - uy) +
    (hash2(ix, iy + 1) * (1 - ux) + hash2(ix + 1, iy + 1) * ux) * uy
  )
}

/** 1-D profile via 2-D value noise — identical to shoreFbm() in landscape.frag */
function shoreFbm(x: number, seedY: number): number {
  let v = 0.0
  let a = 0.5
  let p = x
  for (let i = 0; i < 5; i++) {
    v += a * vnoise(p, seedY)
    p *= 2.3
    a *= 0.48
  }
  return v // [0..~0.94]
}

// ── Baked quantities ─────────────────────────────────────────────

/**
 * baselineSilhouette(u) — shore profile at normalised x ∈ [0,1].
 * Mirrors the GLSL function exactly: seeds 55.5 (large), 88.2 (detail).
 */
function baselineSilhouette(u: number): number {
  const hLarge  = shoreFbm(u * 4.2,  55.5) * 0.052
  const hDetail = shoreFbm(u * 16.0, 88.2) * 0.016
  return 0.500 + 0.018 + hLarge + hDetail
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Generates and uploads the 512×1 shore-profile texture.
 * Call once during LandscapeResources.load().
 *
 * Requires gl to be a WebGL2 context. RGBA32F is available in WebGL2
 * for sampling without any extension (EXT_color_buffer_float is only
 * needed when using the texture as an FBO attachment).
 */
export function createShoreProfileTexture(
  gl: WebGL2RenderingContext
): WebGLTexture | null {
  const data = new Float32Array(SHORE_SIZE * 4)

  for (let i = 0; i < SHORE_SIZE; i++) {
    const u = i / (SHORE_SIZE - 1)
    // World-space X corresponding to this UV sample
    // Inverse of: u = clamp(worldX * 0.16 + 0.5, 0, 1)
    const worldX = (u - 0.5) / 0.16

    // R — baseline silhouette (shore profile, range ≈ 0.518..0.586)
    data[i * 4 + 0] = baselineSilhouette(u)

    // G — bank surface noise  (bankMaterialBase: shoreFbm(worldX*1.35+17, 61.7))
    data[i * 4 + 1] = shoreFbm(worldX * 1.35 + 17.0, 61.7)

    // B — underwater shelf noise (underwaterShelf: shoreFbm(worldX*0.95+21, 47.3))
    // Stored raw; shader applies (b - 0.5) * 0.006
    data[i * 4 + 2] = shoreFbm(worldX * 0.95 + 21.0, 47.3)

    data[i * 4 + 3] = 1.0
  }

  const tex = gl.createTexture()
  if (!tex) return null

  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(
    gl.TEXTURE_2D, 0,
    gl.RGBA32F, // float precision — range fits without normalisation
    SHORE_SIZE, 1, 0,
    gl.RGBA, gl.FLOAT,
    data
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindTexture(gl.TEXTURE_2D, null)

  return tex
}
