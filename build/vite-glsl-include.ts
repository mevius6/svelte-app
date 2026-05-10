import type { Plugin } from 'vite'
import { readFileSync } from 'fs'
import { dirname, resolve, isAbsolute } from 'path'

interface IncludeContext {
  visited: Set<string>
  stack: string[]
}

/**
 * Phase 5 Vite GLSL include plugin
 *
 * Recursively resolves #include directives in shader files.
 * - Fails fast with explicit throw on missing includes (better DX than silent failures)
 * - Tracks circular dependencies via visited set + stack
 * - Works with Vite query strings (?raw, etc)
 * - Only processes .frag, .vert, .glsl files
 */
export function glslIncludePlugin(): Plugin {
  return {
    name: 'vite-glsl-include',
    enforce: 'pre',

    load(id: string) {
      const cleanId = id.split('?')[0]
      const hasRawQuery = id.includes('?raw')

      if (!isShaderFile(cleanId)) return null

      // Only process if the file exists and is absolute path (from Rollup)
      if (!isAbsolute(cleanId)) return null

      try {
        const content = readFileSync(cleanId, 'utf-8')
        const hasInclude = content.includes('#include')

        let resolved = content
        if (hasInclude) {
          const context: IncludeContext = {
            visited: new Set(),
            stack: [],
          }
          resolved = resolveIncludes(content, dirname(cleanId), context, cleanId)
        }

        // If ?raw query, return as JavaScript export for Vite to handle
        if (hasRawQuery) {
          // Escape the shader code for JavaScript string
          const escaped = resolved
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
          return `export default "${escaped}";`
        }

        return resolved
      } catch (e) {
        this.error(`[glsl-include] Failed to process shader: ${cleanId}\n${String(e)}`)
        return null
      }
    },

    transform(code: string, id: string) {
      const cleanId = id.split('?')[0]
      if (!isShaderFile(cleanId) || !code.includes('#include')) return null

      try {
        const context: IncludeContext = { visited: new Set(), stack: [] }
        const resolved = resolveIncludes(code, dirname(cleanId), context, cleanId)
        return { code: resolved, map: null }
      } catch (e) {
        this.error(String(e))
      }
    },
  }
}

function isShaderFile(path: string): boolean {
  return path.endsWith('.glsl') || path.endsWith('.vert') || path.endsWith('.frag')
}

function resolveIncludes(
  content: string,
  baseDir: string,
  context: IncludeContext,
  sourceLabel = baseDir
): string {
  const lines = content.split('\n')

  return lines
    .map((line, lineNum) => {
      const match = line.match(/^\s*#include\s+["']([^"']+)["']\s*$/)
      if (!match) {
        return line
      }

      const includePath = match[1]
      const fullPath = resolve(baseDir, includePath)

      // Detect circular includes
      if (context.stack.includes(fullPath)) {
        const cycle = [...context.stack, fullPath].join(' -> ')
        throw new Error(
          `[glsl-include] Circular include detected:\n${cycle}\nfrom: ${sourceLabel}:${lineNum + 1}`
        )
      }

      // Prevent duplicate processing
      if (context.visited.has(fullPath)) {
        return `// [include ${includePath} already processed]`
      }

      try {
        const includedContent = readFileSync(fullPath, 'utf-8')
        context.visited.add(fullPath)
        context.stack.push(fullPath)

        const resolved = resolveIncludes(includedContent, dirname(fullPath), context, fullPath)

        context.stack.pop()
        return resolved
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            `[glsl-include] Include file not found: "${includePath}"\n` +
            `Resolved to: ${fullPath}\n` +
            `From: ${sourceLabel}:${lineNum + 1}`
          )
        }
        throw e
      }
    })
    .join('\n')
}
