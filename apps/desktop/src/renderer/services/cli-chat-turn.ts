import type {
	AgentPermissionDecision,
	AgentUpdate,
} from "../../preload/api"
import {
	getCliMeta,
	patchCliMeta,
	pushCliPermission,
	pushCliQuestion,
	removeCliPermission,
	removeCliQuestion,
} from "../atoms/cli-sessions"
import { upsertMessageAtom } from "../atoms/messages"
import { upsertPartAtom } from "../atoms/parts"
import {
	sessionFamily,
	setSessionErrorAtom,
	setSessionStatusAtom,
	upsertSessionAtom,
} from "../atoms/sessions"
import { appStore } from "../atoms/store"
import { streamingVersionFamily } from "../atoms/streaming"
import { createLogger } from "../lib/logger"
import type {
	AssistantMessage,
	FileAttachment,
	Part,
	ReasoningPart,
	TextPart,
	UserMessage,
} from "../lib/types"
import { sanitizeAgentError } from "../lib/sanitize-agent-error"
import { persistCliSession } from "./cli-chat-persistence"
import { buildConversationHandoff } from "./cli-chat-session"

const log = createLogger("cli-chat-turn")

const isElectron = typeof window !== "undefined" && "palot" in window

const activeTurns = new Set<string>()

function bump(sessionId: string) {
	appStore.set(streamingVersionFamily(sessionId), (v) => v + 1)
}

/** @deprecated Prefer sanitizeAgentError — kept as alias for call sites. */
function humanizeError(text: string): string {
	return sanitizeAgentError(text)
}

export async function runCliTurn(
	sessionId: string,
	text: string,
	files?: FileAttachment[],
): Promise<void> {
	const meta = getCliMeta(sessionId)
	if (!meta || !isElectron) return

	if (activeTurns.has(sessionId)) {
		const steerTs = Date.now()
		const steerId = `cli-${steerTs}-0u`
		appStore.set(upsertMessageAtom, {
			id: steerId,
			sessionID: sessionId,
			role: "user",
			time: { created: steerTs },
			agent: meta.runtimeId,
			model: { providerID: "cli", modelID: meta.runtimeId },
		} as UserMessage)
		appStore.set(upsertPartAtom, {
			id: `${steerId}-text`,
			sessionID: sessionId,
			messageID: steerId,
			type: "text",
			text,
		} as TextPart)
		bump(sessionId)
		await window.palot.agentSession.steer(sessionId, text).catch((err) => {
			log.warn("Steering failed", { sessionId }, err)
		})
		return
	}

	let promptText = text
	if (meta.handoff) {
		const history = buildConversationHandoff(sessionId)
		if (history) {
			promptText = `You are taking over an ongoing conversation from another coding agent. Conversation so far:\n\n<conversation-history>\n${history}\n</conversation-history>\n\nContinue seamlessly. The user's next message follows.\n\n${text}`
		}
		patchCliMeta(sessionId, { handoff: false })
	}

	const images = (files ?? []).filter(
		(f) => f.mediaType?.startsWith("image/") && f.url.startsWith("data:"),
	)

	const entry = appStore.get(sessionFamily(sessionId))
	if (entry && /session$/.test(entry.session.title ?? "")) {
		const title = text.trim().replace(/\s+/g, " ").slice(0, 60) || entry.session.title
		appStore.set(upsertSessionAtom, {
			session: { ...entry.session, title },
			directory: entry.directory,
		})
	}

	const ts = Date.now()
	const userId = `cli-${ts}-0u`
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
	for (const [index, file] of images.entries()) {
		appStore.set(upsertPartAtom, {
			id: `${userId}-file-${index}`,
			sessionID: sessionId,
			messageID: userId,
			type: "file",
			mime: file.mediaType ?? "image/png",
			filename: file.filename,
			url: file.url,
		} as Part)
	}

	const asstId = `cli-${ts}-1a`
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
	let streamedDeltas = false
	const notices: string[] = []
	const toolParts = new Map<
		string,
		{ partId: string; name: string; start: number; detail?: string; output: string }
	>()
	let toolSeq = 0
	activeTurns.add(sessionId)

	const writeText = () => {
		appStore.set(upsertPartAtom, {
			id: textPartId,
			sessionID: sessionId,
			messageID: asstId,
			type: "text",
			text: messageText.replace(/^\s+/, ""),
		} as TextPart)
		bump(sessionId)
	}
	const writeReasoning = (end?: number) => {
		appStore.set(upsertPartAtom, {
			id: reasoningPartId,
			sessionID: sessionId,
			messageID: asstId,
			type: "reasoning",
			text: reasoningText.replace(/^\s+/, ""),
			time: end ? { start: ts, end } : { start: ts },
		} as ReasoningPart)
		bump(sessionId)
	}

	const unsubscribe = window.palot.agentSession.onUpdate((sid, update: AgentUpdate) => {
		if (sid !== sessionId) return
		if (update.kind === "message-delta" && update.text) {
			streamedDeltas = true
			messageText += update.text
			writeText()
		} else if (update.kind === "message" && update.text) {
			messageText =
				streamedDeltas || !messageText ? update.text : `${messageText}\n\n${update.text}`
			streamedDeltas = false
			writeText()
		} else if (update.kind === "reasoning-delta" && update.text) {
			reasoningText += update.text
			writeReasoning()
		} else if (update.kind === "reasoning" && update.text) {
			reasoningText = reasoningText ? `${reasoningText}\n\n${update.text}` : update.text
			writeReasoning()
		} else if (update.kind === "tool") {
			const key = update.id ?? `seq-${toolSeq++}`
			let entry = toolParts.get(key)
			if (!entry) {
				entry = {
					partId: `${asstId}-tool-${toolParts.size}`,
					name: update.name,
					start: Date.now(),
					detail: update.detail,
					output: "",
				}
				toolParts.set(key, entry)
			}
			if (update.name && update.name !== "tool") entry.name = update.name
			if (update.detail) entry.detail = update.detail
			const running = update.status === "running"
			if (running && update.output && update.name === "shell") {
				entry.output = (entry.output + update.output).slice(-8_000)
			} else if (update.output) {
				entry.output = update.output
			}
			const input = entry.detail ? { detail: entry.detail } : {}
			appStore.set(upsertPartAtom, {
				id: entry.partId,
				sessionID: sessionId,
				messageID: asstId,
				type: "tool",
				callID: key,
				tool: entry.name,
				state: running
					? {
							status: "running",
							input,
							title: entry.detail,
							metadata: entry.output ? { output: entry.output } : {},
							time: { start: entry.start },
						}
					: update.status === "error"
						? {
								status: "error",
								input,
								error: entry.output || "Tool failed",
								time: { start: entry.start, end: Date.now() },
							}
						: {
								status: "completed",
								input,
								output: entry.output,
								title: entry.detail || entry.name,
								metadata: {},
								time: { start: entry.start, end: Date.now() },
							},
			} as Part)
			bump(sessionId)
		} else if (update.kind === "notice" && update.text) {
			notices.push(update.text)
		} else if (update.kind === "permission") {
			pushCliPermission(sessionId, update.request)
			bump(sessionId)
		} else if (update.kind === "permission-resolved") {
			removeCliPermission(sessionId, update.requestId)
			bump(sessionId)
		} else if (update.kind === "question") {
			pushCliQuestion(sessionId, update.request)
			bump(sessionId)
		} else if (update.kind === "question-resolved") {
			removeCliQuestion(sessionId, update.requestId)
			bump(sessionId)
		}
	})

	try {
		await window.palot.agentSession.open(sessionId, meta.runtimeId, {
			cwd: meta.cwd || ".",
			sandbox: meta.sandbox,
			model: meta.model,
			reasoningEffort: meta.effort,
			resumeId: meta.threadId ?? undefined,
		})
		const result = await window.palot.agentSession.prompt(sessionId, {
			text: promptText,
			model: meta.model ?? "",
			reasoningEffort: meta.effort,
			sandbox: meta.sandbox,
			imageAttachments: images.length
				? images.map((f) => ({ dataUrl: f.url, filename: f.filename }))
				: undefined,
		})
		const noticeText = [...notices, ...result.notices].map(humanizeError).join("\n\n")
		const finalText =
			result.message || messageText.replace(/^\s+/, "") || (noticeText && `⚠ ${noticeText}`)
		appStore.set(upsertPartAtom, {
			id: textPartId,
			sessionID: sessionId,
			messageID: asstId,
			type: "text",
			text: finalText || "(no output)",
		} as TextPart)
		if (reasoningText) writeReasoning(Date.now())
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
		const message = humanizeError(err instanceof Error ? err.message : String(err))
		appStore.set(upsertPartAtom, {
			id: textPartId,
			sessionID: sessionId,
			messageID: asstId,
			type: "text",
			text: messageText.replace(/^\s+/, "") || `⚠ ${message}`,
		} as TextPart)
		appStore.set(setSessionErrorAtom, {
			sessionId,
			error: { name: "CLIError", data: { message } },
		})
		log.error("CLI turn failed", { sessionId }, err)
	} finally {
		unsubscribe()
		activeTurns.delete(sessionId)
		appStore.set(setSessionStatusAtom, { sessionId, status: { type: "idle" } })
		bump(sessionId)
		persistCliSession(sessionId)
	}
}

export function cancelCliTurn(sessionId: string): void {
	if (isElectron && activeTurns.has(sessionId)) {
		void window.palot.agentSession.interrupt(sessionId)
	}
}

export function isCliTurnActive(sessionId: string): boolean {
	return activeTurns.has(sessionId)
}

export function respondCliPermission(
	sessionId: string,
	requestId: string,
	decision: AgentPermissionDecision,
): void {
	if (!isElectron) return
	removeCliPermission(sessionId, requestId)
	void window.palot.agentSession.respondPermission(sessionId, requestId, decision)
}

export function answerCliQuestion(
	sessionId: string,
	requestId: string,
	answers: Record<string, string>,
): void {
	if (!isElectron) return
	removeCliQuestion(sessionId, requestId)
	void window.palot.agentSession.answerQuestion(sessionId, requestId, answers)
}
