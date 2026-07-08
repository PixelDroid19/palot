import { useAtomValue } from "jotai"
import type { PersistedModelRef } from "../atoms/preferences"
import { projectModelsAtom, setProjectModelAtom } from "../atoms/preferences"
import { cliSessionsAtom, getCliMeta, patchCliMeta, type CliSessionMeta } from "../atoms/cli-sessions"
import { appStore } from "../atoms/store"
import type { ModelRef } from "../hooks/use-opencode-data"
import {
	DEFAULT_SESSION_RUNTIME_ID,
	type SessionRuntimeId,
} from "./session-runtimes"
import { persistCliRuntimeSession } from "../services/runtime-cli-store"
import type { FileAttachment } from "./types"

export interface CliPromptOptions {
	runtime: "cli"
	files?: FileAttachment[]
}

export interface OpenCodePromptOptions {
	runtime?: "opencode"
	model?: ModelRef
	agentName?: string
	variant?: string
	files?: FileAttachment[]
}

export type RuntimePromptOptions = CliPromptOptions | OpenCodePromptOptions

export interface OpenCodeRuntimeSelection {
	runtime: "opencode"
	directory: string
	model: PersistedModelRef
}

export interface CliRuntimeSelection {
	runtime: "cli"
	sessionId: string
	patch: Partial<CliSessionMeta>
	persist?: boolean
}

export type RuntimeSelectionPersistence = OpenCodeRuntimeSelection | CliRuntimeSelection

export type SessionRuntimeState =
	| {
			runtime: "cli"
			sessionId: string
			directory: string | null
			meta: CliSessionMeta
			modelPreference: PersistedModelRef | null
	  }
	| {
			runtime: "opencode"
			sessionId: string
			directory: string | null
			modelPreference: PersistedModelRef | null
	  }

export interface SessionRuntimeCapabilities {
	supportsSessionRevert: boolean
	supportsSessionSummarize: boolean
	supportsServerSlashCommands: boolean
	supportsFork: boolean
	supportsOpenCodePromptConfig: boolean
	supportsWorktreeLaunch: boolean
	supportsServerHistory: boolean
}

export const OPENCODE_SESSION_RUNTIME_CAPABILITIES: SessionRuntimeCapabilities = {
	supportsSessionRevert: true,
	supportsSessionSummarize: true,
	supportsServerSlashCommands: true,
	supportsFork: true,
	supportsOpenCodePromptConfig: true,
	supportsWorktreeLaunch: true,
	supportsServerHistory: true,
}

export const CLI_SESSION_RUNTIME_CAPABILITIES: SessionRuntimeCapabilities = {
	supportsSessionRevert: false,
	supportsSessionSummarize: false,
	supportsServerSlashCommands: false,
	supportsFork: false,
	supportsOpenCodePromptConfig: false,
	supportsWorktreeLaunch: false,
	supportsServerHistory: false,
}

export function runtimeIdCapabilities(id: SessionRuntimeId): SessionRuntimeCapabilities {
	return id === DEFAULT_SESSION_RUNTIME_ID
		? OPENCODE_SESSION_RUNTIME_CAPABILITIES
		: CLI_SESSION_RUNTIME_CAPABILITIES
}

export function isCliRuntimeState(
	state: Pick<SessionRuntimeState, "runtime">,
): state is Extract<SessionRuntimeState, { runtime: "cli" }> {
	return state.runtime === "cli"
}

export function cliRuntimeMeta(state: SessionRuntimeState): CliSessionMeta | null {
	return isCliRuntimeState(state) ? state.meta : null
}

export function resolvePromptRuntime(
	state: Pick<SessionRuntimeState, "runtime"> | null | undefined,
	options?: RuntimePromptOptions,
): SessionRuntimeState["runtime"] {
	if (options?.runtime === "cli") return "cli"
	return state?.runtime ?? "opencode"
}

export function resolveOpenCodePromptOptions(
	state: Pick<SessionRuntimeState, "runtime"> | null | undefined,
	options?: RuntimePromptOptions,
): OpenCodePromptOptions | null {
	return resolvePromptRuntime(state, options) === "cli"
		? null
		: ((options ?? {}) as OpenCodePromptOptions)
}

export function sessionRuntimeCapabilities(
	state: Pick<SessionRuntimeState, "runtime">,
): SessionRuntimeCapabilities {
	return runtimeIdCapabilities(state.runtime)
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
			runtime: "cli",
			sessionId,
			directory: directory ?? null,
			meta,
			modelPreference,
		}
	}
	return {
		runtime: "opencode",
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
			runtime: "cli",
			sessionId,
			directory: directory ?? null,
			meta,
			modelPreference,
		}
	}
	return {
		runtime: "opencode",
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

	if (selection.runtime === "opencode") {
		appStore.set(setProjectModelAtom, {
			directory: selection.directory,
			model: selection.model,
		})
		return
	}

	patchSessionRuntimeState(selection.sessionId, selection.patch, selection.persist !== false)
}
