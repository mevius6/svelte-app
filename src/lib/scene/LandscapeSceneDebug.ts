import type { LandscapeDebugMode } from "../passes/LandscapePass"
import { TITLE_GLOW_ENABLED } from "./sceneConfig"

export type PassDebugView = "final" | "ripple" | "landscape" | "vegetation" | "fog" | "glow"

export type SceneDebugState = {
  passView: PassDebugView
  landscapeMode: Exclude<LandscapeDebugMode, "ripple">
  glowEnabled: boolean
}

export const DEFAULT_SCENE_DEBUG_STATE: SceneDebugState = {
  passView: "final",
  landscapeMode: "beauty",
  glowEnabled: TITLE_GLOW_ENABLED,
}

export class LandscapeSceneDebugController {
  private current: SceneDebugState = { ...DEFAULT_SCENE_DEBUG_STATE }

  get state(): SceneDebugState {
    return this.current
  }

  setState(state: Partial<SceneDebugState>) {
    this.current = {
      ...this.current,
      ...state,
    }
  }
}
