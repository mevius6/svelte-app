import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { glslIncludePlugin } from './build/vite-glsl-include'

export default defineConfig({
  plugins: [glslIncludePlugin(), sveltekit()]
})
