/**
 * Neutral automation runtime executor contract.
 *
 * Product automation must not call the OpenCode SDK (or any provider SDK) at
 * the top level. Register one {@link AutomationRuntimeExecutor} per runtime;
 * `executeAutomationRun` dispatches by runtimeId (default: OpenCode adapter).
 */
import type { AutomationConfig } from "./types"

export interface AutomationExecutionResult {
	sessionId: string
	worktreePath: string | null
	title: string
	summary: string
	hasActionable: boolean
	branch: string | null
	error: string | null
}

export type AutomationOnSessionCreated = (info: {
	sessionId: string
	worktreePath: string | null
}) => void | Promise<void>

export interface AutomationRunRequest {
	runtimeId: string
	config: AutomationConfig & { id: string; prompt: string }
	workspace: string
	onSessionCreated?: AutomationOnSessionCreated
}

/**
 * One concrete automation backend (OpenCode managed-server, future Codex, …).
 * Adapters own provider SDKs; this interface stays neutral.
 */
export interface AutomationRuntimeExecutor {
	readonly runtimeId: string
	execute(
		config: AutomationConfig & { id: string; prompt: string },
		workspace: string,
		onSessionCreated?: AutomationOnSessionCreated,
	): Promise<AutomationExecutionResult>
}

const executors = new Map<string, AutomationRuntimeExecutor>()

export function registerAutomationRuntimeExecutor(executor: AutomationRuntimeExecutor): void {
	executors.set(executor.runtimeId, executor)
}

export function getAutomationRuntimeExecutor(
	runtimeId: string,
): AutomationRuntimeExecutor | undefined {
	return executors.get(runtimeId)
}

export function listAutomationRuntimeExecutors(): AutomationRuntimeExecutor[] {
	return [...executors.values()]
}

/**
 * Neutral automation entry point. Selects executor by runtimeId; falls back to
 * the OpenCode adapter when unspecified (current automation configs are
 * OpenCode-shaped until multi-runtime automation config lands).
 */
export async function executeAutomationRun(
	request: AutomationRunRequest,
): Promise<AutomationExecutionResult> {
	const runtimeId = request.runtimeId || "opencode"
	const executor = executors.get(runtimeId) ?? executors.get("opencode")
	if (!executor) {
		return {
			sessionId: "",
			worktreePath: null,
			title: request.config.name,
			summary: "",
			hasActionable: false,
			branch: null,
			error: `No automation executor registered for runtime "${runtimeId}"`,
		}
	}
	return executor.execute(request.config, request.workspace, request.onSessionCreated)
}
