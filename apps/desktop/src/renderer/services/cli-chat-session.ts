/**
 * Session lifecycle for agent-host process runtimes and mid-session switches.
 *
 * Transcript is always Palot-owned (messages/parts atoms). Switching runtimes
 * never wipes the visible chat: CLI↔CLI keeps the same session id; CLI→managed
 * transfers the transcript onto the new managed session before removing the old
 * shell, and stages a text handoff for the next model turn.
 */
import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import { createUuidV7 } from "../../shared/uuid"
import {
	clearCliMeta,
	getCliMeta,
	patchCliMeta,
	setCliMeta,
} from "../atoms/cli-sessions"
import {
	messagesFamily,
	setMessagesAtom,
	sortMessagesChronological,
} from "../atoms/messages"
import { partsFamily } from "../atoms/parts"
import {
	removeSessionAtom,
	sessionFamily,
	setSessionBranchAtom,
	setSessionWorktreeAtom,
	upsertSessionAtom,
} from "../atoms/sessions"
import { appStore } from "../atoms/store"
import { createLogger } from "../lib/logger"
import { runtimeLabel } from "../lib/session-runtimes"
import type { Message, Part, Session, TextPart } from "../lib/types"
import {
	closeCliSessionBackend,
	forgetCliSession,
	persistCliSession,
} from "./cli-chat-persistence"
import { cancelCliTurn } from "./cli-chat-turn"

const log = createLogger("runtime-session-switch")

const isElectron = typeof window !== "undefined" && "palot" in window

const HANDOFF_MAX_CHARS = 12_000

/** Pending wire handoff text for the next managed-server prompt (by session id). */
const pendingManagedHandoffs = new Map<string, string>()

export function buildConversationHandoff(sessionId: string): string {
	const messages = appStore.get(messagesFamily(sessionId)) ?? []
	const turns: string[] = []
	for (const message of messages) {
		const parts = appStore.get(partsFamily(message.id)) ?? []
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

/** Build the system-style preamble injected into the next turn after a runtime switch. */
export function buildRuntimeHandoffPreamble(history: string): string {
	return (
		"Context: this conversation continues from another coding agent. History so far:\n\n" +
		`<conversation-history>\n${history}\n</conversation-history>\n\n` +
		"Continue seamlessly. Preserve prior decisions, files, and unfinished work."
	)
}

/**
 * Move the visible transcript from one session id to another without destroying
 * parts. Clears the source message list first so removeSessionAtom cannot wipe
 * part atoms that still belong to the destination.
 *
 * Message ids are preserved so part lookups stay valid.
 */
export function transferSessionTranscript(fromSessionId: string, toSessionId: string): number {
	if (fromSessionId === toSessionId) return 0
	const source = appStore.get(messagesFamily(fromSessionId)) ?? []
	if (source.length === 0) return 0

	const messages: Message[] = source.map((message) => ({
		...message,
		sessionID: toSessionId,
	}))
	const parts: Record<string, Part[]> = {}
	for (const message of source) {
		parts[message.id] = appStore.get(partsFamily(message.id)) ?? []
	}

	// Detach from source BEFORE removeSessionAtom can delete shared part atoms.
	appStore.set(messagesFamily(fromSessionId), [])

	// Always land on the destination in chronological order (time.created), not id order.
	appStore.set(setMessagesAtom, {
		sessionId: toSessionId,
		messages: sortMessagesChronological(messages),
		parts,
	})

	return messages.length
}

/** Consume staged managed-server handoff for the next prompt (one-shot). */
export function consumeManagedRuntimeHandoff(sessionId: string): string | null {
	const handoff = pendingManagedHandoffs.get(sessionId)
	if (handoff) pendingManagedHandoffs.delete(sessionId)
	return handoff ?? null
}

/** @deprecated Use consumeManagedRuntimeHandoff */
export const consumeProjectRuntimeHandoff = consumeManagedRuntimeHandoff

/**
 * Switch an agent-host session onto another process runtime (or attach agent-host
 * meta to a managed-server session). Same UI session id; transcript stays put.
 */
export async function switchCliRuntime(
	sessionId: string,
	runtimeId: AgentRuntimeId,
	fallbackCwd?: string,
): Promise<void> {
	const meta = getCliMeta(sessionId)
	if (meta?.runtimeId === runtimeId) return
	const hasHistory = (appStore.get(messagesFamily(sessionId)) ?? []).length > 0
	if (meta) {
		if (isElectron) {
			cancelCliTurn(sessionId)
			await closeCliSessionBackend(sessionId)
		}
		patchCliMeta(sessionId, {
			runtimeId,
			model: undefined,
			effort: undefined,
			threadId: null,
			handoff: hasHistory,
		})
	} else {
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
	log.info("Switched session to process runtime", { sessionId, runtimeId, handoff: hasHistory })
}

/**
 * Switch a process-backed session onto the managed-server transport (OpenCode).
 * Creates a server session, transfers the UI transcript, stages a text handoff
 * for the next prompt, then removes only the old session shell.
 */
export async function switchSessionToManagedServer(
	sessionId: string,
	createManagedSession: (directory: string, title?: string) => Promise<Session | undefined>,
): Promise<string | null> {
	const entry = appStore.get(sessionFamily(sessionId))
	if (!entry) {
		log.warn("Cannot switch to managed server: session missing", { sessionId })
		return null
	}

	// Capture handoff text before any mutation.
	const history = buildConversationHandoff(sessionId)
	const messageCount = (appStore.get(messagesFamily(sessionId)) ?? []).length

	cancelCliTurn(sessionId)
	await closeCliSessionBackend(sessionId)

	const created = await createManagedSession(entry.directory, entry.session.title)
	if (!created) {
		log.error("Managed session create failed during runtime switch", { sessionId })
		return null
	}

	// Preserve title / worktree / branch metadata on the managed session shell.
	appStore.set(upsertSessionAtom, {
		session: {
			...created,
			title: entry.session.title || created.title,
		},
		directory: entry.directory,
	})
	if (entry.worktreePath) {
		appStore.set(setSessionWorktreeAtom, {
			sessionId: created.id,
			worktreePath: entry.worktreePath,
			worktreeBranch: entry.worktreeBranch ?? "",
		})
	}
	if (entry.branch) {
		appStore.set(setSessionBranchAtom, {
			sessionId: created.id,
			branch: entry.branch,
		})
	}

	const moved = transferSessionTranscript(sessionId, created.id)
	if (history) {
		pendingManagedHandoffs.set(created.id, buildRuntimeHandoffPreamble(history))
	}

	clearCliMeta(sessionId)
	await forgetCliSession(sessionId)
	// messagesFamily(sessionId) is already empty → removeSessionAtom will not drop parts
	appStore.set(removeSessionAtom, sessionId)

	log.info("Switched process session to managed server", {
		from: sessionId,
		to: created.id,
		movedMessages: moved,
		sourceMessages: messageCount,
		handoff: Boolean(history),
	})
	return created.id
}

/** @deprecated Use switchSessionToManagedServer */
export const switchCliSessionToProjectRuntime = switchSessionToManagedServer
/** @deprecated Use switchSessionToManagedServer */
export const switchCliSessionToManagedRuntime = switchSessionToManagedServer

export function createCliSession(args: {
	directory: string
	runtimeId: AgentRuntimeId
	sandbox: AgentSandbox
	model?: string
	effort?: string
}): string {
	const sessionId = createUuidV7()
	const session: Session = {
		id: sessionId,
		title: `${runtimeLabel(args.runtimeId)} session`,
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
	log.info("Created process runtime session", { sessionId, runtime: args.runtimeId })
	return sessionId
}
