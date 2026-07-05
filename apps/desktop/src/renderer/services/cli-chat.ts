/**
 * Drives a CLI-backed chat session (Codex, Claude Code, …) into the SAME chat
 * view as OpenCode. It creates an SDK-shaped Session and, per turn, writes
 * SDK-shaped Message/Part objects into the shared Jotai atoms so the existing
 * ChatView renders it unchanged — no parallel UI. Prompts run through the
 * agent runtime layer in the main process, resuming the CLI's own session for
 * multi-turn context.
 */
import type { AgentRuntimeId, AgentSandbox, AgentUpdate } from "../../preload/api"
import { getCliMeta, patchCliMeta, setCliMeta } from "../atoms/cli-sessions"
import { upsertMessageAtom } from "../atoms/messages"
import { upsertPartAtom } from "../atoms/parts"
import {
	setSessionErrorAtom,
	setSessionStatusAtom,
	upsertSessionAtom,
} from "../atoms/sessions"
import { appStore } from "../atoms/store"
import { streamingVersionFamily } from "../atoms/streaming"
import { createLogger } from "../lib/logger"
import type { AssistantMessage, ReasoningPart, Session, TextPart, UserMessage } from "../lib/types"

const log = createLogger("cli-chat")

const RUNTIME_LABELS: Record<AgentRuntimeId, string> = {
	codex: "Codex",
	claude: "Claude Code",
}

const isElectron = typeof window !== "undefined" && "palot" in window

/** Maps an active session to its in-flight run id, so a turn can be cancelled. */
const activeRuns = new Map<string, string>()

/** Force the active session's chat view to recompute (mirrors the SSE path). */
function bump(sessionId: string) {
	appStore.set(streamingVersionFamily(sessionId), (v) => v + 1)
}

/**
 * Create a CLI-backed session and register it. Returns the new session id.
 * The session appears in the sidebar and opens in the standard chat view.
 */
export function createCliSession(args: {
	directory: string
	runtimeId: AgentRuntimeId
	sandbox: AgentSandbox
	model?: string
}): string {
	const sessionId = crypto.randomUUID()
	const session: Session = {
		id: sessionId,
		title: `${RUNTIME_LABELS[args.runtimeId]} session`,
		directory: args.directory,
		time: { created: Date.now() },
	} as Session
	appStore.set(upsertSessionAtom, { session, directory: args.directory })
	setCliMeta(sessionId, {
		runtimeId: args.runtimeId,
		cwd: args.directory,
		sandbox: args.sandbox,
		model: args.model || undefined,
		threadId: null,
	})
	log.info("Created CLI session", { sessionId, runtime: args.runtimeId })
	return sessionId
}

/**
 * Run one conversation turn: write the user message, then stream the CLI's
 * response into the shared atoms as an assistant message. Resumes the CLI's
 * session so context carries across turns.
 */
export async function runCliTurn(sessionId: string, text: string): Promise<void> {
	const meta = getCliMeta(sessionId)
	if (!meta || !isElectron) return

	const ts = Date.now()
	// User message + text part.
	const userId = `cli-user-${ts}`
	appStore.set(upsertMessageAtom, {
		id: userId,
		sessionID: sessionId,
		role: "user",
		time: { created: ts },
		agent: meta.runtimeId,
		model: { providerID: "cli", modelID: meta.runtimeId },
	} as UserMessage)
	appStore.set(upsertPartAtom, {
		id: `${userId}-text`,
		sessionID: sessionId,
		messageID: userId,
		type: "text",
		text,
	} as TextPart)

	// Assistant message shell + growing parts.
	const asstId = `cli-asst-${ts}`
	const textPartId = `${asstId}-text`
	const reasoningPartId = `${asstId}-reasoning`
	appStore.set(upsertMessageAtom, {
		id: asstId,
		sessionID: sessionId,
		role: "assistant",
		parentID: userId,
		modelID: meta.model || meta.runtimeId,
		providerID: "cli",
		time: { created: ts + 1 },
		tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
	} as AssistantMessage)
	appStore.set(setSessionStatusAtom, { sessionId, status: { type: "busy" } })
	appStore.set(setSessionErrorAtom, { sessionId, error: undefined })

	let messageText = ""
	let reasoningText = ""
	const runId = crypto.randomUUID()
	activeRuns.set(sessionId, runId)

	const unsubscribe = window.palot.agentSubagent.onUpdate((rid, update: AgentUpdate) => {
		if (rid !== runId) return
		if (update.kind === "message" && update.text) {
			messageText = messageText ? `${messageText}\n${update.text}` : update.text
			appStore.set(upsertPartAtom, {
				id: textPartId,
				sessionID: sessionId,
				messageID: asstId,
				type: "text",
				text: messageText,
			} as TextPart)
			bump(sessionId)
		} else if (update.kind === "reasoning" && update.text) {
			reasoningText = reasoningText ? `${reasoningText}\n${update.text}` : update.text
			appStore.set(upsertPartAtom, {
				id: reasoningPartId,
				sessionID: sessionId,
				messageID: asstId,
				type: "reasoning",
				text: reasoningText,
				time: { start: ts },
			} as ReasoningPart)
			bump(sessionId)
		}
	})

	try {
		const result = await window.palot.agentSubagent.run(runId, meta.runtimeId, {
			prompt: text,
			cwd: meta.cwd || ".",
			sandbox: meta.sandbox,
			model: meta.model,
			resumeId: meta.threadId ?? undefined,
		})
		// Finalize the assistant text (result.message is the authoritative answer).
		const finalText = result.message || messageText || "(no output)"
		appStore.set(upsertPartAtom, {
			id: textPartId,
			sessionID: sessionId,
			messageID: asstId,
			type: "text",
			text: finalText,
		} as TextPart)
		if (reasoningText) {
			appStore.set(upsertPartAtom, {
				id: reasoningPartId,
				sessionID: sessionId,
				messageID: asstId,
				type: "reasoning",
				text: reasoningText,
				time: { start: ts, end: Date.now() },
			} as ReasoningPart)
		}
		appStore.set(upsertMessageAtom, {
			id: asstId,
			sessionID: sessionId,
			role: "assistant",
			parentID: userId,
			modelID: meta.model || meta.runtimeId,
			providerID: "cli",
			time: { created: ts + 1, completed: Date.now() },
			tokens: {
				input: result.usage?.inputTokens ?? 0,
				output: result.usage?.outputTokens ?? 0,
				reasoning: result.usage?.reasoningOutputTokens ?? 0,
				cache: { read: result.usage?.cachedInputTokens ?? 0, write: 0 },
			},
		} as AssistantMessage)
		if (result.threadId) patchCliMeta(sessionId, { threadId: result.threadId })
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		appStore.set(upsertPartAtom, {
			id: textPartId,
			sessionID: sessionId,
			messageID: asstId,
			type: "text",
			text: messageText || `⚠ ${message}`,
		} as TextPart)
		appStore.set(setSessionErrorAtom, {
			sessionId,
			error: { name: "CLIError", data: { message } },
		})
		log.error("CLI turn failed", { sessionId }, err)
	} finally {
		unsubscribe()
		activeRuns.delete(sessionId)
		appStore.set(setSessionStatusAtom, { sessionId, status: { type: "idle" } })
		bump(sessionId)
	}
}

/** Cancel the in-flight turn for a CLI session (best-effort). */
export function cancelCliTurn(sessionId: string): void {
	const runId = activeRuns.get(sessionId)
	if (isElectron && runId) window.palot.agentSubagent.cancel(runId)
}
