/**
 * Framework-free chat turn runner for Lit surfaces.
 * Public API: runLitAgentTurn + respondLitPermission + answerLitQuestion.
 * Fail-closed when bridge/runtime unavailable (no offline echo).
 */
import { promptManagedSession } from "./managed-chat"
import { sessionStore } from "./session-store"

export interface LitPermissionRequest {
	requestId: string
	toolName?: string
	description?: string
}

export interface LitQuestionRequest {
	requestId: string
	questions: Array<{
		question: string
		header?: string
		options: Array<{ label: string; description?: string }>
		multiSelect?: boolean
	}>
}

export interface LitToolEvent {
	id: string
	name: string
	status: "running" | "completed" | "failed"
	detail?: string
}

export interface TurnHandlers {
	onAssistantDelta?: (text: string) => void
	onAssistantFinal?: (text: string) => void
	onPermission?: (request: LitPermissionRequest) => void
	onQuestion?: (request: LitQuestionRequest) => void
	onTool?: (tool: LitToolEvent) => void
	onError?: (message: string) => void
	onStatus?: (status: "running" | "idle" | "failed") => void
}

export type LitPermissionDecision = "allow" | "allow-session" | "allow-always" | "deny"

interface AgentSessionBridge {
	open: (
		sessionId: string,
		runtimeId: string,
		opts: {
			cwd: string
			sandbox?: string
			model?: string
			reasoningEffort?: string
		},
	) => Promise<{ threadId: string | null }>
	prompt: (
		sessionId: string,
		opts: { text: string; model?: string; sandbox?: string },
	) => Promise<{ message?: string; status?: string; error?: string }>
	onUpdate: (cb: (sessionId: string, update: Record<string, unknown>) => void) => () => void
	respondPermission: (
		sessionId: string,
		requestId: string,
		decision: string,
	) => Promise<boolean>
	answerQuestion?: (
		sessionId: string,
		requestId: string,
		answers: Record<string, string>,
	) => Promise<boolean>
}

function getBridge(): AgentSessionBridge | undefined {
	return (
		window as unknown as {
			gcode?: { agentSession?: AgentSessionBridge }
		}
	).gcode?.agentSession
}

/** Answer a pending permission from the Lit UI (public). */
export async function respondLitPermission(
	sessionId: string,
	requestId: string,
	decision: LitPermissionDecision,
): Promise<boolean> {
	const agent = getBridge()
	if (!agent) throw new Error("agentSession bridge is not available")
	return agent.respondPermission(sessionId, requestId, decision)
}

/** Answer a pending structured question from the Lit UI (public). */
export async function answerLitQuestion(
	sessionId: string,
	requestId: string,
	answers: Record<string, string>,
): Promise<boolean> {
	const agent = getBridge()
	if (!agent?.answerQuestion) throw new Error("answerQuestion is not available on this runtime")
	return agent.answerQuestion(sessionId, requestId, answers)
}

/**
 * Run one agent turn. Process runtimes use agentSession IPC;
 * OpenCode uses managed-chat (promptAsync). No silent offline success.
 */
export async function runLitAgentTurn(
	sessionId: string,
	text: string,
	handlers: TurnHandlers = {},
): Promise<string> {
	const meta = sessionStore.getMeta(sessionId)
	const runtimeId = meta?.runtimeId
	const cwd =
		meta?.cwd || sessionStore.list().find((s) => s.id === sessionId)?.directory || ""

	if (!runtimeId || runtimeId === "local" || runtimeId === "unknown") {
		const msg = "Session has no runtime. Create a session with Claude, Codex, or OpenCode."
		handlers.onError?.(msg)
		handlers.onStatus?.("failed")
		throw new Error(msg)
	}

	// Managed-server path (OpenCode)
	if (runtimeId === "opencode" || sessionId.startsWith("ses_")) {
		handlers.onStatus?.("running")
		try {
			await promptManagedSession(sessionId, text)
			handlers.onStatus?.("idle")
			handlers.onAssistantFinal?.("")
			return ""
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			handlers.onError?.(message)
			handlers.onStatus?.("failed")
			throw err
		}
	}

	const agent = getBridge()
	if (!agent) {
		const msg = "Desktop agentSession bridge is required for Claude/Codex turns."
		handlers.onError?.(msg)
		handlers.onStatus?.("failed")
		throw new Error(msg)
	}

	handlers.onStatus?.("running")
	let assistant = ""
	const unsub = agent.onUpdate((sid, update) => {
		if (sid !== sessionId) return
		const kind = String(update.kind || update.type || "")

		if (kind === "text-delta" || kind === "message-delta" || kind === "text") {
			const chunk = String(update.text || update.delta || "")
			if (chunk) {
				assistant += chunk
				handlers.onAssistantDelta?.(assistant)
			}
		}

		if (kind === "tool" || kind === "tool-start" || kind === "tool-end") {
			const id = String(update.id || update.toolCallId || `tool-${Date.now()}`)
			const name = String(update.name || update.toolName || update.tool || "tool")
			const statusRaw = String(update.status || "")
			const status: LitToolEvent["status"] =
				kind === "tool-end" || statusRaw === "completed" || statusRaw === "done"
					? "completed"
					: statusRaw === "failed" || statusRaw === "error"
						? "failed"
						: "running"
			handlers.onTool?.({
				id,
				name,
				status,
				detail: update.detail
					? String(update.detail)
					: update.input
						? JSON.stringify(update.input).slice(0, 200)
						: undefined,
			})
		}

		if (kind === "permission" && update.requestId) {
			// Do NOT auto-respond — UI must call respondLitPermission
			const req = (update.request as Record<string, unknown> | undefined) || update
			handlers.onPermission?.({
				requestId: String(update.requestId || req.requestId),
				toolName: String(req.toolName || req.name || update.toolName || "tool"),
				description: req.description
					? String(req.description)
					: update.description
						? String(update.description)
						: undefined,
			})
		}

		if (kind === "question" && update.requestId) {
			const req = (update.request as Record<string, unknown> | undefined) || update
			const questions = (req.questions as LitQuestionRequest["questions"]) || []
			handlers.onQuestion?.({
				requestId: String(update.requestId),
				questions,
			})
		}
	})

	try {
		await agent.open(sessionId, runtimeId, {
			cwd: cwd || ".",
			sandbox: meta?.sandbox || "workspace-write",
			model: meta?.model,
			reasoningEffort: meta?.effort,
		})
		const result = await agent.prompt(sessionId, {
			text,
			model: meta?.model,
			sandbox: meta?.sandbox || "workspace-write",
		})
		const finalText =
			(result?.message && String(result.message)) ||
			assistant ||
			(result?.error ? `Error: ${result.error}` : "")
		handlers.onAssistantFinal?.(finalText)
		handlers.onStatus?.("idle")
		return finalText
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		handlers.onError?.(message)
		handlers.onStatus?.("failed")
		throw err
	} finally {
		unsub()
	}
}
