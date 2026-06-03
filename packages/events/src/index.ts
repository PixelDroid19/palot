/**
 * @palot/events
 *
 * Canonical event bus, channels, PalotEvent types, and replay utilities.
 * This is the spine of the platform: providers emit PalotEvents on channels;
 * core owns reducers over them; everything else (UI view-models, automations,
 * harness, IPC) subscribes or replays.
 *
 * No React, no Jotai, no provider SDKs, no Electron, no DOM, no Node builtins.
 *
 * See roadmap/core-agent-platform.md for the full contract.
 */

export * from "./channels"
export * from "./event-bus"
export * from "./event-types"
export * from "./replay"
