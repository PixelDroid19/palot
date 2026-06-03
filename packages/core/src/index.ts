/**
 * @palot/core
 *
 * Pure TypeScript core for Palot agent platform.
 * Owns:
 * - canonical commands (PalotCommand)
 * - state reducers over PalotEvent (sessions+messages, permissions, questions,
 *   automations, settings, workspaces, provider connection, diffs)
 * - view model derivation functions (pure, no React)
 * - use cases (validation, resolution, command application helpers, prompt prep)
 * - CommandBus support via events reexport
 *
 * Forbidden in this package: React/Jotai/Lit/Electron/DOM/Node builtins/
 * window.palot / direct @opencode-ai/sdk.
 *
 * Consumers: adapters map to these, harness uses for determinism, UI hosts
 * subscribe to bus and derive view models or use use cases.
 *
 * See roadmap/core-agent-platform.md .
 */

// Re-export canonical event/command types for convenience (no duplication).
export type { Channel, EventEnvelope, PalotEvent } from "@palot/events"
export * from "./automations"
export type { PalotCommand } from "./commands"
export * from "./commands"
export * from "./events"
export * from "./provider-adapter"
export * from "./sessions"
export * from "./settings"
export * from "./state"
export * from "./use-cases"
export * from "./view-models"
export * from "./workspaces"
