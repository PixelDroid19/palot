/**
 * Framework-free session catalog for Lit surfaces.
 *
 * Reads/writes the **same** localStorage shape as `cli-chat-persistence.ts`:
 * - `gcode:cliSessions` → string[] of session ids
 * - `gcode:cliSession:{id}` → { session, directory, meta, messages, parts }
 */
import { BusTopics, gcodeBus } from "./bus"

export interface LitSessionSummary {
	id: string
	title: string
	runtimeId: string
	directory?: string
	updatedAt: number
	status?: "idle" | "running" | "waiting" | "failed"
}

export interface LitChatMessage {
	id: string
	role: "user" | "assistant" | "system"
	text: string
}

const INDEX_KEY = "gcode:cliSessions"
const SESSION_KEY_PREFIX = "gcode:cliSession:"
const MAX_PERSISTED = 50

interface PersistedPayload {
	session?: {
		id?: string
		title?: string
		time?: { created?: number; updated?: number }
	}
	directory?: string
	meta?: {
		runtimeId?: string
		cwd?: string
		sandbox?: string
		model?: string
		effort?: string
		threadId?: string | null
	}
	messages?: Array<{
		id?: string
		role?: string
		time?: { created?: number }
	}>
	parts?: Record<string, Array<{ type?: string; text?: string; messageID?: string }>>
}

function readIndex(): string[] {
	try {
		const raw = localStorage.getItem(INDEX_KEY)
		const ids = raw ? JSON.parse(raw) : []
		return Array.isArray(ids) ? (ids as string[]) : []
	} catch {
		return []
	}
}

function writeIndex(ids: string[]): void {
	localStorage.setItem(INDEX_KEY, JSON.stringify(ids))
}

function readPayload(sessionId: string): PersistedPayload | null {
	try {
		const raw = localStorage.getItem(SESSION_KEY_PREFIX + sessionId)
		if (!raw) return null
		return JSON.parse(raw) as PersistedPayload
	} catch {
		return null
	}
}

function messageText(payload: PersistedPayload, messageId: string): string {
	const parts = payload.parts?.[messageId] ?? []
	return parts
		.filter((p) => p.type === "text" && typeof p.text === "string")
		.map((p) => p.text as string)
		.join("\n")
		.trim()
}

class SessionStore {
	private sessions: LitSessionSummary[] = []
	private activeId: string | null = null

	/** Load summaries from shipped persistence keys. */
	refresh(): void {
		const next: LitSessionSummary[] = []
		for (const id of readIndex()) {
			const data = readPayload(id)
			if (!data) continue
			const title = data.session?.title?.trim() || id.slice(0, 8)
			const runtimeId = data.meta?.runtimeId || "unknown"
			const updatedAt =
				data.session?.time?.updated ||
				data.session?.time?.created ||
				Date.now()
			next.push({
				id,
				title,
				runtimeId,
				directory: data.directory || data.meta?.cwd,
				updatedAt,
				status: "idle",
			})
		}
		this.sessions = next.sort((a, b) => b.updatedAt - a.updatedAt)
		gcodeBus.publish(BusTopics.sessionListChanged, this.list())
	}

	list(): LitSessionSummary[] {
		return [...this.sessions]
	}

	getActiveId(): string | null {
		return this.activeId
	}

	select(id: string | null): void {
		this.activeId = id
		gcodeBus.publish(BusTopics.sessionSelect, id)
	}

	/** Update transient runtime state without coupling Lit to a framework store. */
	updateStatus(sessionId: string, status: NonNullable<LitSessionSummary["status"]>): void {
		const index = this.sessions.findIndex((session) => session.id === sessionId)
		if (index < 0) return
		const next = [...this.sessions]
		next[index] = { ...next[index]!, status, updatedAt: Date.now() }
		this.sessions = next.sort((a, b) => b.updatedAt - a.updatedAt)
		gcodeBus.publish(BusTopics.sessionListChanged, this.list())
	}

	/** Transcript messages for a session (text parts only). */
	getMessages(sessionId: string): LitChatMessage[] {
		const data = readPayload(sessionId)
		if (!data?.messages?.length) return []
		const out: LitChatMessage[] = []
		for (const m of data.messages) {
			if (!m.id) continue
			const text = messageText(data, m.id)
			if (!text) continue
			const role =
				m.role === "user" || m.role === "assistant" ? m.role : ("system" as const)
			out.push({ id: m.id, role, text })
		}
		return out
	}

	getMeta(sessionId: string): PersistedPayload["meta"] | undefined {
		return readPayload(sessionId)?.meta
	}

	/** Persist descriptor-driven execution choices for the next agent turn. */
	updateMeta(
		sessionId: string,
		patch: Partial<NonNullable<PersistedPayload["meta"]>>,
	): void {
		const data = readPayload(sessionId)
		if (!data) return
		const next: PersistedPayload = {
			...data,
			meta: { ...data.meta, ...patch },
			session: {
				...data.session,
				id: sessionId,
				time: {
					created: data.session?.time?.created || Date.now(),
					updated: Date.now(),
				},
			},
		}
		localStorage.setItem(SESSION_KEY_PREFIX + sessionId, JSON.stringify(next))
		this.refresh()
	}

	/**
	 * Create or update a session in the real persistence format and index.
	 */
	upsertAndPersist(input: {
		id: string
		title: string
		runtimeId: string
		directory?: string
		sandbox?: string
		model?: string
	}): void {
		const existing = readPayload(input.id)
		const now = Date.now()
		const payload: PersistedPayload = {
			session: {
				id: input.id,
				title: input.title,
				time: {
					created: existing?.session?.time?.created || now,
					updated: now,
				},
			},
			directory: input.directory || existing?.directory || "",
			meta: {
				runtimeId: input.runtimeId,
				cwd: input.directory || existing?.meta?.cwd || "",
				sandbox: input.sandbox || existing?.meta?.sandbox || "workspace-write",
				model: input.model ?? existing?.meta?.model,
				threadId: existing?.meta?.threadId ?? null,
			},
			messages: existing?.messages ?? [],
			parts: existing?.parts ?? {},
		}
		localStorage.setItem(SESSION_KEY_PREFIX + input.id, JSON.stringify(payload))
		const ids = readIndex().filter((id) => id !== input.id)
		ids.push(input.id)
		while (ids.length > MAX_PERSISTED) {
			const evicted = ids.shift()
			if (evicted) localStorage.removeItem(SESSION_KEY_PREFIX + evicted)
		}
		writeIndex(ids)
		this.refresh()
	}

	/** Append a text message + part into persisted transcript (local UI sync). */
	appendMessage(
		sessionId: string,
		message: { id: string; role: "user" | "assistant" | "system"; text: string },
	): void {
		const data = readPayload(sessionId) ?? {
			session: { id: sessionId, title: sessionId.slice(0, 8), time: { created: Date.now() } },
			directory: "",
			meta: { runtimeId: "local", cwd: "", sandbox: "workspace-write", threadId: null },
			messages: [],
			parts: {},
		}
		const messages = [...(data.messages ?? [])]
		messages.push({
			id: message.id,
			role: message.role,
			time: { created: Date.now() },
		})
		const parts = { ...(data.parts ?? {}) }
		parts[message.id] = [
			{ type: "text", text: message.text, messageID: message.id },
		]
		const next: PersistedPayload = {
			...data,
			session: {
				...data.session,
				id: sessionId,
				time: {
					created: data.session?.time?.created || Date.now(),
					updated: Date.now(),
				},
			},
			messages,
			parts,
		}
		localStorage.setItem(SESSION_KEY_PREFIX + sessionId, JSON.stringify(next))
		// keep index membership
		if (!readIndex().includes(sessionId)) {
			writeIndex([...readIndex(), sessionId])
		}
		this.refresh()
	}
}

export const sessionStore = new SessionStore()

/** Exported for unit tests — pure parse helpers */
export const sessionStoreInternals = {
	INDEX_KEY,
	SESSION_KEY_PREFIX,
	readIndex,
	readPayload,
}
