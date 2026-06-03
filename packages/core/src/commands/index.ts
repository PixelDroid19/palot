/**
 * Canonical Palot commands.
 *
 * These are the intentions emitted by any surface (React host, future Lit
 * components via DOM event adapters, automations engine, CLI, harness).
 *
 * Provider adapters (opencode, harness, ...) receive PalotCommand and translate
 * to their native calls. All outcomes are published as PalotEvent on the bus.
 *
 * Commands are serializable, carry only ids + data, no callbacks.
 * Core may validate or derive (e.g. resolve model) before dispatch.
 *
 * Reuses some info types from @palot/events for consistency (PermissionResponse,
 * QuestionAnswer, etc).
 *
 * See also CommandBus in @palot/events for dispatch.
 */

import type { PermissionResponse, QuestionAnswer } from "@palot/events"

export interface BaseCommand {
	type: string
}

/**
 * Create a new session in the given workspace.
 * Validated by use-cases to require known workspace.
 */
export interface SessionCreateCommand extends BaseCommand {
	type: "session.create"
	workspaceId: string
	title?: string
}

/** Prompt part for session.prompt. Mirrors message parts but for input. */
export interface PromptPart {
	type: "text" | "file" | "image"
	content?: string
	path?: string
	mediaType?: string
}

/**
 * Send a prompt (or continuation) to a session.
 * model is the resolved {providerID, modelID}. Never rely on server default.
 * parts prepared via use-case preparePromptParts.
 */
export interface SessionPromptCommand extends BaseCommand {
	type: "session.prompt"
	sessionId: string
	parts: PromptPart[]
	model?: { providerID: string; modelID: string }
	agent?: string
	variant?: string
	/** Permission ruleset if overriding defaults for this turn. */
	permission?: unknown
}

/** Abort the current generation for a session. */
export interface SessionAbortCommand extends BaseCommand {
	type: "session.abort"
	sessionId: string
}

/** Delete a session and its history. */
export interface SessionDeleteCommand extends BaseCommand {
	type: "session.delete"
	sessionId: string
}

/** Rename a session title. */
export interface SessionRenameCommand extends BaseCommand {
	type: "session.rename"
	sessionId: string
	title: string
}

/** Respond to a pending permission request. */
export interface PermissionRespondCommand extends BaseCommand {
	type: "permission.respond"
	sessionId: string
	requestId: string
	response: PermissionResponse
}

/** Reply to a pending question (provide answers). */
export interface QuestionReplyCommand extends BaseCommand {
	type: "question.reply"
	requestId: string
	answers: QuestionAnswer[]
}

/** Reject / cancel a pending question without answers. */
export interface QuestionRejectCommand extends BaseCommand {
	type: "question.reject"
	requestId: string
}

/** Trigger an automation to run now (outside schedule). */
export interface AutomationRunNowCommand extends BaseCommand {
	type: "automation.run-now"
	automationId: string
}

/** Cancel a running automation run. */
export interface AutomationCancelRunCommand extends BaseCommand {
	type: "automation.cancel-run"
	runId: string
}

/** Change a setting value (persisted by shell, core may react). */
export interface SettingsSetCommand extends BaseCommand {
	type: "settings.set"
	key: string
	value: unknown
}

/** Select/switch the active provider (for multi-adapter future). */
export interface ProviderSelectCommand extends BaseCommand {
	type: "provider.select"
	providerId: string
}

/** Refresh workspace discovery. */
export interface WorkspaceRefreshCommand extends BaseCommand {
	type: "workspace.refresh"
}

export type PalotCommand =
	| SessionCreateCommand
	| SessionPromptCommand
	| SessionAbortCommand
	| SessionDeleteCommand
	| SessionRenameCommand
	| PermissionRespondCommand
	| QuestionReplyCommand
	| QuestionRejectCommand
	| AutomationRunNowCommand
	| AutomationCancelRunCommand
	| SettingsSetCommand
	| ProviderSelectCommand
	| WorkspaceRefreshCommand
