<script>
  import { onMount } from 'svelte'
  import shaderSource from '$lib/shaders/landscape/_entry.frag?raw'

  onMount(() => {
    console.log('Landscape shader (_entry.frag) loaded')
    console.log('First 200 chars:', shaderSource.substring(0, 200))
  })
</script>

<div>
  <h1>Landscape Shader Modularization Test</h1>
  <p>Phase 5: Testing #include resolution with Vite plugin</p>
  <p>Check console for shader source</p>
  <pre>{shaderSource.substring(0, 500)}...</pre>
</div>

<style>
  pre {
    background: #f5f5f5;
    padding: 1rem;
    overflow: auto;
    max-height: 400px;
    font-size: 11px;
    border: 1px solid #ddd;
  }
</style>
