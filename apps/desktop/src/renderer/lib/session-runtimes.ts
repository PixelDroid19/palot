/**
 * Session runtimes Palot can start a conversation with. OpenCode is the
 * built-in runtime; the others are coding-agent CLIs that render in the same
 * chat view via a CLI-backed session. Single source of truth for the New
 * Session runtime picker.
 */
import type { AgentRuntimeId } from "../../preload/api"

export type SessionRuntimeId = "opencode" | AgentRuntimeId

export interface SessionRuntimeMeta {
	id: SessionRuntimeId
	label: string
	builtIn: boolean
}

export const SESSION_RUNTIMES: readonly SessionRuntimeMeta[] = [
	{ id: "opencode", label: "OpenCode", builtIn: true },
	{ id: "codex", label: "Codex", builtIn: false },
	{ id: "claude", label: "Claude Code", builtIn: false },
]

export const CLI_RUNTIME_IDS: AgentRuntimeId[] = SESSION_RUNTIMES.filter((r) => !r.builtIn).map(
	(r) => r.id as AgentRuntimeId,
)

export function isCliRuntime(id: SessionRuntimeId): id is AgentRuntimeId {
	return id !== "opencode"
}
