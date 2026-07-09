import { useAtomValue } from "jotai"
import type { PersistedModelRef } from "../atoms/preferences"
import { runtimeSelectionsAtom, setRuntimeSelectionAtom } from "../atoms/preferences"
import { cliSessionsAtom, getCliMeta, patchCliMeta, type CliSessionMeta } from "../atoms/cli-sessions"
import { appStore } from "../atoms/store"
import type { ModelRef } from "../hooks/use-project-runtime-data"
import {
	DEFAULT_SESSION_RUNTIME_ID,
	isCliRuntime,
	runtimeTransportForId,
	runtimeDescriptor,
	type SessionRuntimeId,
} from "./session-runtimes"
import { persistCliRuntimeSession } from "../services/runtime-cli-store"
import type { FileAttachment } from "./types"

export interface RuntimePromptOptions {
	runtimeId?: SessionRuntimeId
	model?: ModelRef
	agentName?: string
	variant?: string
	files?: FileAttachment[]
}

export interface ConfigurableRuntimeSelection {
	kind: "configurable-runtime"
	directory: string
	model: PersistedModelRef
}

export interface CliRuntimeSelection {
	kind: "cli"
	sessionId: string
	patch: Partial<CliSessionMeta>
	persist?: boolean
}

export type RuntimeSelectionPersistence = ConfigurableRuntimeSelection | CliRuntimeSelection

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

/**
 * True when session state is backed by agent-host process transport.
 * Prefer transport/capability checks in new code.
 *
 * @deprecated Prefer runtimeTransportForId(state.runtimeId) === "agent-host"
 */
export function isCliRuntimeState(
	state: Pick<SessionRuntimeState, "runtimeId">,
): state is SessionRuntimeState & { meta: CliSessionMeta } {
	return isCliRuntime(state.runtimeId)
}

export function sessionUsesAgentHostTransport(
	state: Pick<SessionRuntimeState, "runtimeId">,
): boolean {
	return runtimeTransportForId(state.runtimeId) === "agent-host"
}

export function cliRuntimeMeta(state: SessionRuntimeState): CliSessionMeta | null {
	return state.meta
}

export function resolvePromptRuntime(
	state: Pick<SessionRuntimeState, "runtimeId"> | null | undefined,
	options?: RuntimePromptOptions,
): SessionRuntimeId {
	return options?.runtimeId ?? state?.runtimeId ?? DEFAULT_SESSION_RUNTIME_ID
}

export function resolveConfiguredPromptOptions(
	state: Pick<SessionRuntimeState, "runtimeId"> | null | undefined,
	options?: RuntimePromptOptions,
): RuntimePromptOptions | null {
	const runtimeId = resolvePromptRuntime(state, options)
	// Managed-server adapters accept rich prompt options; process adapters use meta.
	return runtimeTransportForId(runtimeId) === "agent-host" ? null : (options ?? {})
}

export function resolveSessionRuntimeId(state: SessionRuntimeState): SessionRuntimeId {
	return state.runtimeId
}

export function sessionRuntimeCapabilities(
	state: SessionRuntimeState,
): SessionRuntimeCapabilities {
	return runtimeIdCapabilities(state.runtimeId)
}

function isConfigurableRuntimeSelection(
	selection: RuntimeSelectionPersistence,
): selection is ConfigurableRuntimeSelection {
	return selection.kind === "configurable-runtime"
}

export function readRuntimePreference(
	directory: string | null | undefined,
): PersistedModelRef | null {
	if (!directory) return null
	return appStore.get(runtimeSelectionsAtom)[directory] ?? null
}

export function useRuntimePreference(
	directory: string | null | undefined,
): PersistedModelRef | null {
	const runtimeSelections = useAtomValue(runtimeSelectionsAtom)
	if (!directory) return null
	return runtimeSelections[directory] ?? null
}

export function readSessionRuntimeState(
	sessionId: string,
	directory?: string | null,
): SessionRuntimeState {
	const meta = getCliMeta(sessionId)
	const modelPreference = readRuntimePreference(directory)
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
	const runtimeSelections = useAtomValue(runtimeSelectionsAtom)
	const meta = cliSessions[sessionId]
	const modelPreference = directory ? (runtimeSelections[directory] ?? null) : null
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

	if (isConfigurableRuntimeSelection(selection)) {
		appStore.set(setRuntimeSelectionAtom, {
			directory: selection.directory,
			model: selection.model,
		})
		return
	}

	patchSessionRuntimeState(selection.sessionId, selection.patch, selection.persist !== false)
}
