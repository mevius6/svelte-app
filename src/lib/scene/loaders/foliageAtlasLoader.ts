/**
 * Phase 3: Foliage atlas loader — extracted from LandscapeResources.
 * 
 * Responsible for loading individual PBR texture maps (albedo, alpha, normal, roughness, translucency)
 * and assembling them into a FoliageAtlasTextureSet for use in the BushesPass.
 */

export type FoliageAtlasSourceSet = {
  albedo: string
  alpha: string
  normal: string
  roughness: string
  translucency: string
}

export type FoliageAtlasTextureSet = {
  albedo: WebGLTexture | null
  alpha: WebGLTexture | null
  normal: WebGLTexture | null
  roughness: WebGLTexture | null
  translucency: WebGLTexture | null
}

/**
 * Load a foliage atlas texture set from URL sources.
 * Parallelizes all 5 texture loads.
 */
export async function loadFoliageAtlas(
  gl: WebGL2RenderingContext,
  sources: FoliageAtlasSourceSet
): Promise<FoliageAtlasTextureSet> {
  const [albedo, alpha, normal, roughness, translucency] = await Promise.all([
    loadTexture(gl, sources.albedo),
    loadTexture(gl, sources.alpha),
    loadTexture(gl, sources.normal),
    loadTexture(gl, sources.roughness),
    loadTexture(gl, sources.translucency),
  ])

  return {
    albedo,
    alpha,
    normal,
    roughness,
    translucency,
  }
}

/**
 * Load a single 2D texture from URL with linear interpolation, mipmaps, and edge clamp.
 * On error or missing image, returns null (graceful degradation).
 */
function loadTexture(gl: WebGL2RenderingContext, url: string): Promise<WebGLTexture | null> {
  return new Promise((resolve) => {
    const img = new Image()

    img.onload = () => {
      const tex = gl.createTexture()
      if (!tex) {
        resolve(null)
        return
      }

      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindTexture(gl.TEXTURE_2D, null)
      resolve(tex)
    }

    img.onerror = () => resolve(null)
    img.src = url
  })
}
