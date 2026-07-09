/**
 * Framework-free session catalog for the Lit shell.
 * Sources: localStorage CLI sessions + optional OpenCode restore later.
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

const CLI_INDEX_KEY = "gcode:cliSessions"
const LEGACY_CLI_INDEX = "palot:cliSessions"

function readCliIndex(): LitSessionSummary[] {
	try {
		const raw =
			localStorage.getItem(CLI_INDEX_KEY) ?? localStorage.getItem(LEGACY_CLI_INDEX) ?? "{}"
		const parsed = JSON.parse(raw) as Record<
			string,
			{ title?: string; runtimeId?: string; directory?: string; updatedAt?: number }
		>
		return Object.entries(parsed).map(([id, meta]) => ({
			id,
			title: meta.title || id.slice(0, 8),
			runtimeId: meta.runtimeId || "unknown",
			directory: meta.directory,
			updatedAt: meta.updatedAt || Date.now(),
			status: "idle" as const,
		}))
	} catch {
		return []
	}
}

class SessionStore {
	private sessions: LitSessionSummary[] = []
	private activeId: string | null = null

	refresh(): void {
		this.sessions = readCliIndex().sort((a, b) => b.updatedAt - a.updatedAt)
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

	upsertLocal(session: LitSessionSummary): void {
		const idx = this.sessions.findIndex((s) => s.id === session.id)
		if (idx >= 0) this.sessions[idx] = session
		else this.sessions.unshift(session)
		gcodeBus.publish(BusTopics.sessionListChanged, this.list())
	}
}

export const sessionStore = new SessionStore()
