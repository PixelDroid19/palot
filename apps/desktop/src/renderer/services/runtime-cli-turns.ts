import type { AgentSandbox } from "../../preload/api"
import type { FileAttachment } from "../lib/types"
import { cancelCliTurn, consumeManagedRuntimeHandoff, runCliTurn } from "./cli-chat"
import { patchSessionRuntimeState } from "../lib/runtime-session-config"

/** Optional per-turn overrides applied to process-adapter session meta before send. */
export interface AgentHostTurnOptions {
	files?: FileAttachment[]
	modelSlug?: string
	effort?: string
	permissionMode?: AgentSandbox
	cwd?: string
}

export async function runCliRuntimeTurn(
	sessionId: string,
	text: string,
	filesOrOptions?: FileAttachment[] | AgentHostTurnOptions,
): Promise<void> {
	const options: AgentHostTurnOptions = Array.isArray(filesOrOptions)
		? { files: filesOrOptions }
		: (filesOrOptions ?? {})

	const patch: {
		model?: string
		effort?: string
		sandbox?: AgentSandbox
		cwd?: string
	} = {}
	if (options.modelSlug !== undefined) patch.model = options.modelSlug
	if (options.effort !== undefined) patch.effort = options.effort
	if (options.permissionMode !== undefined) patch.sandbox = options.permissionMode
	if (options.cwd !== undefined) patch.cwd = options.cwd
	if (Object.keys(patch).length > 0) {
		patchSessionRuntimeState(sessionId, patch)
	}

	await runCliTurn(sessionId, text, options.files)
}

export function interruptCliRuntimeTurn(sessionId: string): void {
	cancelCliTurn(sessionId)
}

/** Consume staged handoff for the next managed-server prompt. */
export function consumeRuntimeHandoff(sessionId: string): string | null {
	return consumeManagedRuntimeHandoff(sessionId)
}

/** @deprecated Use consumeRuntimeHandoff */
export const consumeCliToProjectRuntimeHandoff = consumeRuntimeHandoff
/** @deprecated Use consumeRuntimeHandoff */
export const consumeCliToManagedRuntimeHandoff = consumeRuntimeHandoff
