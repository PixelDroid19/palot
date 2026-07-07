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
import type {
	AgentPermissionRequest,
	AgentQuestionRequest,
	AgentRuntimeId,
	AgentSandbox,
} from "../../preload/api"
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
	/**
	 * Set when the runtime changed mid-conversation (or an OpenCode session was
	 * converted): the next prompt carries the conversation history so the new
	 * CLI continues with full context.
	 */
	handoff?: boolean
}

export const cliSessionsAtom = atom<Record<string, CliSessionMeta>>({})

/** Tool-approval requests the agent is blocked on, per session. */
export const cliPermissionsAtom = atom<Record<string, AgentPermissionRequest[]>>({})

export function pushCliPermission(sessionId: string, request: AgentPermissionRequest): void {
	const current = appStore.get(cliPermissionsAtom)
	appStore.set(cliPermissionsAtom, {
		...current,
		[sessionId]: [...(current[sessionId] ?? []), request],
	})
}

export function removeCliPermission(sessionId: string, requestId: string): void {
	const current = appStore.get(cliPermissionsAtom)
	const remaining = (current[sessionId] ?? []).filter((r) => r.requestId !== requestId)
	appStore.set(cliPermissionsAtom, { ...current, [sessionId]: remaining })
}

/** Structured questions (AskUserQuestion) the agent is waiting on, per session. */
export const cliQuestionsAtom = atom<Record<string, AgentQuestionRequest[]>>({})

export function pushCliQuestion(sessionId: string, request: AgentQuestionRequest): void {
	const current = appStore.get(cliQuestionsAtom)
	appStore.set(cliQuestionsAtom, {
		...current,
		[sessionId]: [...(current[sessionId] ?? []), request],
	})
}

export function removeCliQuestion(sessionId: string, requestId: string): void {
	const current = appStore.get(cliQuestionsAtom)
	const remaining = (current[sessionId] ?? []).filter((r) => r.requestId !== requestId)
	appStore.set(cliQuestionsAtom, { ...current, [sessionId]: remaining })
}

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
