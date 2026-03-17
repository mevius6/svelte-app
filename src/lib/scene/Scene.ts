export interface Scene {
  init(): void | Promise<void>
  resize(width: number, height: number): void
  update(dt: number): void
  render(time: number): void
  dispose(): void
}
