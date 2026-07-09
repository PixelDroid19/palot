/**
 * Agent-host process automation executors (Codex, Claude, and any future
 * process adapter registered on {@link AgentHost}).
 *
 * Uses the same AgentHost path as interactive CLI sessions — no OpenCode SDK.
 * Unattended runs auto-accept tool permissions (matching OpenCode allow-all
 * automation posture) and only auto-decline interactive questions. Effort /
 * sandbox come from the automation config; `execution.timeout` aborts the turn.
 */
import { createUuidV7 } from "../../shared/uuid"
import type { AgentPermissionDecision, AgentSandbox } from "@palot/agent-host"
import { createLogger } from "../logger"
import {
	answerAgentQuestion,
	closeAgentSession,
	getAgentHost,
	interruptAgent,
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

/** Default timeout (seconds) when config omits a positive timeout. */
export const AGENT_HOST_AUTOMATION_DEFAULT_TIMEOUT_SEC = 600

/**
 * Map permission preset → sandbox posture for process adapters.
 * Exported for unit tests of the shipped mapping.
 */
export function sandboxFromPreset(preset: PermissionPreset | undefined): AgentSandbox {
	switch (preset) {
		case "allow-all":
			return "danger-full-access"
		case "read-only":
			return "read-only"
		default:
			// "default" and unknown: allow workspace edits (unattended automations).
			return "workspace-write"
	}
}

/**
 * How unattended automation answers a tool-permission request.
 * - read-only → decline writes/side effects
 * - default / allow-all → accept (OpenCode automation allows tools unattended)
 *
 * Interactive questions are handled separately and always cleared empty.
 */
export function permissionDecisionForPreset(
	preset: PermissionPreset | undefined,
): AgentPermissionDecision {
	return preset === "read-only" ? "decline" : "accept"
}

/** Strip provider/ prefix from OpenCode-shaped model refs when present. */
export function modelSlugFromExecutionModel(model: string | undefined): string | undefined {
	if (!model) return undefined
	if (!model.includes("/")) return model
	return model.split("/").slice(1).join("/") || model
}

export function actionableFromMessage(message: string): boolean {
	const match = /Actionable:\s*(yes|no)/i.exec(message)
	if (match) return match[1].toLowerCase() === "yes"
	return message.trim().length > 40
}

export function timeoutMsFromConfig(timeoutSec: number | undefined): number {
	const sec =
		typeof timeoutSec === "number" && Number.isFinite(timeoutSec) && timeoutSec > 0
			? timeoutSec
			: AGENT_HOST_AUTOMATION_DEFAULT_TIMEOUT_SEC
	return Math.floor(sec * 1000)
}

/**
 * Race a turn against the automation timeout. On timeout, interrupt the session
 * and reject so the executor returns an error result (does not hang the scheduler).
 */
export async function runPromptWithTimeout(args: {
	sessionId: string
	timeoutMs: number
	prompt: () => Promise<{ message: string }>
	interrupt: (sessionId: string) => Promise<boolean>
}): Promise<{ message: string }> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			void args.interrupt(args.sessionId).catch(() => {})
			reject(new Error(`Automation timed out after ${args.timeoutMs}ms`))
		}, args.timeoutMs)
	})
	try {
		return await Promise.race([args.prompt(), timeoutPromise])
	} finally {
		if (timer) clearTimeout(timer)
	}
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
			const preset = config.execution.permissionPreset
			const toolDecision = permissionDecisionForPreset(preset)
			const sandbox = sandboxFromPreset(preset)

			// Unattended: accept tools (unless read-only); never block on questions.
			unsubs.push(
				host.events.on("session:update", (evt) => {
					if (evt.sessionId !== sessionId) return
					const update = evt.update
					if (update.kind === "permission") {
						respondAgentPermission(sessionId, update.request.requestId, toolDecision)
					}
					if (update.kind === "question") {
						// No human — clear the gate without inventing answers.
						answerAgentQuestion(sessionId, update.request.requestId, {})
					}
				}),
			)

			try {
				const model = modelSlugFromExecutionModel(config.execution.model)

				await openAgentSession(sessionId, runtimeId, {
					cwd: workspace,
					sandbox,
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

				const timeoutMs = timeoutMsFromConfig(config.execution.timeout)
				const result = await runPromptWithTimeout({
					sessionId,
					timeoutMs,
					interrupt: interruptAgent,
					prompt: () =>
						promptAgent(sessionId, {
							text: promptText,
							model,
							reasoningEffort: config.execution.effort,
							sandbox,
						}),
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
