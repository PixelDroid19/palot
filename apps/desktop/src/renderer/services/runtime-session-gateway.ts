import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import { upsertMessageAtom } from "../atoms/messages"
import { upsertPartAtom } from "../atoms/parts"
import { removeSessionAtom, sessionFamily, upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import type { RuntimePromptOptions } from "../lib/runtime-session-config"
import { readSessionRuntimeState } from "../lib/runtime-session-config"
import { isCliRuntime, type SessionRuntimeId } from "../lib/session-runtimes"
import type {
	FilePart,
	FilePartInput,
	Session,
	TextPart,
	UserMessage,
} from "../lib/types"
import { getProjectClient } from "./connection-manager"
import {
	createCliRuntimeSessionState,
	switchCliRuntimeSession,
	switchCliSessionIntoOpenCode,
} from "./runtime-cli-session"
import {
	forgetCliRuntimeSession,
	persistCliRuntimeSession,
} from "./runtime-cli-store"
import {
	consumeCliToOpenCodeHandoff,
	interruptCliRuntimeTurn,
	runCliRuntimeTurn,
} from "./runtime-cli-turns"

function requireOpenCodeClient(directory: string) {
	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	return client
}

function shouldUseCliRuntime(
	sessionId: string,
	options?: RuntimePromptOptions,
): boolean {
	return options?.runtime === "cli" || readSessionRuntimeState(sessionId).runtime === "cli"
}

function isCliSession(sessionId: string): boolean {
	return readSessionRuntimeState(sessionId).runtime === "cli"
}

async function createOpenCodeSession(
	directory: string,
	title?: string,
): Promise<Session | undefined> {
	const client = requireOpenCodeClient(directory)
	const result = await client.session.create({ title })
	const session = result.data as Session | undefined
	if (session) {
		appStore.set(upsertSessionAtom, { session, directory })
	}
	return session
}

async function promptOpenCodeSession(
	directory: string,
	sessionId: string,
	text: string,
	options?: RuntimePromptOptions,
): Promise<void> {
	const client = requireOpenCodeClient(directory)
	const optimisticId = `optimistic-${Date.now()}`
	const openCodeOptions = options?.runtime === "cli" ? undefined : options
	const optimisticMessage: UserMessage & { variant?: string } = {
		id: optimisticId,
		sessionID: sessionId,
		role: "user",
		time: { created: Date.now() },
		agent: openCodeOptions?.agentName ?? "build",
		model: openCodeOptions?.model ?? { providerID: "", modelID: "" },
		variant: openCodeOptions?.variant,
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
	const handoff = consumeCliToOpenCodeHandoff(sessionId)
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
		model: openCodeOptions?.model
			? {
					providerID: openCodeOptions.model.providerID,
					modelID: openCodeOptions.model.modelID,
				}
			: undefined,
		agent: openCodeOptions?.agentName,
		variant: openCodeOptions?.variant,
	})
}

export const runtimeSessionGateway = {
	createOpenCodeSession,
	createCliRuntimeSession(args: {
		directory: string
		runtimeId: AgentRuntimeId
		sandbox: AgentSandbox
		model?: string
		effort?: string
	}): string {
		return createCliRuntimeSessionState(args)
	},
	async switchRuntimeSession(
		sessionId: string,
		targetRuntime: SessionRuntimeId,
		fallbackDirectory?: string,
	): Promise<string | null> {
		if (!isCliRuntime(targetRuntime)) {
			return switchCliSessionIntoOpenCode(sessionId, createOpenCodeSession)
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

		await promptOpenCodeSession(directory, sessionId, text, options)
	},
	async abortSession(directory: string, sessionId: string): Promise<void> {
		if (isCliSession(sessionId)) {
			interruptCliRuntimeTurn(sessionId)
			return
		}

		const client = requireOpenCodeClient(directory)
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

		const client = requireOpenCodeClient(directory)
		await client.session.update({ sessionID: sessionId, title })
	},
	async deleteSession(directory: string, sessionId: string): Promise<void> {
		if (isCliSession(sessionId)) {
			interruptCliRuntimeTurn(sessionId)
			await forgetCliRuntimeSession(sessionId)
			appStore.set(removeSessionAtom, sessionId)
			return
		}

		const client = requireOpenCodeClient(directory)
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

		const client = requireOpenCodeClient(directory)
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

		const client = requireOpenCodeClient(directory)
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

		const client = requireOpenCodeClient(directory)
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

		const client = requireOpenCodeClient(directory)
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

		const client = requireOpenCodeClient(directory)
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

		const client = requireOpenCodeClient(directory)
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
