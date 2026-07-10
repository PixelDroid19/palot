/**
 * Framework-free chat turn runner for Lit surfaces.
 * Public API: runLitAgentTurn + respondLitPermission + answerLitQuestion.
 * Fail-closed when bridge/runtime unavailable (no offline echo).
 */
import { loadRuntimeDescriptors } from "../lib/session-runtimes"
import { resolveRuntimeTransport } from "../lib/runtime-transport"
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
	close: (sessionId: string) => Promise<void>
	open: (
		sessionId: string,
		runtimeId: string,
		opts: {
			cwd: string
			sandbox?: string
			model?: string
			reasoningEffort?: string
			resumeId?: string
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

const HANDOFF_MAX_CHARS = 12_000

/** Build bounded transcript context owned by the Lit session store. */
export function buildLitConversationHandoff(sessionId: string): string {
	const turns = sessionStore
		.getMessages(sessionId)
		.map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text.trim()}`)
		.filter((turn) => turn.length > 0)
	let transcript = ""
	for (let index = turns.length - 1; index >= 0; index--) {
		const candidate = `${turns[index]}\n\n${transcript}`
		if (candidate.length > HANDOFF_MAX_CHARS) break
		transcript = candidate
	}
	return transcript.trim()
}

/**
 * Move a Lit session between process runtimes while retaining the visible
 * transcript and staging it for exactly one continuation turn.
 */
export async function switchLitRuntime(sessionId: string, runtimeId: string): Promise<void> {
	const meta = sessionStore.getMeta(sessionId)
	if (!meta || meta.runtimeId === runtimeId) return
	const bridge = getBridge()
	if (!bridge?.close) throw new Error("agentSession bridge is not available")
	const hasHistory = sessionStore.getMessages(sessionId).length > 0
	await bridge.close(sessionId)
	sessionStore.updateMeta(sessionId, {
		runtimeId,
		model: undefined,
		effort: undefined,
		threadId: null,
		handoff: hasHistory,
	})
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
 * Every runtime uses the agentSession bridge. The adapter owns its wire
 * protocol (ACP, app-server, SDK, ...); the Lit product surface does not
 * branch on provider names or legacy session-id shapes.
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

	const descriptors = await loadRuntimeDescriptors()
	const descriptor = descriptors.find((item) => item.id === runtimeId)
	if (descriptor && resolveRuntimeTransport(descriptor) !== "agent-host") {
		const msg = `Runtime ${runtimeId} requires an unsupported managed transport`
		handlers.onError?.(msg)
		handlers.onStatus?.("failed")
		throw new Error(msg)
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

		if (kind === "permission") {
			// AgentHost normalizes permission requests under `request`; accept the
			// legacy flat shape too so every adapter reaches the same Lit surface.
			const req = (update.request as Record<string, unknown> | undefined) || update
			if (!req.requestId) return
			// Do NOT auto-respond — UI must call respondLitPermission
			handlers.onPermission?.({
				requestId: String(req.requestId),
				toolName: String(req.toolName || req.name || update.toolName || "tool"),
				description: req.description
					? String(req.description)
					: update.description
						? String(update.description)
						: undefined,
			})
		}

		if (kind === "question") {
			const req = (update.request as Record<string, unknown> | undefined) || update
			if (!req.requestId) return
			const questions = (req.questions as LitQuestionRequest["questions"]) || []
			handlers.onQuestion?.({
				requestId: String(req.requestId),
				questions,
			})
		}
	})

	try {
		const opened = await agent.open(sessionId, runtimeId, {
			cwd: cwd || ".",
			sandbox: meta?.sandbox || "workspace-write",
			model: meta?.model,
			reasoningEffort: meta?.effort,
			resumeId: meta?.threadId || undefined,
		})
		if (opened.threadId && opened.threadId !== meta?.threadId) {
			sessionStore.updateMeta(sessionId, { threadId: opened.threadId })
		}
		let promptText = text
		if (meta?.handoff) {
			const history = buildLitConversationHandoff(sessionId)
			if (history) {
				promptText =
					"You are taking over an ongoing conversation from another coding agent. Conversation so far:\n\n" +
					`<conversation-history>\n${history}\n</conversation-history>\n\n` +
					`Continue seamlessly. The user's next message follows.\n\n${text}`
			}
			sessionStore.updateMeta(sessionId, { handoff: false })
		}
		const result = await agent.prompt(sessionId, {
			text: promptText,
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
