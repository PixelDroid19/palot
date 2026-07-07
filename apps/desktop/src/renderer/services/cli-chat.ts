/**
 * Drives a CLI-backed chat session (Codex, Claude Code, …) into the SAME chat
 * view as OpenCode. It creates an SDK-shaped Session and, per turn, writes
 * SDK-shaped Message/Part objects into the shared Jotai atoms so the existing
 * ChatView renders it unchanged — no parallel UI. Prompts run through the
 * agent runtime layer in the main process, resuming the CLI's own session for
 * multi-turn context.
 */
import type {
	AgentPermissionDecision,
	AgentRuntimeId,
	AgentSandbox,
	AgentUpdate,
} from "../../preload/api"
import {
	type CliSessionMeta,
	getCliMeta,
	patchCliMeta,
	pushCliPermission,
	pushCliQuestion,
	removeCliPermission,
	removeCliQuestion,
	setCliMeta,
} from "../atoms/cli-sessions"
import { messagesFamily, upsertMessageAtom } from "../atoms/messages"
import { partsFamily, upsertPartAtom } from "../atoms/parts"
import {
	removeSessionAtom,
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
	Message,
	Part,
	ReasoningPart,
	Session,
	TextPart,
	UserMessage,
} from "../lib/types"

const log = createLogger("cli-chat")

const RUNTIME_LABELS: Record<string, string> = {
	codex: "Codex",
	claude: "Claude Code",
}

const isElectron = typeof window !== "undefined" && "palot" in window

/** Sessions with an in-flight turn (interrupt/steer targets). */
const activeTurns = new Set<string>()

// ============================================================
// Persistence — CLI transcripts survive reloads (localStorage)
// ============================================================

const INDEX_KEY = "palot:cliSessions"
const SESSION_KEY_PREFIX = "palot:cliSession:"
const MAX_PERSISTED_SESSIONS = 50

interface PersistedCliSession {
	session: Session
	directory: string
	meta: CliSessionMeta
	messages: Message[]
	parts: Record<string, Part[]>
}

function readIndex(): string[] {
	try {
		const raw = localStorage.getItem(INDEX_KEY)
		const ids = raw ? JSON.parse(raw) : []
		return Array.isArray(ids) ? ids : []
	} catch {
		return []
	}
}

/** Snapshot one CLI session (meta + transcript) into localStorage. */
export function persistCliSession(sessionId: string): void {
	const meta = getCliMeta(sessionId)
	const entry = appStore.get(sessionFamily(sessionId))
	if (!meta || !entry) return
	const messages = appStore.get(messagesFamily(sessionId))
	const parts: Record<string, Part[]> = {}
	for (const message of messages) {
		parts[message.id] = appStore.get(partsFamily(message.id))
	}
	try {
		const payload: PersistedCliSession = {
			session: entry.session,
			directory: entry.directory,
			meta,
			messages,
			parts,
		}
		localStorage.setItem(SESSION_KEY_PREFIX + sessionId, JSON.stringify(payload))
		const ids = readIndex().filter((id) => id !== sessionId)
		ids.push(sessionId)
		// Evict the oldest transcripts beyond the cap.
		while (ids.length > MAX_PERSISTED_SESSIONS) {
			const evicted = ids.shift()
			if (evicted) localStorage.removeItem(SESSION_KEY_PREFIX + evicted)
		}
		localStorage.setItem(INDEX_KEY, JSON.stringify(ids))
	} catch (err) {
		log.warn("Failed to persist CLI session", { sessionId }, err)
	}
}

/** Rewrite legacy `cli-user-<ts>`/`cli-asst-<ts>` ids to the sortable scheme. */
function migrateLegacyId(id: string): string {
	const match = /^cli-(user|asst)-(\d+)(.*)$/.exec(id)
	if (!match) return id
	const [, role, ts, suffix] = match
	return `cli-${ts}-${role === "user" ? "0u" : "1a"}${suffix}`
}

function migrateLegacyIds(data: PersistedCliSession): PersistedCliSession {
	const messages = data.messages.map((m) => ({
		...m,
		id: migrateLegacyId(m.id),
		...("parentID" in m && m.parentID ? { parentID: migrateLegacyId(m.parentID) } : {}),
	})) as Message[]
	const parts: Record<string, Part[]> = {}
	for (const [messageId, list] of Object.entries(data.parts)) {
		parts[migrateLegacyId(messageId)] = list.map((p) => ({
			...p,
			id: migrateLegacyId(p.id),
			messageID: migrateLegacyId(p.messageID),
		})) as Part[]
	}
	return { ...data, messages, parts }
}

/** Rehydrate all persisted CLI sessions into the shared atoms. Call once at startup. */
export function restoreCliSessions(): void {
	for (const sessionId of readIndex()) {
		try {
			const raw = localStorage.getItem(SESSION_KEY_PREFIX + sessionId)
			if (!raw) continue
			const data = migrateLegacyIds(JSON.parse(raw) as PersistedCliSession)
			appStore.set(upsertSessionAtom, { session: data.session, directory: data.directory })
			setCliMeta(sessionId, data.meta)
			for (const message of data.messages) {
				appStore.set(upsertMessageAtom, message)
				for (const part of data.parts[message.id] ?? []) {
					appStore.set(upsertPartAtom, part)
				}
			}
		} catch (err) {
			log.warn("Failed to restore CLI session", { sessionId }, err)
		}
	}
}

/** Drop a CLI session from persistence (e.g. when the user deletes it). */
export function forgetCliSession(sessionId: string): void {
	localStorage.removeItem(SESSION_KEY_PREFIX + sessionId)
	const ids = readIndex().filter((id) => id !== sessionId)
	localStorage.setItem(INDEX_KEY, JSON.stringify(ids))
	if (isElectron) void window.palot.agentSession.close(sessionId)
}

/** Force the active session's chat view to recompute (mirrors the SSE path). */
function bump(sessionId: string) {
	appStore.set(streamingVersionFamily(sessionId), (v) => v + 1)
}

/**
 * Model/provider errors sometimes arrive as a raw JSON blob (e.g.
 * `{"type":"error","error":{"type":"rate_limit_error","message":"…"}}`), which
 * reads as broken text in the chat (t3code #3747). Extract the human message
 * when the text is JSON; otherwise return it unchanged.
 */
function humanizeError(text: string): string {
	const trimmed = text.trim()
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text
	try {
		const parsed = JSON.parse(trimmed)
		const msg =
			parsed?.error?.message ??
			parsed?.error?.error?.message ??
			parsed?.message ??
			(typeof parsed?.error === "string" ? parsed.error : null)
		if (typeof msg === "string" && msg) {
			const type = parsed?.error?.type ?? parsed?.type
			return type && type !== "error" ? `${msg} (${type})` : msg
		}
	} catch {
		// Not JSON after all — fall through to the original text.
	}
	return text
}

// ============================================================
// Runtime switching — one conversation, any CLI
// ============================================================

const HANDOFF_MAX_CHARS = 12_000

/**
 * Render the conversation so far as a plain-text transcript, for handing a
 * session's context to a different runtime. Most recent turns win the budget.
 */
export function buildConversationHandoff(sessionId: string): string {
	const messages = appStore.get(messagesFamily(sessionId))
	const turns: string[] = []
	for (const message of messages) {
		const parts = appStore.get(partsFamily(message.id))
		const text = parts
			.filter((p): p is TextPart => p.type === "text")
			.map((p) => p.text)
			.join("\n")
			.trim()
		if (!text) continue
		turns.push(`${message.role === "user" ? "User" : "Assistant"}: ${text}`)
	}
	let transcript = ""
	for (let i = turns.length - 1; i >= 0; i--) {
		const candidate = `${turns[i]}\n\n${transcript}`
		if (candidate.length > HANDOFF_MAX_CHARS) break
		transcript = candidate
	}
	return transcript.trim()
}

/**
 * Switch a conversation to a different CLI runtime mid-session. The backing
 * session of the old runtime is closed; the next prompt opens the new one and
 * carries the conversation history, so no context is lost. Also converts an
 * OpenCode-backed session into a CLI session (`cwd` required then).
 */
export async function switchCliRuntime(
	sessionId: string,
	runtimeId: AgentRuntimeId,
	fallbackCwd?: string,
): Promise<void> {
	const meta = getCliMeta(sessionId)
	if (meta?.runtimeId === runtimeId) return
	const hasHistory = appStore.get(messagesFamily(sessionId)).length > 0
	if (meta) {
		if (isElectron) {
			cancelCliTurn(sessionId)
			void window.palot.agentSession.close(sessionId)
		}
		patchCliMeta(sessionId, {
			runtimeId,
			model: undefined,
			effort: undefined,
			threadId: null,
			handoff: hasHistory,
		})
	} else {
		// Converting an OpenCode session: same chat, prompts now route to the CLI.
		const entry = appStore.get(sessionFamily(sessionId))
		setCliMeta(sessionId, {
			runtimeId,
			cwd: entry?.directory ?? fallbackCwd ?? ".",
			sandbox: "read-only",
			threadId: null,
			handoff: hasHistory,
		})
	}
	persistCliSession(sessionId)
	log.info("Switched session runtime", { sessionId, runtimeId })
}

/** Pending history handoffs for sessions switching TO OpenCode. */
const opencodeHandoffs = new Map<string, string>()

/** Consume (once) the history block for an OpenCode prompt after a switch. */
export function consumeOpencodeHandoff(sessionId: string): string | null {
	const handoff = opencodeHandoffs.get(sessionId)
	if (handoff) opencodeHandoffs.delete(sessionId)
	return handoff ?? null
}

/**
 * Switch a CLI-backed conversation to OpenCode. OpenCode sessions live on the
 * server with server-assigned ids, so the transcript is migrated to a fresh
 * server session and the history rides along with the first prompt. Returns
 * the new session id the caller should navigate to.
 */
export async function switchCliSessionToOpenCode(
	sessionId: string,
	createServerSession: (directory: string, title?: string) => Promise<Session | undefined>,
): Promise<string | null> {
	const meta = getCliMeta(sessionId)
	const entry = appStore.get(sessionFamily(sessionId))
	if (!meta || !entry) return null

	cancelCliTurn(sessionId)
	if (isElectron) void window.palot.agentSession.close(sessionId)

	const created = await createServerSession(entry.directory, entry.session.title)
	if (!created) return null

	// Copy the local transcript so the conversation is visible in the new
	// session (display only — the server learns the history via the handoff).
	for (const message of appStore.get(messagesFamily(sessionId))) {
		const newMessageId = `${message.id}-oc`
		appStore.set(upsertMessageAtom, { ...message, id: newMessageId, sessionID: created.id })
		for (const part of appStore.get(partsFamily(message.id))) {
			appStore.set(upsertPartAtom, {
				...part,
				id: `${part.id}-oc`,
				messageID: newMessageId,
				sessionID: created.id,
			} as Part)
		}
	}

	const history = buildConversationHandoff(sessionId)
	if (history) {
		opencodeHandoffs.set(
			created.id,
			`Context: this conversation continues from another coding agent. History so far:\n\n<conversation-history>\n${history}\n</conversation-history>\n\nContinue seamlessly.`,
		)
	}

	forgetCliSession(sessionId)
	appStore.set(removeSessionAtom, sessionId)
	log.info("Switched CLI session to OpenCode", { from: sessionId, to: created.id })
	return created.id
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
	effort?: string
}): string {
	const sessionId = crypto.randomUUID()
	const session: Session = {
		id: sessionId,
		title: `${RUNTIME_LABELS[args.runtimeId] ?? args.runtimeId} session`,
		directory: args.directory,
		time: { created: Date.now() },
	} as Session
	appStore.set(upsertSessionAtom, { session, directory: args.directory })
	setCliMeta(sessionId, {
		runtimeId: args.runtimeId,
		cwd: args.directory,
		sandbox: args.sandbox,
		model: args.model || undefined,
		effort: args.effort || undefined,
		threadId: null,
	})
	persistCliSession(sessionId)
	log.info("Created CLI session", { sessionId, runtime: args.runtimeId })
	return sessionId
}

/**
 * Run one conversation turn: write the user message, then stream the CLI's
 * response into the shared atoms as an assistant message. Resumes the CLI's
 * session so context carries across turns.
 */
export async function runCliTurn(
	sessionId: string,
	text: string,
	files?: FileAttachment[],
): Promise<void> {
	const meta = getCliMeta(sessionId)
	if (!meta || !isElectron) return

	// A message sent while a turn is running steers the live turn instead of
	// starting a new one (the agent folds it into its current work).
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

	// Runtime handoff: the runtime changed mid-conversation, so the first
	// prompt to the new CLI carries the transcript. Built before the new user
	// message is written; only `text` is displayed.
	let promptText = text
	if (meta.handoff) {
		const history = buildConversationHandoff(sessionId)
		if (history) {
			promptText = `You are taking over an ongoing conversation from another coding agent. Conversation so far:\n\n<conversation-history>\n${history}\n</conversation-history>\n\nContinue seamlessly. The user's next message follows.\n\n${text}`
		}
		patchCliMeta(sessionId, { handoff: false })
	}

	// Only image attachments are forwarded (as data URLs; the main process
	// writes them to temp files the CLI can read).
	const images = (files ?? []).filter(
		(f) => f.mediaType?.startsWith("image/") && f.url.startsWith("data:"),
	)

	// First prompt names the session (like OpenCode's auto-titling).
	const entry = appStore.get(sessionFamily(sessionId))
	if (entry && /session$/.test(entry.session.title ?? "")) {
		const title = text.trim().replace(/\s+/g, " ").slice(0, 60) || entry.session.title
		appStore.set(upsertSessionAtom, {
			session: { ...entry.session, title },
			directory: entry.directory,
		})
	}

	const ts = Date.now()
	// Message ids must sort chronologically AND user-before-assistant within a
	// turn: the message store keeps a per-session array sorted by id, and turn
	// grouping collects the assistant messages that FOLLOW a user message.
	// (`cli-user-*`/`cli-asst-*` broke this — "asst" < "user" lexically, so
	// responses sorted before their prompts and never rendered.)
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

	// Assistant message shell + growing parts.
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
	/** Tool-part state, keyed by the provider's tool id (or a running counter). */
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
			// Streaming: text arrives in chunks as the CLI produces it.
			streamedDeltas = true
			messageText += update.text
			writeText()
		} else if (update.kind === "message" && update.text) {
			// A complete message supersedes streamed deltas (it's the same answer,
			// authoritative); separate complete messages accumulate.
			messageText =
				streamedDeltas || !messageText ? update.text : `${messageText}\n\n${update.text}`
			streamedDeltas = false
			writeText()
		} else if (update.kind === "reasoning-delta" && update.text) {
			reasoningText += update.text
			writeReasoning()
		} else if (update.kind === "reasoning" && update.text) {
			// A complete reasoning block (e.g. one Codex summary section).
			reasoningText = reasoningText ? `${reasoningText}\n\n${update.text}` : update.text
			writeReasoning()
		} else if (update.kind === "tool") {
			// Render tool invocations with the same tool cards as OpenCode turns.
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
			// Shell output streams as append-only chunks; everything else (plan
			// snapshots, completed results) replaces the output wholesale.
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
			// The agent is blocked on approval; surface it for the approval bar.
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
		// The persistent session is opened once and reused for every turn —
		// context, caches and tool state live in the CLI's own process.
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
		// Finalize the assistant text (result.message is the authoritative answer;
		// notices — e.g. a CLI-reported error — are the fallback when it's empty).
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

/** Interrupt the in-flight turn for a CLI session; the session survives. */
export function cancelCliTurn(sessionId: string): void {
	if (isElectron && activeTurns.has(sessionId)) {
		void window.palot.agentSession.interrupt(sessionId)
	}
}

/** True while a turn is executing for this session. */
export function isCliTurnActive(sessionId: string): boolean {
	return activeTurns.has(sessionId)
}

/** Answer a pending tool-approval request. */
export function respondCliPermission(
	sessionId: string,
	requestId: string,
	decision: AgentPermissionDecision,
): void {
	if (!isElectron) return
	removeCliPermission(sessionId, requestId)
	void window.palot.agentSession.respondPermission(sessionId, requestId, decision)
}

/** Answer a pending structured question (AskUserQuestion). */
export function answerCliQuestion(
	sessionId: string,
	requestId: string,
	answers: Record<string, string>,
): void {
	if (!isElectron) return
	removeCliQuestion(sessionId, requestId)
	void window.palot.agentSession.answerQuestion(sessionId, requestId, answers)
}
