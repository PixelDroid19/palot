/**
 * Public API for code shared across main, preload, and renderer.
 *
 * Import from `@desktop/shared` — avoid deep relative paths into `src/shared/*`.
 */

export * from "./log-context"
export * from "./message-utils"
export * from "./mock-mode-url"
export * from "./scale-limits"
export * from "./server-config"
export * from "./sse-coalescing"
export * from "./test-ids"
export * from "./window-chrome"