import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import { upsertMessageAtom } from "../atoms/messages"
import { upsertPartAtom } from "../atoms/parts"
import { removeSessionAtom, sessionFamily, upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import type { RuntimePromptOptions } from "../lib/runtime-session-config"
import {
	isCliRuntimeState,
	readSessionRuntimeState,
	resolveProjectRuntimePromptOptions,
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
import { requireProjectRuntimeSessionClient } from "./project-runtime-client"
import {
	createCliRuntimeSessionState,
	switchCliRuntimeSession,
	switchCliSessionIntoProjectRuntime,
} from "./runtime-cli-session"
import {
	forgetCliRuntimeSession,
	persistCliRuntimeSession,
} from "./runtime-cli-store"
import {
	consumeCliToProjectRuntimeHandoff,
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

async function createProjectRuntimeSession(
	directory: string,
	title?: string,
): Promise<Session | undefined> {
	const client = requireProjectRuntimeSessionClient(directory)
	const result = await client.session.create({ title })
	const session = result.data as Session | undefined
	if (session) {
		appStore.set(upsertSessionAtom, { session, directory })
	}
	return session
}

async function promptProjectRuntimeSession(
	directory: string,
	sessionId: string,
	text: string,
	options?: RuntimePromptOptions,
): Promise<void> {
	const client = requireProjectRuntimeSessionClient(directory)
	const optimisticId = `optimistic-${Date.now()}`
	const projectOptions = resolveProjectRuntimePromptOptions(
		readSessionRuntimeState(sessionId),
		options,
	)
	const optimisticMessage: UserMessage & { variant?: string } = {
		id: optimisticId,
		sessionID: sessionId,
		role: "user",
		time: { created: Date.now() },
		agent: projectOptions?.agentName ?? "build",
		model: projectOptions?.model ?? { providerID: "", modelID: "" },
		variant: projectOptions?.variant,
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
	const handoff = consumeCliToProjectRuntimeHandoff(sessionId)
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
		model: projectOptions?.model
			? {
					providerID: projectOptions.model.providerID,
					modelID: projectOptions.model.modelID,
				}
			: undefined,
		agent: projectOptions?.agentName,
		variant: projectOptions?.variant,
	})
}

export type RuntimeSessionCreateRequest =
	| {
			directory: string
			title?: string
			kind?: "project"
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

const projectRuntimeSessionGateway = {
	createSession: createProjectRuntimeSession,
	async promptSession(
		directory: string,
		sessionId: string,
		text: string,
		options?: RuntimePromptOptions,
	): Promise<void> {
		await promptProjectRuntimeSession(directory, sessionId, text, options)
	},
	async abortSession(directory: string, sessionId: string): Promise<void> {
		const client = requireProjectRuntimeSessionClient(directory)
		await client.session.abort({ sessionID: sessionId })
	},
	async renameSession(
		directory: string,
		sessionId: string,
		title: string,
	): Promise<void> {
		const client = requireProjectRuntimeSessionClient(directory)
		await client.session.update({ sessionID: sessionId, title })
	},
	async deleteSession(directory: string, sessionId: string): Promise<void> {
		const client = requireProjectRuntimeSessionClient(directory)
		await client.session.delete({ sessionID: sessionId })
	},
	async revertSession(
		directory: string,
		sessionId: string,
		messageId: string,
	): Promise<void> {
		const client = requireProjectRuntimeSessionClient(directory)
		const entry = appStore.get(sessionFamily(sessionId))
		if (entry?.status?.type === "busy") {
			await client.session.abort({ sessionID: sessionId })
		}
		await client.session.revert({ sessionID: sessionId, messageID: messageId })
	},
	async unrevertSession(directory: string, sessionId: string): Promise<void> {
		const client = requireProjectRuntimeSessionClient(directory)
		await client.session.unrevert({ sessionID: sessionId })
	},
	async executeCommand(
		directory: string,
		sessionId: string,
		command: string,
		args: string,
	): Promise<void> {
		const client = requireProjectRuntimeSessionClient(directory)
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
		const client = requireProjectRuntimeSessionClient(directory)
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
		const client = requireProjectRuntimeSessionClient(directory)
		await client.part.delete({ sessionID: sessionId, messageID: messageId, partID: partId })
	},
	async forkSession(
		directory: string,
		sessionId: string,
		messageId?: string,
	): Promise<Session> {
		const client = requireProjectRuntimeSessionClient(directory)
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

		const session = await projectRuntimeSessionGateway.createSession(args.directory, args.title)
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
			return switchCliSessionIntoProjectRuntime(
				sessionId,
				projectRuntimeSessionGateway.createSession,
			)
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

		await projectRuntimeSessionGateway.promptSession(directory, sessionId, text, options)
	},
	async abortSession(directory: string, sessionId: string): Promise<void> {
		if (isCliSession(sessionId)) {
			interruptCliRuntimeTurn(sessionId)
			return
		}

		await projectRuntimeSessionGateway.abortSession(directory, sessionId)
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

		await projectRuntimeSessionGateway.renameSession(directory, sessionId, title)
	},
	async deleteSession(directory: string, sessionId: string): Promise<void> {
		if (isCliSession(sessionId)) {
			interruptCliRuntimeTurn(sessionId)
			await forgetCliRuntimeSession(sessionId)
			appStore.set(removeSessionAtom, sessionId)
			return
		}

		await projectRuntimeSessionGateway.deleteSession(directory, sessionId)
	},
	async revertSession(
		directory: string,
		sessionId: string,
		messageId: string,
	): Promise<void> {
		if (isCliSession(sessionId)) {
			throw new Error("Revert is not supported for CLI sessions")
		}

		await projectRuntimeSessionGateway.revertSession(directory, sessionId, messageId)
	},
	async unrevertSession(directory: string, sessionId: string): Promise<void> {
		if (isCliSession(sessionId)) {
			throw new Error("Undo is not supported for CLI sessions")
		}

		await projectRuntimeSessionGateway.unrevertSession(directory, sessionId)
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

		await projectRuntimeSessionGateway.executeCommand(directory, sessionId, command, args)
	},
	async summarizeSession(
		directory: string,
		sessionId: string,
		model?: { providerID: string; modelID: string },
	): Promise<void> {
		if (isCliSession(sessionId)) {
			throw new Error("Summarize is not supported for CLI sessions")
		}

		await projectRuntimeSessionGateway.summarizeSession(directory, sessionId, model)
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

		await projectRuntimeSessionGateway.deletePart(directory, sessionId, messageId, partId)
	},
	async forkSession(
		directory: string,
		sessionId: string,
		messageId?: string,
	): Promise<Session> {
		if (isCliSession(sessionId)) {
			throw new Error("Fork is not supported for CLI sessions")
		}

		return projectRuntimeSessionGateway.forkSession(directory, sessionId, messageId)
	},
}
