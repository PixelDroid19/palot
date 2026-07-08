import { useAtomValue } from "jotai"
import type { PersistedModelRef } from "../atoms/preferences"
import { projectModelsAtom, setProjectModelAtom } from "../atoms/preferences"
import { cliSessionsAtom, getCliMeta, patchCliMeta, type CliSessionMeta } from "../atoms/cli-sessions"
import { appStore } from "../atoms/store"
import type { ModelRef } from "../hooks/use-project-runtime-data"
import {
	DEFAULT_SESSION_RUNTIME_ID,
	isCliRuntime,
	runtimeDescriptor,
	type SessionRuntimeId,
} from "./session-runtimes"
import { persistCliRuntimeSession } from "../services/runtime-cli-store"
import type { FileAttachment } from "./types"

export interface CliPromptOptions {
	runtime: "cli"
	files?: FileAttachment[]
}

export interface ProjectRuntimePromptOptions {
	model?: ModelRef
	agentName?: string
	variant?: string
	files?: FileAttachment[]
}

export type RuntimePromptOptions = CliPromptOptions | ProjectRuntimePromptOptions

export interface ProjectRuntimeSelection {
	kind: "project"
	directory: string
	model: PersistedModelRef
}

export interface CliRuntimeSelection {
	kind: "cli"
	sessionId: string
	patch: Partial<CliSessionMeta>
	persist?: boolean
}

export type RuntimeSelectionPersistence = ProjectRuntimeSelection | CliRuntimeSelection

export interface SessionRuntimeState {
	sessionId: string
	directory: string | null
	runtimeId: SessionRuntimeId
	meta: CliSessionMeta | null
	modelPreference: PersistedModelRef | null
}

export interface SessionRuntimeCapabilities {
	supportsSessionRevert: boolean
	supportsSessionSummarize: boolean
	supportsServerSlashCommands: boolean
	supportsFork: boolean
	supportsRuntimeConfiguration: boolean
	supportsWorktreeLaunch: boolean
	supportsServerHistory: boolean
}

export const PROJECT_SESSION_RUNTIME_CAPABILITIES: SessionRuntimeCapabilities = {
	supportsSessionRevert: true,
	supportsSessionSummarize: true,
	supportsServerSlashCommands: true,
	supportsFork: true,
			supportsRuntimeConfiguration: true,
	supportsWorktreeLaunch: true,
	supportsServerHistory: true,
}

export const CLI_SESSION_RUNTIME_CAPABILITIES: SessionRuntimeCapabilities = {
	supportsSessionRevert: false,
	supportsSessionSummarize: false,
	supportsServerSlashCommands: false,
	supportsFork: false,
	supportsRuntimeConfiguration: false,
	supportsWorktreeLaunch: false,
	supportsServerHistory: false,
}

export function runtimeIdCapabilities(id: SessionRuntimeId): SessionRuntimeCapabilities {
	return (
		runtimeDescriptor(id)?.sessionCapabilities ??
		(id === DEFAULT_SESSION_RUNTIME_ID
			? PROJECT_SESSION_RUNTIME_CAPABILITIES
			: CLI_SESSION_RUNTIME_CAPABILITIES)
	)
}

export function isCliRuntimeState(
	state: Pick<SessionRuntimeState, "runtimeId">,
): state is SessionRuntimeState & { meta: CliSessionMeta } {
	return isCliRuntime(state.runtimeId)
}

export function cliRuntimeMeta(state: SessionRuntimeState): CliSessionMeta | null {
	return state.meta
}

export function resolvePromptRuntime(
	state: Pick<SessionRuntimeState, "runtimeId"> | null | undefined,
	options?: RuntimePromptOptions,
): SessionRuntimeId {
	if (options?.runtime === "cli" && state && isCliRuntimeState(state)) {
		return state.runtimeId
	}
	return state?.runtimeId ?? DEFAULT_SESSION_RUNTIME_ID
}

export function resolveProjectRuntimePromptOptions(
	state: Pick<SessionRuntimeState, "runtimeId"> | null | undefined,
	options?: RuntimePromptOptions,
): ProjectRuntimePromptOptions | null {
	return isCliRuntime(resolvePromptRuntime(state, options))
		? null
		: ((options ?? {}) as ProjectRuntimePromptOptions)
}

export function resolveSessionRuntimeId(state: SessionRuntimeState): SessionRuntimeId {
	return state.runtimeId
}

export function sessionRuntimeCapabilities(
	state: SessionRuntimeState,
): SessionRuntimeCapabilities {
	return runtimeIdCapabilities(state.runtimeId)
}

function isProjectRuntimeSelection(
	selection: RuntimeSelectionPersistence,
): selection is ProjectRuntimeSelection {
	return selection.kind === "project"
}

export function readProjectRuntimePreference(
	directory: string | null | undefined,
): PersistedModelRef | null {
	if (!directory) return null
	return appStore.get(projectModelsAtom)[directory] ?? null
}

export function useProjectRuntimePreference(
	directory: string | null | undefined,
): PersistedModelRef | null {
	const projectModels = useAtomValue(projectModelsAtom)
	if (!directory) return null
	return projectModels[directory] ?? null
}

export function readSessionRuntimeState(
	sessionId: string,
	directory?: string | null,
): SessionRuntimeState {
	const meta = getCliMeta(sessionId)
	const modelPreference = readProjectRuntimePreference(directory)
	if (meta) {
		return {
			sessionId,
			directory: directory ?? null,
			runtimeId: meta.runtimeId,
			meta,
			modelPreference,
		}
	}
	return {
		sessionId,
		directory: directory ?? null,
		runtimeId: DEFAULT_SESSION_RUNTIME_ID,
		meta: null,
		modelPreference,
	}
}

export function useSessionRuntimeState(
	sessionId: string,
	directory?: string | null,
): SessionRuntimeState {
	const cliSessions = useAtomValue(cliSessionsAtom)
	const projectModels = useAtomValue(projectModelsAtom)
	const meta = cliSessions[sessionId]
	const modelPreference = directory ? (projectModels[directory] ?? null) : null
	if (meta) {
		return {
			sessionId,
			directory: directory ?? null,
			runtimeId: meta.runtimeId,
			meta,
			modelPreference,
		}
	}
	return {
		sessionId,
		directory: directory ?? null,
		runtimeId: DEFAULT_SESSION_RUNTIME_ID,
		meta: null,
		modelPreference,
	}
}

export function patchSessionRuntimeState(
	sessionId: string,
	patch: Partial<CliSessionMeta>,
	persist = true,
): void {
	patchCliMeta(sessionId, patch)
	if (persist) {
		persistCliRuntimeSession(sessionId)
	}
}

export function persistRuntimeSelection(
	selection: RuntimeSelectionPersistence | null | undefined,
): void {
	if (!selection) return

	if (isProjectRuntimeSelection(selection)) {
		appStore.set(setProjectModelAtom, {
			directory: selection.directory,
			model: selection.model,
		})
		return
	}

	patchSessionRuntimeState(selection.sessionId, selection.patch, selection.persist !== false)
}
