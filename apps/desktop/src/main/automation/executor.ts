/**
 * Neutral desktop automation entrypoint.
 *
 * All built-in CLI runtimes, including OpenCode through ACP, execute through
 * the agent-host executor. Provider SDKs and server lifecycles do not belong
 * in this product-facing module.
 */
import type { AutomationConfig } from "./types"
import {
	type AutomationExecutionResult,
	type AutomationOnSessionCreated,
	clearAutomationRuntimeExecutors,
	executeAutomationRun,
	resolveDefaultAutomationRuntimeId,
} from "./runtime-executor"
import { registerBuiltInAgentHostAutomationExecutors } from "./agent-host-executor"
import { resolveProcessAutomationIds } from "../agents/composition"

export type { AutomationExecutionResult as ExecutionResult, AutomationOnSessionCreated as OnSessionCreated }
export { executeAutomationRun }

let automationComposed = false

/**
 * Register only process/agent-host automation executors. This is idempotent
 * until force=true (tests or composition changes).
 */
export function composeAutomationExecutors(force = false): void {
	if (automationComposed && !force) return
	if (force) clearAutomationRuntimeExecutors()
	automationComposed = true
	registerBuiltInAgentHostAutomationExecutors(resolveProcessAutomationIds())
}

/** Dispatch an automation through the neutral runtime registry. */
export async function executeRun(
	config: AutomationConfig & { id: string; prompt: string },
	workspace: string,
	onSessionCreated?: AutomationOnSessionCreated,
): Promise<AutomationExecutionResult> {
	composeAutomationExecutors()
	return executeAutomationRun({
		runtimeId: config.runtimeId?.trim() ? config.runtimeId : (resolveDefaultAutomationRuntimeId() ?? ""),
		config,
		workspace,
		onSessionCreated,
	})
}
