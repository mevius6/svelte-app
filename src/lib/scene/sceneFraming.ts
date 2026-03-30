export type SceneFrame = {
  scaleX: number
  scaleY: number
}

// Height-normalized scene framing for full-screen shaders:
// 1. center screen UV around 0.5 in shader;
// 2. keep Y stable, so one scene unit still matches viewport height;
// 3. scale only X by width / height, so resize changes horizontal span, not proportions.
//
// Shaders then remap with:
//   sceneUV = (screenUV - 0.5) * sceneScale + 0.5
//
// Ref: Xor, aspect-ratio fix:
// https://bsky.app/profile/xordev.com/post/3lwwjanmo222m
// Ref: GM Shaders Mini: Scaling
// https://mini.gmshaders.com/p/mistakes
// https://mini.gmshaders.com/p/gm-shaders-mini-scaling
export function computeSceneFrame(width: number, height: number): SceneFrame {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)

  return {
    // Wider screens reveal more world on X; portrait screens reveal less.
    scaleX: safeWidth / safeHeight,
    // Y stays fixed to avoid vertical squashing/stretching of the composition.
    scaleY: 1,
  }
}

// TODO: возможно, эти значения импортируются/настраиваются в другом месте.
export const POND_WATER_LEVEL = 0.0;
export const POND_WORLD_RECT = { minZ: -1.0, maxZ: 1.0 };
export function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

// HERO TITLE — world-space anchor inside the pond
// Текст расположен посреди пруда между камерой и берегом.
export const HERO_TITLE_ANCHOR = {
  x: 0.0,
  y: POND_WATER_LEVEL + 0.55,
  z: mix(POND_WORLD_RECT.minZ, POND_WORLD_RECT.maxZ, 0.45)
};
