import type { CliAdapter, CliId } from "../types"
import { claudeAdapter } from "./claude"
import { codexAdapter } from "./codex"
import { cursorAdapter } from "./cursor"
import { geminiAdapter } from "./gemini"
import { opencodeAdapter } from "./opencode"

export { claudeAdapter } from "./claude"
export { codexAdapter } from "./codex"
export { cursorAdapter } from "./cursor"
export { geminiAdapter } from "./gemini"
export { opencodeAdapter } from "./opencode"

/** All known coding-agent CLI adapters, in display order. */
export const ADAPTERS: readonly CliAdapter[] = [
	opencodeAdapter,
	claudeAdapter,
	codexAdapter,
	cursorAdapter,
	geminiAdapter,
]

/** Look up an adapter by id. */
export function getAdapter(id: CliId): CliAdapter | undefined {
	return ADAPTERS.find((a) => a.id === id)
}
