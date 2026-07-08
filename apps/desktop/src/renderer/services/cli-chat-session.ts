import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import { createUuidV7 } from "../../shared/uuid"
import {
	getCliMeta,
	patchCliMeta,
	setCliMeta,
} from "../atoms/cli-sessions"
import { messagesFamily, upsertMessageAtom } from "../atoms/messages"
import { partsFamily, upsertPartAtom } from "../atoms/parts"
import { removeSessionAtom, sessionFamily, upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import { createLogger } from "../lib/logger"
import type { Part, Session, TextPart } from "../lib/types"
import {
	closeCliSessionBackend,
	forgetCliSession,
	persistCliSession,
} from "./cli-chat-persistence"
import { cancelCliTurn } from "./cli-chat-turn"

const log = createLogger("cli-chat-session")

const isElectron = typeof window !== "undefined" && "palot" in window

const RUNTIME_LABELS: Record<string, string> = {
	codex: "Codex",
	claude: "Claude Code",
}

const HANDOFF_MAX_CHARS = 12_000

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
	log.info("Switched session runtime", { sessionId, runtimeId })
}

const opencodeHandoffs = new Map<string, string>()

export function consumeOpencodeHandoff(sessionId: string): string | null {
	const handoff = opencodeHandoffs.get(sessionId)
	if (handoff) opencodeHandoffs.delete(sessionId)
	return handoff ?? null
}

export async function switchCliSessionToOpenCode(
	sessionId: string,
	createServerSession: (directory: string, title?: string) => Promise<Session | undefined>,
): Promise<string | null> {
	const meta = getCliMeta(sessionId)
	const entry = appStore.get(sessionFamily(sessionId))
	if (!meta || !entry) return null

	cancelCliTurn(sessionId)
	await closeCliSessionBackend(sessionId)

	const created = await createServerSession(entry.directory, entry.session.title)
	if (!created) return null

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

	await forgetCliSession(sessionId)
	appStore.set(removeSessionAtom, sessionId)
	log.info("Switched CLI session to OpenCode", { from: sessionId, to: created.id })
	return created.id
}

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
