#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { PNG } from "pngjs"
import { MSDF } from "@zappar/msdf-generator"

if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
}

const DEFAULT_TEXT = "ЧИСТЫЕ ПРУДЫ"
const DEFAULT_FONT_PATH = "src/fonts/RoslindaleCyrillic-DisplayCondensedBlack.otf"
const DEFAULT_OUTPUT_DIR = "static/hero-title"
const DEFAULT_BASENAME = "roslindale-msdf"
const DEFAULT_TEXTURE_SIZE = [1024, 512]
const DEFAULT_FONT_SIZE = 96
const DEFAULT_FIELD_RANGE = 4
const DEFAULT_PADDING = 2

function parseArgs(argv) {
  const options = {
    text: DEFAULT_TEXT,
    fontPath: DEFAULT_FONT_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    basename: DEFAULT_BASENAME,
    textureSize: DEFAULT_TEXTURE_SIZE,
    fontSize: DEFAULT_FONT_SIZE,
    fieldRange: DEFAULT_FIELD_RANGE,
    padding: DEFAULT_PADDING,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (arg === "--text" && next) {
      options.text = next
      i += 1
      continue
    }
    if (arg === "--font" && next) {
      options.fontPath = next
      i += 1
      continue
    }
    if (arg === "--out-dir" && next) {
      options.outputDir = next
      i += 1
      continue
    }
    if (arg === "--basename" && next) {
      options.basename = next
      i += 1
      continue
    }
    if (arg === "--font-size" && next) {
      options.fontSize = Number.parseInt(next, 10) || DEFAULT_FONT_SIZE
      i += 1
      continue
    }
    if (arg === "--field-range" && next) {
      options.fieldRange = Number.parseFloat(next) || DEFAULT_FIELD_RANGE
      i += 1
      continue
    }
    if (arg === "--padding" && next) {
      options.padding = Number.parseInt(next, 10) || DEFAULT_PADDING
      i += 1
      continue
    }
    if (arg === "--texture-size" && next) {
      const [w, h] = next.split("x").map((value) => Number.parseInt(value, 10))
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        options.textureSize = [w, h]
      }
      i += 1
      continue
    }
  }

  return options
}

function uniqueCharset(text) {
  return Array.from(new Set(Array.from(text.toUpperCase()))).join("")
}

function codePointOf(char) {
  const codePoint = char.codePointAt(0)
  if (codePoint == null) {
    throw new Error(`Failed to resolve code point for character: ${char}`)
  }
  return codePoint
}

function normalizeAtlasJson(atlas, imageName, text) {
  return {
    generator: {
      tool: "@zappar/msdf-generator",
      format: "normalized-msdf-atlas",
      text,
    },
    atlas: {
      type: "msdf",
      width: atlas.textureSize[0],
      height: atlas.textureSize[1],
      size: atlas.metrics.emSize,
      distanceRange: atlas.fieldRange,
      image: imageName,
    },
    metrics: {
      lineHeight: atlas.metrics.lineHeight,
      ascender: atlas.metrics.ascender,
      descender: atlas.metrics.descender,
    },
    glyphs: atlas.glyphs.map((glyph) => ({
      unicode: glyph.unicode,
      advance: glyph.advance,
      planeBounds: glyph.bounds
        ? {
            left: glyph.bounds.left,
            bottom: glyph.bounds.bottom,
            right: glyph.bounds.right,
            top: glyph.bounds.top,
          }
        : null,
      atlasBounds: {
        left: glyph.atlasPosition[0],
        bottom: glyph.atlasPosition[1],
        right: glyph.atlasPosition[0] + glyph.atlasSize[0],
        top: glyph.atlasPosition[1] + glyph.atlasSize[1],
      },
    })),
    kerning: atlas.kerning.map((pair) => ({
      unicode1: codePointOf(pair.first),
      unicode2: codePointOf(pair.second),
      advance: pair.amount,
    })),
  }
}

async function writeAtlasPng(imageData, outputPath) {
  const png = new PNG({
    width: imageData.width,
    height: imageData.height,
  })

  png.data = Buffer.from(imageData.data)

  const buffer = PNG.sync.write(png, {
    colorType: 6,
    inputColorType: 6,
  })
  await writeFile(outputPath, buffer)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()
  const fontPath = path.resolve(cwd, options.fontPath)
  const outputDir = path.resolve(cwd, options.outputDir)
  const imageName = `${options.basename}.png`
  const jsonName = `${options.basename}.json`
  const imagePath = path.join(outputDir, imageName)
  const jsonPath = path.join(outputDir, jsonName)
  const charset = uniqueCharset(options.text)
  const workerUrl = new URL("./hero-title-msdf-worker.mjs", import.meta.url).href
  const wasmUrl = new URL(
    "../node_modules/@zappar/msdf-generator/dist/msdfgen_wasm.wasm",
    import.meta.url
  ).href

  await mkdir(outputDir, { recursive: true })

  const fontBuffer = new Uint8Array(await readFile(fontPath))
  const msdf = new MSDF({ workerUrl, wasmUrl })

  console.log(`Generating hero title atlas for "${options.text}"`)
  console.log(`Font: ${path.relative(cwd, fontPath)}`)
  console.log(`Charset: ${charset}`)

  try {
    await msdf.initialize()
    const atlas = await msdf.generateAtlas({
      font: fontBuffer,
      charset,
      fontSize: options.fontSize,
      textureSize: options.textureSize,
      fieldRange: options.fieldRange,
      padding: options.padding,
      fixOverlaps: true,
    })

    await writeAtlasPng(atlas.texture, imagePath)
    const json = normalizeAtlasJson(atlas, imageName, options.text)
    await writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8")

    console.log(`Wrote ${path.relative(cwd, imagePath)}`)
    console.log(`Wrote ${path.relative(cwd, jsonPath)}`)
  } finally {
    await msdf.dispose()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
