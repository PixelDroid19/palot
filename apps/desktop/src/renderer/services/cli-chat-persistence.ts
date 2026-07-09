import type { CliSessionMeta } from "../atoms/cli-sessions"
import { clearCliMeta, getCliMeta, setCliMeta } from "../atoms/cli-sessions"
import { messagesFamily, upsertMessageAtom } from "../atoms/messages"
import { partsFamily, upsertPartAtom } from "../atoms/parts"
import { sessionFamily, upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import { createLogger } from "../lib/logger"
import type { Message, Part, Session } from "../lib/types"

const log = createLogger("cli-chat-persistence")

const isElectron = typeof window !== "undefined" && "gcode" in window

const INDEX_KEY = "gcode:cliSessions"
const SESSION_KEY_PREFIX = "gcode:cliSession:"
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
		while (ids.length > MAX_PERSISTED_SESSIONS) {
			const evicted = ids.shift()
			if (evicted) localStorage.removeItem(SESSION_KEY_PREFIX + evicted)
		}
		localStorage.setItem(INDEX_KEY, JSON.stringify(ids))
	} catch (err) {
		log.warn("Failed to persist CLI session", { sessionId }, err)
	}
}

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

export async function closeCliSessionBackend(sessionId: string): Promise<void> {
	if (isElectron) {
		try {
			await window.gcode.agentSession.close(sessionId)
		} catch (err) {
			log.warn("Failed to close CLI session in backend", { sessionId }, err)
		}
	}
}

export async function forgetCliSession(sessionId: string): Promise<void> {
	localStorage.removeItem(SESSION_KEY_PREFIX + sessionId)
	const ids = readIndex().filter((id) => id !== sessionId)
	localStorage.setItem(INDEX_KEY, JSON.stringify(ids))
	clearCliMeta(sessionId)
	await closeCliSessionBackend(sessionId)
}
