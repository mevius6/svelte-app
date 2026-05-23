<script lang="ts">
  import { onMount } from "svelte"
  import { Renderer } from "$lib/render/Renderer"
  import {
    LandscapeScene,
    type PassDebugView,
    type SceneDebugState,
  } from "$lib/scene/LandscapeScene"

  export let projectName = "Чистые пруды"

  const isDev = import.meta.env.DEV

  let canvas: HTMLCanvasElement
  let renderer: Renderer | null = null
  let scene: LandscapeScene | null = null
  let passView: PassDebugView = "final"
  let landscapeMode: SceneDebugState["landscapeMode"] = "beauty"
  let glowEnabled: SceneDebugState["glowEnabled"] = true
  let fps = 0

  function applyDebugState() {
    scene?.setDebugState({
      passView,
      landscapeMode,
      glowEnabled,
    })
  }

  function handlePassChange(event: Event) {
    const nextValue = (event.currentTarget as HTMLSelectElement).value as PassDebugView
    passView = nextValue
    applyDebugState()
  }

  function handleLandscapeModeChange(event: Event) {
    const nextValue = (event.currentTarget as HTMLSelectElement).value as SceneDebugState["landscapeMode"]
    landscapeMode = nextValue
    applyDebugState()
  }

  function handleGlowEnabledChange(event: Event) {
    glowEnabled = (event.currentTarget as HTMLInputElement).checked
    applyDebugState()
  }

  onMount(() => {
    let cancelled = false
    let fpsInterval: NodeJS.Timeout | null = null

    ;(async () => {
      const nextRenderer = new Renderer(canvas)
      const nextScene = new LandscapeScene(nextRenderer.gl, projectName)

      renderer = nextRenderer
      scene = nextScene
      applyDebugState()

      try {
        // AI: keep LandscapeViewport as a thin scene host while Renderer + LandscapeScene own runtime orchestration.
        await nextRenderer.mount(nextScene)

        // Start FPS polling (update every 200ms for smooth display)
        if (!cancelled && isDev) {
          fpsInterval = setInterval(() => {
            fps = nextRenderer.getFPS()
          }, 200)
        }
      } catch (error) {
        console.error("LandscapeViewport: failed to initialize scene", error)

        if (!cancelled) {
          nextRenderer.dispose()
          renderer = null
          scene = null
        }
      }
    })()

    return () => {
      cancelled = true
      if (fpsInterval) {
        clearInterval(fpsInterval)
        fpsInterval = null
      }
      renderer?.dispose()
      renderer = null
      scene = null
    }
  })
</script>

<canvas bind:this={canvas} class="landscape-viewport-canvas"></canvas>

{#if isDev}
  <div class="debug-panel">
    <label class="debug-field">
      <span>Pass</span>
      <select value={passView} on:change={handlePassChange}>
        <option value="final">Final</option>
        <option value="ripple">Ripple</option>
        <option value="landscape">Landscape</option>
        <option value="vegetation">Vegetation</option>
        <option value="fog">Fog</option>
        <option value="glow">Glow</option>
      </select>
    </label>

    <label class="debug-field">
      <span>Landscape</span>
      <select
        value={landscapeMode}
        on:change={handleLandscapeModeChange}
        disabled={passView !== "landscape"}
      >
        <option value="beauty">Beauty</option>
        <option value="normals">Normals</option>
        <option value="reflection">Reflection</option>
        <option value="waveLod">Wave LOD</option>
      </select>
    </label>

    <label class="debug-field debug-toggle">
      <span>Title Glow</span>
      <input
        type="checkbox"
        checked={glowEnabled}
        on:change={handleGlowEnabledChange}
      />
    </label>

    <div class="debug-field debug-fps">
      <span>FPS</span>
      <span class="fps-value">{fps}</span>
    </div>
  </div>
{/if}

<style>
  .landscape-viewport-canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }

  .debug-panel {
    position: fixed;
    inset-block-start: 1rem;
    inset-inline-end: 1rem;
    z-index: 90;
    display: grid;
    gap: 2ch;
    padding: 0.85rem;
    min-inline-size: 13rem;
    background-color: color-mix(
      in oklab,
      #091118 88%,
      #3b4f5d 12%
    );
    border: 1px solid color-mix(
      in oklab,
      #b9d0dc 22%,
      #0000
    );
    border-radius: 0.9rem;
    box-shadow: 0 18px 48px rgb(0 0 0 / 0.28);
    backdrop-filter: blur(14px);
  }

  .debug-field {
    display: grid;
    gap: 1ch;
    color: #e9f1f6;
    font: 600 0.74rem/1.2 "input", monospace;
    font-variation-settings: "SRIF" 1, "MONO" 1;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .debug-field select {
    padding: 0.5rlh 1ch;
    color: #f4f8fb;
    background-color: rgb(255 255 255 / 0.06);
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 0.65rem;
    font: 500 0.9rem/1.2 "input", monospace;
    font-variation-settings: "SRIF" 1, "MONO" 1;
  }

  .debug-field select:disabled {
    opacity: 0.5;
  }

  .debug-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .debug-toggle input {
    inline-size: 1.1rem;
    block-size: 1.1rem;
    accent-color: #c9f08a;
  }

  .debug-fps {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .fps-value {
    font-weight: 700;
    color: #c9f08a;
    font-variant-numeric: tabular-nums;
  }
</style>
