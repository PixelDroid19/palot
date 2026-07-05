/**
 * Marks which sessions are backed by a coding-agent CLI (Codex, Claude Code, …)
 * rather than the OpenCode server. CLI sessions render in the exact same chat
 * view; this atom is the discriminator the write actions branch on so prompts
 * route to the CLI runner instead of the OpenCode client.
 *
 * Transcripts live in the shared message/part atoms and are persisted to
 * localStorage by services/cli-chat.ts (restored at startup by the app shell).
 */
import { atom } from "jotai"
import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import { appStore } from "./store"

export interface CliSessionMeta {
	runtimeId: AgentRuntimeId
	cwd: string
	sandbox: AgentSandbox
	/** Model slug to pass to the CLI; empty = the CLI's own default. */
	model?: string
	/** Reasoning-effort override; empty = the CLI's own default. */
	effort?: string
	/** The CLI's own session id, used to resume for multi-turn context. */
	threadId: string | null
}

export const cliSessionsAtom = atom<Record<string, CliSessionMeta>>({})

/** True if the given session is backed by a CLI runtime. */
export function isCliSession(sessionId: string): boolean {
	return sessionId in appStore.get(cliSessionsAtom)
}

export function getCliMeta(sessionId: string): CliSessionMeta | undefined {
	return appStore.get(cliSessionsAtom)[sessionId]
}

export function setCliMeta(sessionId: string, meta: CliSessionMeta): void {
	appStore.set(cliSessionsAtom, { ...appStore.get(cliSessionsAtom), [sessionId]: meta })
}

export function patchCliMeta(sessionId: string, patch: Partial<CliSessionMeta>): void {
	const current = appStore.get(cliSessionsAtom)
	const existing = current[sessionId]
	if (!existing) return
	appStore.set(cliSessionsAtom, { ...current, [sessionId]: { ...existing, ...patch } })
}
