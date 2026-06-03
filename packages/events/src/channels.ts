/**
 * Canonical Palot pub/sub channels.
 *
 * These are the contract between providers (adapters), core reducers, UI (via view
 * models or host adapters), harness, automations, and IPC.
 *
 * Providers publish facts on these channels. Consumers subscribe by channel for
 * targeted updates (e.g. only session.messages for chat streaming).
 *
 * Matches the platform recommendations in roadmap/core-agent-platform.md and
 * roadmap/agent.md (all 11 channels).
 *
 * @example
 * import { CHANNELS, type Channel } from "@palot/events"
 * bus.subscribe(CHANNELS.SESSION_MESSAGES, handler)
 * bus.publish(CHANNELS.SESSION_DIFF, diffEvent)
 */

export const CHANNELS = {
	/** App bootstrap, shutdown, provider selection at top level. */
	APP_LIFECYCLE: "app.lifecycle",
	/** Provider (OpenCode, harness, etc) connect/disconnect health. */
	PROVIDER_CONNECTION: "provider.connection",
	/** Workspace/project discovery results. */
	WORKSPACE_DISCOVERY: "workspace.discovery",
	/** Session create/update/delete/status. */
	SESSION_LIFECYCLE: "session.lifecycle",
	/** Message and part upserts/deltas/removals (high volume). */
	SESSION_MESSAGES: "session.messages",
	/** Tool permission requests and resolutions. */
	SESSION_PERMISSIONS: "session.permissions",
	/** Clarifying question requests and replies. */
	SESSION_QUESTIONS: "session.questions",
	/** File diffs/patches produced by agent work. */
	SESSION_DIFF: "session.diff",
	/** Automation run lifecycle updates. */
	AUTOMATION_RUNS: "automation.runs",
	/** Settings changed (user or automation). */
	SETTINGS_CHANGED: "settings.changed",
	/** Navigation intent (for shell routing, not core state). */
	UI_NAVIGATION: "ui.navigation",
} as const

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS]

/** Convenience list for iteration / validation. */
export const ALL_CHANNELS: Channel[] = Object.values(CHANNELS)
