if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
}

await import("@zappar/msdf-generator/worker.js")
