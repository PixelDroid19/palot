import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import { upsertMessageAtom } from "../atoms/messages"
import { upsertPartAtom } from "../atoms/parts"
import { removeSessionAtom, sessionFamily, upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import type { RuntimePromptOptions } from "../lib/runtime-session-config"
import {
	isCliRuntimeState,
	readSessionRuntimeState,
	resolveManagedRuntimePromptOptions,
	resolvePromptRuntime,
} from "../lib/runtime-session-config"
import {
	DEFAULT_SESSION_RUNTIME_ID,
	isCliRuntime,
	type SessionRuntimeId,
} from "../lib/session-runtimes"
import type {
	FilePart,
	FilePartInput,
	Session,
	TextPart,
	UserMessage,
} from "../lib/types"
import { requireManagedRuntimeProjectClient } from "./managed-runtime-client"
import {
	createCliRuntimeSessionState,
	switchCliRuntimeSession,
	switchCliSessionIntoManagedRuntime,
} from "./runtime-cli-session"
import {
	forgetCliRuntimeSession,
	persistCliRuntimeSession,
} from "./runtime-cli-store"
import {
	consumeCliToManagedRuntimeHandoff,
	interruptCliRuntimeTurn,
	runCliRuntimeTurn,
} from "./runtime-cli-turns"

function shouldUseCliRuntime(
	sessionId: string,
	options?: RuntimePromptOptions,
): boolean {
	return resolvePromptRuntime(readSessionRuntimeState(sessionId), options) === "cli"
}

function isCliSession(sessionId: string): boolean {
	return isCliRuntimeState(readSessionRuntimeState(sessionId))
}

async function createManagedRuntimeSession(
	directory: string,
	title?: string,
): Promise<Session | undefined> {
	const client = requireManagedRuntimeProjectClient(directory)
	const result = await client.session.create({ title })
	const session = result.data as Session | undefined
	if (session) {
		appStore.set(upsertSessionAtom, { session, directory })
	}
	return session
}

async function promptManagedRuntimeSession(
	directory: string,
	sessionId: string,
	text: string,
	options?: RuntimePromptOptions,
): Promise<void> {
	const client = requireManagedRuntimeProjectClient(directory)
	const optimisticId = `optimistic-${Date.now()}`
	const managedOptions = resolveManagedRuntimePromptOptions(readSessionRuntimeState(sessionId), options)
	const optimisticMessage: UserMessage & { variant?: string } = {
		id: optimisticId,
		sessionID: sessionId,
		role: "user",
		time: { created: Date.now() },
		agent: managedOptions?.agentName ?? "build",
		model: managedOptions?.model ?? { providerID: "", modelID: "" },
		variant: managedOptions?.variant,
	}
	appStore.set(upsertMessageAtom, optimisticMessage as UserMessage)

	const optimisticTextPart: TextPart = {
		id: `${optimisticId}-text`,
		sessionID: sessionId,
		messageID: optimisticId,
		type: "text",
		text,
	}
	appStore.set(upsertPartAtom, optimisticTextPart)

	const files = options?.files ?? []
	for (const [index, file] of files.entries()) {
		const optimisticFilePart: FilePart = {
			id: `${optimisticId}-file-${index}`,
			sessionID: sessionId,
			messageID: optimisticId,
			type: "file",
			mime: file.mediaType ?? "application/octet-stream",
			filename: file.filename,
			url: file.url,
		}
		appStore.set(upsertPartAtom, optimisticFilePart)
	}

	const parts: Array<{ type: "text"; text: string } | FilePartInput> = [{ type: "text", text }]
	const handoff = consumeCliToManagedRuntimeHandoff(sessionId)
	if (handoff) parts.unshift({ type: "text", text: handoff })
	for (const file of files) {
		parts.push({
			type: "file",
			mime: file.mediaType ?? "application/octet-stream",
			filename: file.filename,
			url: file.url,
		})
	}

	await client.session.promptAsync({
		sessionID: sessionId,
		parts,
		model: managedOptions?.model
			? {
					providerID: managedOptions.model.providerID,
					modelID: managedOptions.model.modelID,
				}
			: undefined,
		agent: managedOptions?.agentName,
		variant: managedOptions?.variant,
	})
}

export type RuntimeSessionCreateRequest =
	| {
			directory: string
			title?: string
			kind?: "managed"
	  }
	| {
			directory: string
			kind: "cli"
			runtimeId: AgentRuntimeId
			sandbox: AgentSandbox
			model?: string
			effort?: string
	  }

export interface RuntimeSessionCreateResult {
	runtimeId: SessionRuntimeId
	sessionId: string
	session?: Session
}

export const runtimeSessionGateway = {
	async createSession(
		args: RuntimeSessionCreateRequest,
	): Promise<RuntimeSessionCreateResult | null> {
		if (args.kind === "cli") {
			const sessionId = createCliRuntimeSessionState(args)
			return {
				runtimeId: args.runtimeId,
				sessionId,
			}
		}

		const session = await createManagedRuntimeSession(args.directory, args.title)
		if (!session) return null
		return {
			runtimeId: DEFAULT_SESSION_RUNTIME_ID,
			sessionId: session.id,
			session,
		}
	},
	async switchRuntimeSession(
		sessionId: string,
		targetRuntime: SessionRuntimeId,
		fallbackDirectory?: string,
	): Promise<string | null> {
		if (!isCliRuntime(targetRuntime)) {
			return switchCliSessionIntoManagedRuntime(sessionId, createManagedRuntimeSession)
		}

		await switchCliRuntimeSession(sessionId, targetRuntime, fallbackDirectory)
		return sessionId
	},
	async promptSession(
		directory: string,
		sessionId: string,
		text: string,
		options?: RuntimePromptOptions,
	): Promise<void> {
		if (shouldUseCliRuntime(sessionId, options)) {
			await runCliRuntimeTurn(sessionId, text, options?.files)
			return
		}

		await promptManagedRuntimeSession(directory, sessionId, text, options)
	},
	async abortSession(directory: string, sessionId: string): Promise<void> {
		if (isCliSession(sessionId)) {
			interruptCliRuntimeTurn(sessionId)
			return
		}

		const client = requireManagedRuntimeProjectClient(directory)
		await client.session.abort({ sessionID: sessionId })
	},
	async renameSession(
		directory: string,
		sessionId: string,
		title: string,
	): Promise<void> {
		const entry = appStore.get(sessionFamily(sessionId))
		if (entry) {
			appStore.set(upsertSessionAtom, {
				session: { ...entry.session, title },
				directory: entry.directory,
			})
		}

		if (isCliSession(sessionId)) {
			persistCliRuntimeSession(sessionId)
			return
		}

		const client = requireManagedRuntimeProjectClient(directory)
		await client.session.update({ sessionID: sessionId, title })
	},
	async deleteSession(directory: string, sessionId: string): Promise<void> {
		if (isCliSession(sessionId)) {
			interruptCliRuntimeTurn(sessionId)
			await forgetCliRuntimeSession(sessionId)
			appStore.set(removeSessionAtom, sessionId)
			return
		}

		const client = requireManagedRuntimeProjectClient(directory)
		await client.session.delete({ sessionID: sessionId })
	},
	async revertSession(
		directory: string,
		sessionId: string,
		messageId: string,
	): Promise<void> {
		if (isCliSession(sessionId)) {
			throw new Error("Revert is not supported for CLI sessions")
		}

		const client = requireManagedRuntimeProjectClient(directory)
		const entry = appStore.get(sessionFamily(sessionId))
		if (entry?.status?.type === "busy") {
			await client.session.abort({ sessionID: sessionId })
		}
		await client.session.revert({ sessionID: sessionId, messageID: messageId })
	},
	async unrevertSession(directory: string, sessionId: string): Promise<void> {
		if (isCliSession(sessionId)) {
			throw new Error("Undo is not supported for CLI sessions")
		}

		const client = requireManagedRuntimeProjectClient(directory)
		await client.session.unrevert({ sessionID: sessionId })
	},
	async executeCommand(
		directory: string,
		sessionId: string,
		command: string,
		args: string,
	): Promise<void> {
		if (isCliSession(sessionId)) {
			throw new Error("Slash commands are not supported for CLI sessions")
		}

		const client = requireManagedRuntimeProjectClient(directory)
		await client.session.command({
			sessionID: sessionId,
			command,
			arguments: args,
		})
	},
	async summarizeSession(
		directory: string,
		sessionId: string,
		model?: { providerID: string; modelID: string },
	): Promise<void> {
		if (isCliSession(sessionId)) {
			throw new Error("Summarize is not supported for CLI sessions")
		}

		const client = requireManagedRuntimeProjectClient(directory)
		await client.session.summarize({
			sessionID: sessionId,
			providerID: model?.providerID,
			modelID: model?.modelID,
		})
	},
	async deletePart(
		directory: string,
		sessionId: string,
		messageId: string,
		partId: string,
	): Promise<void> {
		if (isCliSession(sessionId)) {
			throw new Error("Deleting parts is not supported for CLI sessions")
		}

		const client = requireManagedRuntimeProjectClient(directory)
		await client.part.delete({ sessionID: sessionId, messageID: messageId, partID: partId })
	},
	async forkSession(
		directory: string,
		sessionId: string,
		messageId?: string,
	): Promise<Session> {
		if (isCliSession(sessionId)) {
			throw new Error("Fork is not supported for CLI sessions")
		}

		const client = requireManagedRuntimeProjectClient(directory)
		const result = await client.session.fork({
			sessionID: sessionId,
			messageID: messageId,
		})
		const session = result.data as Session
		if (session) {
			appStore.set(upsertSessionAtom, { session, directory })
		}
		return session
	},
}
