import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { connectionAtom } from "../atoms/connection"
import { upsertMessageAtom } from "../atoms/messages"
import { upsertPartAtom } from "../atoms/parts"
import { appStore } from "../atoms/store"
import { createLogger } from "../lib/logger"
import type { RuntimePromptOptions } from "../lib/runtime-session-config"
import { readSessionRuntimeState } from "../lib/runtime-session-config"
import {
	consumeCliToOpenCodeHandoff,
	runCliRuntimeTurn,
} from "../services/runtime-cli-turns"
import type {
	FilePart,
	FilePartInput,
	QuestionAnswer,
	Session,
	TextPart,
	UserMessage,
} from "../lib/types"
import { getProjectClient } from "../services/connection-manager"
import {
	abortRuntimeSession,
	deleteRuntimePart,
	deleteRuntimeSession,
	executeRuntimeCommand,
	forkRuntimeSession,
	rejectOpenCodeQuestion,
	renameRuntimeSession,
	revertRuntimeSession,
	replyOpenCodeQuestion,
	respondOpenCodePermission,
	summarizeRuntimeSession,
	unrevertRuntimeSession,
} from "../services/runtime-session-actions"
import { createOpenCodeSession } from "../services/runtime-session-launch"

const log = createLogger("use-server")

/**
 * Hook for OpenCode server connection state.
 */
export function useServerConnection() {
	const conn = useAtomValue(connectionAtom)
	return {
		connected: conn.connected,
		url: conn.url,
	}
}

/**
 * Hook for agent actions (stop, approve, deny, etc.).
 */
export function useAgentActions() {
	const abort = useCallback(async (directory: string, sessionId: string) => {
		log.debug("abort", { sessionId })
		try {
			await abortRuntimeSession(directory, sessionId)
		} catch (err) {
			log.error("abort failed", { sessionId }, err)
			throw err
		}
	}, [])

	const sendPrompt = useCallback(
		async (
			directory: string,
			sessionId: string,
			text: string,
			options?: RuntimePromptOptions,
		) => {
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

			// CLI-backed sessions run through the agent runtime, not the OpenCode client.
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

			// Optimistic user message — include variant so it's available when
			// re-initializing the session's toolbar state (the v1 UserMessage type
			// doesn't have variant but the server stores it on user messages).
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

			// Optimistic text part
			const optimisticTextPart: TextPart = {
				id: `${optimisticId}-text`,
				sessionID: sessionId,
				messageID: optimisticId,
				type: "text",
				text,
			}
			appStore.set(upsertPartAtom, optimisticTextPart)

			// Optimistic file parts
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

			// Build parts array for the API call. A runtime switch (CLI → OpenCode)
			// leaves a one-shot history block that rides with the first prompt.
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
		},
		[],
	)

	const createSession = useCallback(async (directory: string, title?: string) => {
		log.debug("createSession", { directory, title })
		try {
			const session = await createOpenCodeSession(directory, title)
			log.debug("createSession succeeded", { sessionId: session?.id })
			return session
		} catch (err) {
			log.error("createSession failed", { directory, title }, err)
			throw err
		}
	}, [])

	const renameSession = useCallback(async (directory: string, sessionId: string, title: string) => {
		log.debug("renameSession", { sessionId, title })

		try {
			await renameRuntimeSession(directory, sessionId, title)
		} catch (err) {
			log.error("renameSession failed", { sessionId, title }, err)
			throw err
		}
	}, [])

	const deleteSession = useCallback(async (directory: string, sessionId: string) => {
		log.debug("deleteSession", { sessionId })
		try {
			await deleteRuntimeSession(directory, sessionId)
		} catch (err) {
			log.error("deleteSession failed", { sessionId }, err)
			throw err
		}
	}, [])

	const respondToPermission = useCallback(
		async (
			directory: string,
			sessionId: string,
			permissionId: string,
			response: "once" | "always" | "reject",
		) => {
			log.debug("respondToPermission", { sessionId, permissionId, response })
			try {
				await respondOpenCodePermission(directory, sessionId, permissionId, response)
			} catch (err) {
				log.error("respondToPermission failed", { sessionId, permissionId, response }, err)
				throw err
			}
		},
		[],
	)

	const replyToQuestion = useCallback(
		async (directory: string, requestId: string, answers: QuestionAnswer[]) => {
			log.debug("replyToQuestion", { requestId })
			try {
				await replyOpenCodeQuestion(directory, requestId, answers)
			} catch (err) {
				log.error("replyToQuestion failed", { requestId }, err)
				throw err
			}
		},
		[],
	)

	const rejectQuestion = useCallback(async (directory: string, requestId: string) => {
		log.debug("rejectQuestion", { requestId })
		try {
			await rejectOpenCodeQuestion(directory, requestId)
		} catch (err) {
			log.error("rejectQuestion failed", { requestId }, err)
			throw err
		}
	}, [])

	const revert = useCallback(async (directory: string, sessionId: string, messageId: string) => {
		log.debug("revert", { sessionId, messageId })
		try {
			await revertRuntimeSession(directory, sessionId, messageId)
		} catch (err) {
			log.error("revert failed", { sessionId, messageId }, err)
			throw err
		}
	}, [])

	const unrevert = useCallback(async (directory: string, sessionId: string) => {
		log.debug("unrevert", { sessionId })
		try {
			await unrevertRuntimeSession(directory, sessionId)
		} catch (err) {
			log.error("unrevert failed", { sessionId }, err)
			throw err
		}
	}, [])

	const executeCommand = useCallback(
		async (directory: string, sessionId: string, command: string, args: string) => {
			log.debug("executeCommand", { sessionId, command })
			try {
				await executeRuntimeCommand(directory, sessionId, command, args)
			} catch (err) {
				log.error("executeCommand failed", { sessionId, command }, err)
				throw err
			}
		},
		[],
	)

	const summarize = useCallback(async (directory: string, sessionId: string) => {
		log.debug("summarize", { sessionId })
		try {
			await summarizeRuntimeSession(directory, sessionId)
		} catch (err) {
			log.error("summarize failed", { sessionId }, err)
			throw err
		}
	}, [])

	const deletePart = useCallback(
		async (directory: string, sessionId: string, messageId: string, partId: string) => {
			log.debug("deletePart", { sessionId, messageId, partId })
			try {
				await deleteRuntimePart(directory, sessionId, messageId, partId)
			} catch (err) {
				log.error("deletePart failed", { sessionId, messageId, partId }, err)
				throw err
			}
		},
		[],
	)

	const forkSession = useCallback(
		async (directory: string, sessionId: string, messageId?: string): Promise<Session> => {
			log.debug("forkSession", { sessionId, messageId })
			try {
				const session = await forkRuntimeSession(directory, sessionId, messageId)
				log.debug("forkSession succeeded", { forkedSessionId: session?.id })
				return session
			} catch (err) {
				log.error("forkSession failed", { sessionId, messageId }, err)
				throw err
			}
		},
		[],
	)

	return {
		abort,
		sendPrompt,
		createSession,
		renameSession,
		deleteSession,
		deletePart,
		respondToPermission,
		replyToQuestion,
		rejectQuestion,
		revert,
		unrevert,
		executeCommand,
		summarize,
		forkSession,
	}
}
