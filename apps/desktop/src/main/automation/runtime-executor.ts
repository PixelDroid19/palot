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
 * Default runtime for legacy automation configs with no runtimeId:
 * prefer a registered "opencode" executor if present, else the first registered
 * executor — never invent a brand that is not registered.
 */
export function resolveDefaultAutomationRuntimeId(): string | null {
	if (executors.has("opencode")) return "opencode"
	const first = executors.keys().next()
	return first.done ? null : first.value
}

/**
 * Neutral automation entry point. Selects executor by runtimeId.
 *
 * - Omitted / empty runtimeId → {@link resolveDefaultAutomationRuntimeId}.
 * - Explicit runtimeId with no registered executor → **fail closed** (never
 *   silently run a different runtime's backend).
 */
export async function executeAutomationRun(
	request: AutomationRunRequest,
): Promise<AutomationExecutionResult> {
	const explicit = Boolean(request.runtimeId && request.runtimeId.trim())
	const runtimeId = explicit
		? request.runtimeId.trim()
		: (resolveDefaultAutomationRuntimeId() ?? "")
	const executor = runtimeId ? executors.get(runtimeId) : undefined
	if (!executor) {
		return {
			sessionId: "",
			worktreePath: null,
			title: request.config.name,
			summary: "",
			hasActionable: false,
			branch: null,
			error: runtimeId
				? `No automation executor registered for runtime "${runtimeId}"`
				: "No automation executor registered",
		}
	}
	return executor.execute(request.config, request.workspace, request.onSessionCreated)
}
