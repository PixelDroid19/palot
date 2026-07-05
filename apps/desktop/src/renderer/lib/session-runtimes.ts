/**
 * Session runtimes Palot can start a conversation with.
 *
 * Palot treats OpenCode as one runtime among several rather than the only
 * backend. `opencode` is the built-in, always-available runtime whose rich
 * chat is driven by the OpenCode SDK; the others are coding-agent CLIs driven
 * headlessly through the agent runtime layer (see main/agents). This registry
 * is the single source of truth the New Session UI uses to offer a choice.
 */
import type { AgentRuntimeId } from "../../preload/api"

/** `opencode` plus every CLI runtime id. */
export type SessionRuntimeId = "opencode" | AgentRuntimeId

export interface SessionRuntimeMeta {
	id: SessionRuntimeId
	label: string
	/** True for the built-in OpenCode runtime; false for CLI-backed runtimes. */
	builtIn: boolean
}

export const SESSION_RUNTIMES: readonly SessionRuntimeMeta[] = [
	{ id: "opencode", label: "OpenCode", builtIn: true },
	{ id: "codex", label: "Codex", builtIn: false },
	{ id: "claude", label: "Claude Code", builtIn: false },
]

/** CLI runtime ids (everything except the built-in OpenCode runtime). */
export const CLI_RUNTIME_IDS: AgentRuntimeId[] = SESSION_RUNTIMES.filter(
	(r) => !r.builtIn,
).map((r) => r.id as AgentRuntimeId)

export function isCliRuntime(id: SessionRuntimeId): id is AgentRuntimeId {
	return id !== "opencode"
}

export function runtimeLabel(id: SessionRuntimeId): string {
	return SESSION_RUNTIMES.find((r) => r.id === id)?.label ?? id
}
