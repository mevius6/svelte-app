<script lang="ts">
  import { onMount } from "svelte"
  import { Renderer } from "$lib/render/Renderer"
  import {
    LandscapeScene,
    type PassDebugView,
    type SceneDebugState,
  } from "$lib/scene/LandscapeScene"

  export let projectName = "dummy"

  const isDev = import.meta.env.DEV

  let canvas: HTMLCanvasElement
  let renderer: Renderer | null = null
  let scene: LandscapeScene | null = null
  let passView: PassDebugView = "final"
  let landscapeMode: SceneDebugState["landscapeMode"] = "beauty"

  function applyDebugState() {
    scene?.setDebugState({
      passView,
      landscapeMode,
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

  onMount(() => {
    let cancelled = false

    ;(async () => {
      const nextRenderer = new Renderer(canvas)
      const nextScene = new LandscapeScene(nextRenderer.gl, projectName)

      renderer = nextRenderer
      scene = nextScene
      applyDebugState()

      try {
        // AI: keep LandscapeViewport as a thin scene host while Renderer + LandscapeScene own runtime orchestration.
        await nextRenderer.mount(nextScene)
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
      </select>
    </label>
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
    gap: 0.6rem;
    padding: 0.85rem;
    min-inline-size: 13rem;
    background: color-mix(in oklab, #091118 88%, #3b4f5d 12%);
    border: 1px solid color-mix(in oklab, #b9d0dc 22%, transparent);
    border-radius: 0.9rem;
    box-shadow: 0 18px 48px rgb(0 0 0 / 0.28);
    backdrop-filter: blur(14px);
  }

  .debug-field {
    display: grid;
    gap: 0.35rem;
    color: #e9f1f6;
    font: 600 0.74rem/1.2 "Input", "Input VF", monospace;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .debug-field select {
    padding: 0.58rem 0.7rem;
    color: #f4f8fb;
    background: rgb(255 255 255 / 0.06);
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 0.65rem;
    font: 500 0.9rem/1.2 "Input", "Input VF", monospace;
  }

  .debug-field select:disabled {
    opacity: 0.5;
  }
</style>
