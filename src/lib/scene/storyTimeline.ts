export type StoryFrame = {
  storyProgress: number
  sectionIndex: number
  sectionProgress: number
  shotProgress: number
  sectionCount: number
  timeOfDayPhase: number
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

export function computeStoryFrame(storyProgress: number, sectionCount: number): StoryFrame {
  const progress = clamp01(storyProgress)
  const count = Math.max(0, Math.floor(sectionCount))

  if (count <= 0) {
    return {
      storyProgress: progress,
      sectionIndex: 0,
      sectionProgress: 0,
      shotProgress: 0,
      sectionCount: 0,
      timeOfDayPhase: progress,
    }
  }

  const sectionSpan = 1 / count
  const sectionIndex = Math.min(Math.floor(progress / sectionSpan), count - 1)
  const sectionStart = sectionIndex * sectionSpan
  const sectionProgress = clamp01((progress - sectionStart) / sectionSpan)
  const shotProgress = sectionProgress

  return {
    storyProgress: progress,
    sectionIndex,
    sectionProgress,
    shotProgress,
    sectionCount: count,
    // Phase 6 keeps time-of-day identity-mapped for now. Future camera/story pacing
    // can change this here without touching shader consumers.
    timeOfDayPhase: progress,
  }
}
