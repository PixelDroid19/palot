import { claudeAdapter } from "./claude-adapter"
import { codexAdapter } from "./codex-adapter"
import type { AgentAdapter, AgentRuntimeId } from "./types"

/** All agent runtimes Palot can drive headlessly, in display order. */
export const AGENT_ADAPTERS: readonly AgentAdapter[] = [codexAdapter, claudeAdapter]

export function getAgentAdapter(id: AgentRuntimeId): AgentAdapter | undefined {
	return AGENT_ADAPTERS.find((a) => a.id === id)
}
