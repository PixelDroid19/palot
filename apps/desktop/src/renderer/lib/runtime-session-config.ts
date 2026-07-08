import type { PersistedModelRef } from "../atoms/preferences"
import { setProjectModelAtom } from "../atoms/preferences"
import { patchCliMeta, type CliSessionMeta } from "../atoms/cli-sessions"
import { appStore } from "../atoms/store"
import type { ModelRef } from "../hooks/use-opencode-data"
import { persistCliSession } from "../services/cli-chat"
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

	patchCliMeta(selection.sessionId, selection.patch)
	if (selection.persist !== false) {
		persistCliSession(selection.sessionId)
	}
}
