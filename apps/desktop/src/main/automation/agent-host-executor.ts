/**
 * Agent-host process automation executors (Codex, Claude, and any future
 * process adapter registered on {@link AgentHost}).
 *
 * Uses the same AgentHost path as interactive CLI sessions — no OpenCode SDK.
 * Unattended runs auto-decline permission prompts and map effort/sandbox from
 * the automation config into neutral session options.
 */
import { createUuidV7 } from "../../shared/uuid"
import { createLogger } from "../logger"
import {
	answerAgentQuestion,
	closeAgentSession,
	getAgentHost,
	openAgentSession,
	promptAgent,
	respondAgentPermission,
} from "../agents/service"
import {
	type AutomationExecutionResult,
	type AutomationOnSessionCreated,
	type AutomationRuntimeExecutor,
	registerAutomationRuntimeExecutor,
} from "./runtime-executor"
import type { AutomationConfig, PermissionPreset } from "./types"

const log = createLogger("automation-agent-host")

function sandboxFromPreset(
	preset: PermissionPreset | undefined,
): "plan" | "read-only" | "workspace-write" | "danger-full-access" {
	switch (preset) {
		case "allow-all":
			return "danger-full-access"
		case "read-only":
			return "read-only"
		default:
			return "workspace-write"
	}
}

function actionableFromMessage(message: string): boolean {
	const match = /Actionable:\s*(yes|no)/i.exec(message)
	if (match) return match[1].toLowerCase() === "yes"
	// Heuristic: non-empty assistant answer counts as potentially actionable
	return message.trim().length > 40
}

/**
 * Build one process-adapter automation executor for a given agent-host runtimeId.
 */
export function createAgentHostAutomationExecutor(runtimeId: string): AutomationRuntimeExecutor {
	return {
		runtimeId,
		async execute(
			config: AutomationConfig & { id: string; prompt: string },
			workspace: string,
			onSessionCreated?: AutomationOnSessionCreated,
		): Promise<AutomationExecutionResult> {
			const sessionId = `auto-${runtimeId}-${createUuidV7()}`
			const host = getAgentHost()
			const unsubs: Array<() => void> = []

			// Auto-decline interactive gates — automations are unattended.
			unsubs.push(
				host.events.on("session:update", (evt) => {
					if (evt.sessionId !== sessionId) return
					const update = evt.update
					if (update.kind === "permission") {
						respondAgentPermission(sessionId, update.request.requestId, "decline")
					}
					if (update.kind === "question") {
						answerAgentQuestion(sessionId, update.request.requestId, {})
					}
				}),
			)

			try {
				const model =
					config.execution.model?.includes("/")
						? config.execution.model.split("/").slice(1).join("/") || config.execution.model
						: config.execution.model

				await openAgentSession(sessionId, runtimeId, {
					cwd: workspace,
					sandbox: sandboxFromPreset(config.execution.permissionPreset),
					model,
					reasoningEffort: config.execution.effort,
				})
				await onSessionCreated?.({ sessionId, worktreePath: null })

				const promptText = [
					config.prompt,
					"",
					"IMPORTANT: Do not ask questions. Complete the task autonomously.",
					"At the END of your response, include a line: `Actionable: yes` or `Actionable: no`.",
				].join("\n")

				const result = await promptAgent(sessionId, {
					text: promptText,
					model,
					reasoningEffort: config.execution.effort,
					sandbox: sandboxFromPreset(config.execution.permissionPreset),
				})

				const summary = result.message?.trim() ?? ""
				return {
					sessionId,
					worktreePath: null,
					title: config.name,
					summary,
					hasActionable: actionableFromMessage(summary),
					branch: null,
					error: null,
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				log.error("Agent-host automation failed", {
					runtimeId,
					automationId: config.id,
					workspace,
					error: message,
				})
				return {
					sessionId,
					worktreePath: null,
					title: config.name,
					summary: "",
					hasActionable: false,
					branch: null,
					error: message,
				}
			} finally {
				for (const off of unsubs) off()
				await closeAgentSession(sessionId).catch(() => {})
			}
		},
	}
}

/** Register process-adapter automation backends for built-in agent-host runtimes. */
export function registerBuiltInAgentHostAutomationExecutors(): void {
	for (const runtimeId of ["codex", "claude"] as const) {
		registerAutomationRuntimeExecutor(createAgentHostAutomationExecutor(runtimeId))
	}
}

// Side-effect registration when this module is imported from the automation index.
registerBuiltInAgentHostAutomationExecutors()
