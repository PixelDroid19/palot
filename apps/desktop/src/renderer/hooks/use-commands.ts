import { useAtomValue } from "jotai"
import { useCallback, useMemo } from "react"
import { messagesFamily } from "../atoms/messages"
import { partsFamily } from "../atoms/parts"
import { sessionFamily } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import {
	sessionRuntimeCapabilities,
	useSessionRuntimeState,
} from "../lib/runtime-session-config"
import type { Session, TextPart } from "../lib/types"
import {
	executeRuntimeCommand,
	revertRuntimeSession,
	summarizeRuntimeSession,
	unrevertRuntimeSession,
} from "../services/runtime-session-actions"
import { useServerCommands } from "./use-opencode-data"

// ============================================================
// Types
// ============================================================

export interface AppCommand {
	name: string
	label: string
	description: string
	enabled: boolean
	shortcut?: string
	execute: () => Promise<void>
	source: "client" | "server"
}

// ============================================================
// useSessionRevert — undo/redo logic
// ============================================================

function findUndoTarget(sessionId: string, revertMessageId?: string): string | null {
	const messages = appStore.get(messagesFamily(sessionId))
	if (!messages || messages.length === 0) return null

	let lastUserMsgId: string | null = null
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i]
		if (msg.role !== "user") continue
		if (revertMessageId && msg.id >= revertMessageId) continue
		lastUserMsgId = msg.id
		break
	}
	return lastUserMsgId
}

function findRedoTarget(sessionId: string, revertMessageId: string): string | null {
	const messages = appStore.get(messagesFamily(sessionId))
	if (!messages) return null

	let foundRevertPoint = false
	for (const msg of messages) {
		if (msg.id === revertMessageId) {
			foundRevertPoint = true
			continue
		}
		if (foundRevertPoint && msg.role === "user") {
			return msg.id
		}
	}
	return null
}

function getUserMessageText(messageId: string): string {
	const parts = appStore.get(partsFamily(messageId))
	if (!parts) return ""
	return parts
		.filter((p): p is TextPart => p.type === "text" && !("synthetic" in p && p.synthetic))
		.map((p) => p.text)
		.join("\n")
}

export interface UseSessionRevertResult {
	isReverted: boolean
	revertInfo: Session["revert"] | undefined
	canUndo: boolean
	canRedo: boolean
	undo: () => Promise<string | undefined>
	redo: () => Promise<void>
	revertToMessage: (messageId: string) => Promise<void>
}

export function useSessionRevert(
	directory: string | null,
	sessionId: string | null,
): UseSessionRevertResult {
	const entry = useAtomValue(sessionFamily(sessionId ?? ""))
	const runtimeState = useSessionRuntimeState(sessionId ?? "", directory)
	const capabilities = sessionRuntimeCapabilities(runtimeState)
	const session = entry?.session
	const messages = useAtomValue(messagesFamily(sessionId ?? ""))

	const isReverted = !!session?.revert
	const revertInfo = session?.revert

	const canUndo = useMemo(() => {
		if (!capabilities.supportsSessionRevert) return false
		if (!directory || !sessionId || !messages || messages.length === 0) return false
		const target = findUndoTarget(sessionId, revertInfo?.messageID)
		return target !== null
	}, [capabilities.supportsSessionRevert, directory, sessionId, messages, revertInfo])

	const canRedo = capabilities.supportsSessionRevert && isReverted

	const undo = useCallback(async (): Promise<string | undefined> => {
		if (!capabilities.supportsSessionRevert) return undefined
		if (!directory || !sessionId) return undefined

		const targetId = findUndoTarget(sessionId, revertInfo?.messageID)
		if (!targetId) return undefined

		const userText = getUserMessageText(targetId)
		await revertRuntimeSession(directory, sessionId, targetId)
		return userText
	}, [capabilities.supportsSessionRevert, directory, sessionId, revertInfo])

	const redo = useCallback(async () => {
		if (!capabilities.supportsSessionRevert) return
		if (!directory || !sessionId || !revertInfo) return

		const nextTarget = findRedoTarget(sessionId, revertInfo.messageID)
		if (nextTarget) {
			await revertRuntimeSession(directory, sessionId, nextTarget)
		} else {
			await unrevertRuntimeSession(directory, sessionId)
		}
	}, [capabilities.supportsSessionRevert, directory, sessionId, revertInfo])

	const revertToMessage = useCallback(
		async (messageId: string) => {
			if (!capabilities.supportsSessionRevert) return
			if (!directory || !sessionId) return
			await revertRuntimeSession(directory, sessionId, messageId)
		},
		[capabilities.supportsSessionRevert, directory, sessionId],
	)

	return { isReverted, revertInfo, canUndo, canRedo, undo, redo, revertToMessage }
}

// ============================================================
// useCommands — unified command registry
// ============================================================

export function useCommands(
	directory: string | null,
	sessionId: string | null,
	options?: {
		onUndoTextRestore?: (text: string) => void
	},
): AppCommand[] {
	const { canUndo, canRedo, undo, redo } = useSessionRevert(directory, sessionId)
	const runtimeState = useSessionRuntimeState(sessionId ?? "", directory)
	const capabilities = sessionRuntimeCapabilities(runtimeState)
	const serverCommands = useServerCommands(
		capabilities.supportsServerSlashCommands ? directory : null,
	)
	const entry = useAtomValue(sessionFamily(sessionId ?? ""))
	const sessionStatus = entry?.status
	const isIdle = sessionStatus?.type === "idle" || !sessionStatus

	const clientCommands = useMemo<AppCommand[]>(() => {
		const cmds: AppCommand[] = []

		cmds.push({
			name: "undo",
			label: "Undo",
			description: "Undo the last turn and restore file changes",
			enabled: canUndo,
			shortcut: "⌘Z",
			source: "client",
			execute: async () => {
				const text = await undo()
				if (text && options?.onUndoTextRestore) {
					options.onUndoTextRestore(text)
				}
			},
		})

		cmds.push({
			name: "redo",
			label: "Redo",
			description: "Restore previously undone messages",
			enabled: canRedo,
			shortcut: "⇧⌘Z",
			source: "client",
			execute: async () => {
				await redo()
			},
		})

		cmds.push({
			name: "compact",
			label: "Compact",
			description: "Summarize the conversation to save context",
			enabled: capabilities.supportsSessionSummarize && !!directory && !!sessionId && isIdle,
			source: "client",
			execute: async () => {
				if (!directory || !sessionId) return
				await summarizeRuntimeSession(directory, sessionId)
			},
		})

		return cmds
	}, [
		canUndo,
		canRedo,
		undo,
		redo,
		directory,
		sessionId,
		isIdle,
		options?.onUndoTextRestore,
		options,
	])

	const allCommands = useMemo<AppCommand[]>(() => {
		const serverCmds: AppCommand[] = serverCommands.map((cmd) => ({
			name: cmd.name,
			label: cmd.name.charAt(0).toUpperCase() + cmd.name.slice(1),
			description: cmd.description ?? `Run /${cmd.name}`,
			enabled: capabilities.supportsServerSlashCommands && !!directory && !!sessionId && isIdle,
			source: "server" as const,
			execute: async () => {
				if (!directory || !sessionId) return
				await executeRuntimeCommand(directory, sessionId, cmd.name, "")
			},
		}))
		return [...clientCommands, ...serverCmds]
	}, [capabilities.supportsServerSlashCommands, clientCommands, serverCommands, directory, sessionId, isIdle])

	return allCommands
}
