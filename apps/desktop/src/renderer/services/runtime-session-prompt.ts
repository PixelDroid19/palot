import { upsertMessageAtom } from "../atoms/messages"
import { upsertPartAtom } from "../atoms/parts"
import { appStore } from "../atoms/store"
import { createLogger } from "../lib/logger"
import type { RuntimePromptOptions } from "../lib/runtime-session-config"
import { readSessionRuntimeState } from "../lib/runtime-session-config"
import {
	type FilePart,
	type FilePartInput,
	type TextPart,
	type UserMessage,
} from "../lib/types"
import { getProjectClient } from "./connection-manager"
import {
	consumeCliToOpenCodeHandoff,
	runCliRuntimeTurn,
} from "./runtime-cli-turns"

const log = createLogger("runtime-session-prompt")

export async function sendRuntimePrompt(
	directory: string,
	sessionId: string,
	text: string,
	options?: RuntimePromptOptions,
): Promise<void> {
	const storedRuntime = readSessionRuntimeState(sessionId).runtime
	log.debug("sendPrompt called", {
		directory,
		sessionId,
		textLength: text.length,
		runtime: options?.runtime ?? storedRuntime,
		agent: options?.runtime === "cli" ? undefined : options?.agentName,
		model: options?.runtime === "cli" ? undefined : options?.model,
		variant: options?.runtime === "cli" ? undefined : options?.variant,
		hasFiles: !!(options?.files && options.files.length > 0),
	})

	if (options?.runtime === "cli" || storedRuntime === "cli") {
		await runCliRuntimeTurn(sessionId, text, options?.files)
		return
	}

	const openCodeOptions = options
	const client = getProjectClient(directory)
	if (!client) {
		log.error("sendPrompt: no client for directory", { directory })
		throw new Error("Not connected to OpenCode server")
	}
	log.debug("sendPrompt: got client", { directory })

	const optimisticId = `optimistic-${Date.now()}`
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
	log.debug("sendPrompt: optimistic message set", { optimisticId })

	const optimisticTextPart: TextPart = {
		id: `${optimisticId}-text`,
		sessionID: sessionId,
		messageID: optimisticId,
		type: "text",
		text,
	}
	appStore.set(upsertPartAtom, optimisticTextPart)

	const files = options?.files ?? []
	for (let i = 0; i < files.length; i++) {
		const file = files[i]
		const optimisticFilePart: FilePart = {
			id: `${optimisticId}-file-${i}`,
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

	log.debug("sendPrompt: calling promptAsync", {
		sessionId,
		agent: openCodeOptions?.agentName,
		model: openCodeOptions?.model,
		partsCount: parts.length,
	})
	try {
		const result = await client.session.promptAsync({
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
		log.debug("sendPrompt: promptAsync returned", {
			sessionId,
			result: JSON.stringify(result).slice(0, 200),
		})
	} catch (err) {
		log.error("sendPrompt: promptAsync failed", { sessionId, agent: openCodeOptions?.agentName }, err)
		throw err
	}
}
