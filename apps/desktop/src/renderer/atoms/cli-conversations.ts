/**
 * Persistent store for CLI-agent conversations (Codex, Claude Code, …).
 *
 * OpenCode sessions live on the OpenCode server; CLI runtimes have no such
 * store, so Palot persists their multi-turn conversations locally. The CLI's
 * own session id (`threadId`) is kept so resuming after a reload continues the
 * real CLI session, not just the visible transcript.
 */
import { atomWithStorage } from "jotai/utils"
import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"

export interface CliTurn {
	role: "user" | "agent"
	text: string
	notices?: string[]
	usage?: string
	error?: boolean
}

export interface CliConversation {
	id: string
	runtimeId: AgentRuntimeId
	cwd: string
	sandbox: AgentSandbox
	/** The CLI's own session id, used to resume and keep context across turns. */
	threadId: string | null
	turns: CliTurn[]
	/** Short title derived from the first user prompt. */
	title: string
	updatedAt: number
}

export const cliConversationsAtom = atomWithStorage<CliConversation[]>(
	"palot:cli-conversations",
	[],
)

/** Build a concise conversation title from its first user prompt. */
export function deriveTitle(prompt: string): string {
	const oneLine = prompt.replace(/\s+/g, " ").trim()
	return oneLine.length > 48 ? `${oneLine.slice(0, 48)}…` : oneLine || "New conversation"
}
