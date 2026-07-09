/**
 * Neutral session gateway: create / prompt / switch / lifecycle for every
 * registered runtime. Selection is by `runtimeId` → transport (from the
 * descriptor), never by product branches named "OpenCode vs CLI".
 *
 * Concrete wire protocols live only in transport adapters:
 *  - managed-server → OpenCode SDK client (one adapter implementation)
 *  - agent-host → process CLIs via IPC (Codex, Claude, …)
 */
import type { AgentSandbox } from "../../preload/api"
import { upsertMessageAtom } from "../atoms/messages"
import { upsertPartAtom } from "../atoms/parts"
import { removeSessionAtom, sessionFamily, upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import type { RuntimePromptOptions } from "../lib/runtime-session-config"
import {
	readSessionRuntimeState,
	resolveConfiguredPromptOptions,
	resolvePromptRuntime,
} from "../lib/runtime-session-config"
import {
	DEFAULT_SESSION_RUNTIME_ID,
	runtimeTransportForId,
	type SessionRuntimeId,
} from "../lib/session-runtimes"
import {
	gatewayTransportForRuntimeId,
	type RuntimeTransport,
} from "../lib/runtime-transport"
import type {
	FilePart,
	FilePartInput,
	Session,
	TextPart,
	UserMessage,
} from "../lib/types"
import { requireRuntimeSessionClient } from "./runtime-client"
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

function transportForPrompt(
	sessionId: string,
	options?: RuntimePromptOptions,
): RuntimeTransport {
	return runtimeTransportForId(resolvePromptRuntime(readSessionRuntimeState(sessionId), options))
}

function transportForSession(sessionId: string): RuntimeTransport {
	return runtimeTransportForId(readSessionRuntimeState(sessionId).runtimeId)
}

async function createManagedServerSession(
	directory: string,
	title?: string,
): Promise<Session | undefined> {
	const client = requireRuntimeSessionClient(directory)
	const result = await client.session.create({ title })
	const session = result.data as Session | undefined
	if (session) {
		appStore.set(upsertSessionAtom, { session, directory })
	}
	return session
}

async function promptManagedServerSession(
	directory: string,
	sessionId: string,
	text: string,
	options?: RuntimePromptOptions,
): Promise<void> {
	const client = requireRuntimeSessionClient(directory)
	const optimisticId = `optimistic-${Date.now()}`
	const projectOptions = resolveConfiguredPromptOptions(
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

export interface RuntimeSessionCreateRequest {
	directory: string
	runtimeId: SessionRuntimeId
	title?: string
	sandbox?: AgentSandbox
	model?: string
	effort?: string
}

export interface RuntimeSessionCreateResult {
	runtimeId: SessionRuntimeId
	sessionId: string
	session?: Session
}

/**
 * Neutral prompt payload the gateway accepts. Transport adapters map this to
 * OpenCode SDK / Codex / Claude calls.
 */
export interface NeutralRuntimePromptPayload {
	runtimeId?: SessionRuntimeId
	text: string
	model?: RuntimePromptOptions["model"]
	profile?: string
	variant?: string
	effort?: string
	permissionMode?: AgentSandbox
	files?: RuntimePromptOptions["files"]
	cwd?: string
}

interface SessionRuntimeGateway {
	promptSession(
		directory: string,
		sessionId: string,
		text: string,
		options?: RuntimePromptOptions,
	): Promise<void>
	abortSession(directory: string, sessionId: string): Promise<void>
	renameSession(directory: string, sessionId: string, title: string): Promise<void>
	deleteSession(directory: string, sessionId: string): Promise<void>
	revertSession(directory: string, sessionId: string, messageId: string): Promise<void>
	unrevertSession(directory: string, sessionId: string): Promise<void>
	executeCommand(
		directory: string,
		sessionId: string,
		command: string,
		args: string,
	): Promise<void>
	summarizeSession(
		directory: string,
		sessionId: string,
		model?: { providerID: string; modelID: string },
	): Promise<void>
	deletePart(
		directory: string,
		sessionId: string,
		messageId: string,
		partId: string,
	): Promise<void>
	forkSession(
		directory: string,
		sessionId: string,
		messageId?: string,
	): Promise<Session>
}

/** Managed local server transport (OpenCode adapter implementation). */
const managedServerGateway: SessionRuntimeGateway & {
	createSession: (directory: string, title?: string) => Promise<Session | undefined>
} = {
	createSession: createManagedServerSession,
	async promptSession(
		directory: string,
		sessionId: string,
		text: string,
		options?: RuntimePromptOptions,
	): Promise<void> {
		await promptManagedServerSession(directory, sessionId, text, options)
	},
	async abortSession(directory: string, sessionId: string): Promise<void> {
		const client = requireRuntimeSessionClient(directory)
		await client.session.abort({ sessionID: sessionId })
	},
	async renameSession(
		directory: string,
		sessionId: string,
		title: string,
	): Promise<void> {
		const client = requireRuntimeSessionClient(directory)
		await client.session.update({ sessionID: sessionId, title })
	},
	async deleteSession(directory: string, sessionId: string): Promise<void> {
		const client = requireRuntimeSessionClient(directory)
		await client.session.delete({ sessionID: sessionId })
	},
	async revertSession(
		directory: string,
		sessionId: string,
		messageId: string,
	): Promise<void> {
		const client = requireRuntimeSessionClient(directory)
		const entry = appStore.get(sessionFamily(sessionId))
		if (entry?.status?.type === "busy") {
			await client.session.abort({ sessionID: sessionId })
		}
		await client.session.revert({ sessionID: sessionId, messageID: messageId })
	},
	async unrevertSession(directory: string, sessionId: string): Promise<void> {
		const client = requireRuntimeSessionClient(directory)
		await client.session.unrevert({ sessionID: sessionId })
	},
	async executeCommand(
		directory: string,
		sessionId: string,
		command: string,
		args: string,
	): Promise<void> {
		const client = requireRuntimeSessionClient(directory)
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
		const client = requireRuntimeSessionClient(directory)
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
		const client = requireRuntimeSessionClient(directory)
		await client.part.delete({ sessionID: sessionId, messageID: messageId, partID: partId })
	},
	async forkSession(
		directory: string,
		sessionId: string,
		messageId?: string,
	): Promise<Session> {
		const client = requireRuntimeSessionClient(directory)
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

/** Agent-host process transport (Codex, Claude adapters). */
const agentHostGateway: SessionRuntimeGateway = {
	async promptSession(
		_directory: string,
		sessionId: string,
		text: string,
		options?: RuntimePromptOptions,
	): Promise<void> {
		await runCliRuntimeTurn(sessionId, text, options?.files)
	},
	async abortSession(_directory: string, sessionId: string): Promise<void> {
		interruptCliRuntimeTurn(sessionId)
	},
	async renameSession(_directory: string, sessionId: string): Promise<void> {
		persistCliRuntimeSession(sessionId)
	},
	async deleteSession(_directory: string, sessionId: string): Promise<void> {
		interruptCliRuntimeTurn(sessionId)
		await forgetCliRuntimeSession(sessionId)
		appStore.set(removeSessionAtom, sessionId)
	},
	async revertSession(): Promise<void> {
		throw new Error("Revert is not supported for this runtime")
	},
	async unrevertSession(): Promise<void> {
		throw new Error("Undo is not supported for this runtime")
	},
	async executeCommand(): Promise<void> {
		throw new Error("Slash commands are not supported for this runtime")
	},
	async summarizeSession(): Promise<void> {
		throw new Error("Summarize is not supported for this runtime")
	},
	async deletePart(): Promise<void> {
		throw new Error("Deleting parts is not supported for this runtime")
	},
	async forkSession(): Promise<Session> {
		throw new Error("Fork is not supported for this runtime")
	},
}

/** Dispatch table: transport → gateway implementation. */
const GATEWAY_BY_TRANSPORT: Record<RuntimeTransport, SessionRuntimeGateway> = {
	"managed-server": managedServerGateway,
	"agent-host": agentHostGateway,
}

function gatewayForTransport(transport: RuntimeTransport): SessionRuntimeGateway {
	return GATEWAY_BY_TRANSPORT[transport]
}

export const runtimeSessionGateway = {
	/**
	 * Create a session for the given runtimeId. Adapter selection is by
	 * transport resolved from the runtime descriptor.
	 */
	async createSession(
		args: RuntimeSessionCreateRequest,
	): Promise<RuntimeSessionCreateResult | null> {
		const transport = runtimeTransportForId(args.runtimeId)

		if (transport === "agent-host") {
			const sessionId = createCliRuntimeSessionState({
				directory: args.directory,
				runtimeId: args.runtimeId,
				sandbox: args.sandbox ?? "read-only",
				model: args.model,
				effort: args.effort,
			})
			return {
				runtimeId: args.runtimeId,
				sessionId,
			}
		}

		const session = await managedServerGateway.createSession(args.directory, args.title)
		if (!session) return null
		return {
			runtimeId: args.runtimeId || DEFAULT_SESSION_RUNTIME_ID,
			sessionId: session.id,
			session,
		}
	},

	async switchRuntimeSession(
		sessionId: string,
		targetRuntime: SessionRuntimeId,
		fallbackDirectory?: string,
	): Promise<string | null> {
		const targetTransport = runtimeTransportForId(targetRuntime)
		const currentTransport = transportForSession(sessionId)

		if (targetTransport === "managed-server" && currentTransport === "agent-host") {
			return switchCliSessionIntoProjectRuntime(
				sessionId,
				managedServerGateway.createSession,
			)
		}

		if (targetTransport === "agent-host") {
			await switchCliRuntimeSession(sessionId, targetRuntime, fallbackDirectory)
			return sessionId
		}

		// managed-server → managed-server: same transport, no session rewrite
		return sessionId
	},

	async promptSession(
		directory: string,
		sessionId: string,
		text: string,
		options?: RuntimePromptOptions,
	): Promise<void> {
		await gatewayForTransport(transportForPrompt(sessionId, options)).promptSession(
			directory,
			sessionId,
			text,
			options,
		)
	},

	/** Prompt using a fully neutral payload (adapters translate). */
	async promptNeutral(
		directory: string,
		sessionId: string,
		payload: NeutralRuntimePromptPayload,
	): Promise<void> {
		const options: RuntimePromptOptions = {
			runtimeId: payload.runtimeId,
			model: payload.model,
			agentName: payload.profile,
			variant: payload.variant,
			files: payload.files,
		}
		await this.promptSession(directory, sessionId, payload.text, options)
	},

	async abortSession(directory: string, sessionId: string): Promise<void> {
		await gatewayForTransport(transportForSession(sessionId)).abortSession(directory, sessionId)
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

		await gatewayForTransport(transportForSession(sessionId)).renameSession(
			directory,
			sessionId,
			title,
		)
	},
	async deleteSession(directory: string, sessionId: string): Promise<void> {
		await gatewayForTransport(transportForSession(sessionId)).deleteSession(directory, sessionId)
	},
	async revertSession(
		directory: string,
		sessionId: string,
		messageId: string,
	): Promise<void> {
		await gatewayForTransport(transportForSession(sessionId)).revertSession(
			directory,
			sessionId,
			messageId,
		)
	},
	async unrevertSession(directory: string, sessionId: string): Promise<void> {
		await gatewayForTransport(transportForSession(sessionId)).unrevertSession(directory, sessionId)
	},
	async executeCommand(
		directory: string,
		sessionId: string,
		command: string,
		args: string,
	): Promise<void> {
		await gatewayForTransport(transportForSession(sessionId)).executeCommand(
			directory,
			sessionId,
			command,
			args,
		)
	},
	async summarizeSession(
		directory: string,
		sessionId: string,
		model?: { providerID: string; modelID: string },
	): Promise<void> {
		await gatewayForTransport(transportForSession(sessionId)).summarizeSession(
			directory,
			sessionId,
			model,
		)
	},
	async deletePart(
		directory: string,
		sessionId: string,
		messageId: string,
		partId: string,
	): Promise<void> {
		await gatewayForTransport(transportForSession(sessionId)).deletePart(
			directory,
			sessionId,
			messageId,
			partId,
		)
	},
	async forkSession(
		directory: string,
		sessionId: string,
		messageId?: string,
	): Promise<Session> {
		return gatewayForTransport(transportForSession(sessionId)).forkSession(
			directory,
			sessionId,
			messageId,
		)
	},

	/** Which transport would handle this runtime id (descriptor-aware when loaded). */
	transportForRuntimeId(runtimeId: SessionRuntimeId): RuntimeTransport {
		return runtimeTransportForId(runtimeId)
	},

	/** Pure gateway dispatch key by runtime id (same table createSession uses before descriptors). */
	gatewayKindForRuntimeId(runtimeId: SessionRuntimeId): RuntimeTransport {
		return gatewayTransportForRuntimeId(runtimeId)
	},
}
