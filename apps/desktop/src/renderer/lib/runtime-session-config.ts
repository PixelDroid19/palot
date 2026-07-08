import { useAtomValue } from "jotai"
import type { PersistedModelRef } from "../atoms/preferences"
import { projectModelsAtom, setProjectModelAtom } from "../atoms/preferences"
import { cliSessionsAtom, getCliMeta, patchCliMeta, type CliSessionMeta } from "../atoms/cli-sessions"
import { appStore } from "../atoms/store"
import type { ModelRef } from "../hooks/use-project-runtime-data"
import {
	DEFAULT_SESSION_RUNTIME_ID,
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
export type SessionRuntimeMode = "project" | "cli"

export type SessionRuntimeState =
	| {
			mode: "cli"
			sessionId: string
			directory: string | null
			meta: CliSessionMeta
			modelPreference: PersistedModelRef | null
	  }
	| {
			mode: "project"
			sessionId: string
			directory: string | null
			modelPreference: PersistedModelRef | null
	  }

export interface SessionRuntimeCapabilities {
	supportsSessionRevert: boolean
	supportsSessionSummarize: boolean
	supportsServerSlashCommands: boolean
	supportsFork: boolean
	supportsProjectRuntimeConfig: boolean
	supportsWorktreeLaunch: boolean
	supportsServerHistory: boolean
}

export const PROJECT_SESSION_RUNTIME_CAPABILITIES: SessionRuntimeCapabilities = {
	supportsSessionRevert: true,
	supportsSessionSummarize: true,
	supportsServerSlashCommands: true,
	supportsFork: true,
			supportsProjectRuntimeConfig: true,
	supportsWorktreeLaunch: true,
	supportsServerHistory: true,
}

export const CLI_SESSION_RUNTIME_CAPABILITIES: SessionRuntimeCapabilities = {
	supportsSessionRevert: false,
	supportsSessionSummarize: false,
	supportsServerSlashCommands: false,
	supportsFork: false,
	supportsProjectRuntimeConfig: false,
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

export function runtimeModeCapabilities(mode: SessionRuntimeMode): SessionRuntimeCapabilities {
	return mode === "project"
		? PROJECT_SESSION_RUNTIME_CAPABILITIES
		: CLI_SESSION_RUNTIME_CAPABILITIES
}

export function isCliRuntimeState(
	state: Pick<SessionRuntimeState, "mode">,
): state is Extract<SessionRuntimeState, { mode: "cli" }> {
	return state.mode === "cli"
}

export function cliRuntimeMeta(state: SessionRuntimeState): CliSessionMeta | null {
	return isCliRuntimeState(state) ? state.meta : null
}

export function resolvePromptRuntime(
	state: Pick<SessionRuntimeState, "mode"> | null | undefined,
	options?: RuntimePromptOptions,
): SessionRuntimeMode {
	if (options?.runtime === "cli") return "cli"
	return state?.mode ?? "project"
}

export function resolveProjectRuntimePromptOptions(
	state: Pick<SessionRuntimeState, "mode"> | null | undefined,
	options?: RuntimePromptOptions,
): ProjectRuntimePromptOptions | null {
	return resolvePromptRuntime(state, options) === "cli"
		? null
		: ((options ?? {}) as ProjectRuntimePromptOptions)
}

export function resolveSessionRuntimeId(state: SessionRuntimeState): SessionRuntimeId {
	return isCliRuntimeState(state) ? state.meta.runtimeId : DEFAULT_SESSION_RUNTIME_ID
}

export function sessionRuntimeCapabilities(
	state: SessionRuntimeState,
): SessionRuntimeCapabilities {
	return runtimeIdCapabilities(resolveSessionRuntimeId(state))
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
			mode: "cli",
			sessionId,
			directory: directory ?? null,
			meta,
			modelPreference,
		}
	}
	return {
		mode: "project",
		sessionId,
		directory: directory ?? null,
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
			mode: "cli",
			sessionId,
			directory: directory ?? null,
			meta,
			modelPreference,
		}
	}
	return {
		mode: "project",
		sessionId,
		directory: directory ?? null,
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
