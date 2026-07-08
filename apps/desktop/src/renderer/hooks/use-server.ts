import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { connectionAtom } from "../atoms/connection"
import { createLogger } from "../lib/logger"
import type { RuntimePromptOptions } from "../lib/runtime-session-config"
import type {
	QuestionAnswer,
	Session,
} from "../lib/types"
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
import { sendRuntimePrompt } from "../services/runtime-session-prompt"

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
			try {
				await sendRuntimePrompt(directory, sessionId, text, options)
			} catch (err) {
				log.error("sendPrompt failed", { sessionId }, err)
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
