/**
 * Session runtimes Palot can start a conversation with. OpenCode is the
 * built-in runtime; the others are coding-agent CLIs that render in the same
 * chat view via a CLI-backed session.
 *
 * Each CLI runtime declares its own selectable models (learned from synara's
 * per-provider model model): the model picker for a CLI session lists these,
 * never OpenCode's. An empty model slug means "use the CLI's configured
 * default".
 */
import type { AgentRuntimeId } from "../../preload/api"

export type SessionRuntimeId = "opencode" | AgentRuntimeId

export interface RuntimeModel {
	/** Value passed to the CLI's model flag; "" = the CLI's own default. */
	slug: string
	label: string
}

export interface SessionRuntimeMeta {
	id: SessionRuntimeId
	label: string
	builtIn: boolean
	/** Selectable models for a CLI runtime (first is the default choice). */
	models?: RuntimeModel[]
}

const DEFAULT_MODEL: RuntimeModel = { slug: "", label: "Default" }

export const SESSION_RUNTIMES: readonly SessionRuntimeMeta[] = [
	{ id: "opencode", label: "OpenCode", builtIn: true },
	{
		id: "codex",
		label: "Codex",
		builtIn: false,
		models: [
			DEFAULT_MODEL,
			{ slug: "gpt-5.5", label: "GPT-5.5" },
			{ slug: "gpt-5.4", label: "GPT-5.4" },
			{ slug: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
			{ slug: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
		],
	},
	{
		id: "claude",
		label: "Claude Code",
		builtIn: false,
		// Claude accepts short aliases for the latest model of each family.
		models: [
			DEFAULT_MODEL,
			{ slug: "opus", label: "Opus" },
			{ slug: "sonnet", label: "Sonnet" },
			{ slug: "haiku", label: "Haiku" },
		],
	},
]

export const CLI_RUNTIME_IDS: AgentRuntimeId[] = SESSION_RUNTIMES.filter((r) => !r.builtIn).map(
	(r) => r.id as AgentRuntimeId,
)

export function isCliRuntime(id: SessionRuntimeId): id is AgentRuntimeId {
	return id !== "opencode"
}

export function runtimeModels(id: SessionRuntimeId): RuntimeModel[] {
	return SESSION_RUNTIMES.find((r) => r.id === id)?.models ?? []
}
