import type { Channel } from "./channels"

/**
 * Canonical Palot events.
 * All providers (OpenCode adapter, harness, future Codex/Claude) must translate
 * their native events into these serializable facts before publishing to the bus.
 * UI, core reducers, automations, and tests consume only PalotEvent.
 *
 * Events are pure data: stable ids, timestamps, no functions or provider types.
 * High-volume streams (messages/parts) support deltas + batching in the bus.
 *
 * See roadmap/core-agent-platform.md for full list and rationale.
 * Every type here should have corresponding handling in core reducers/use-cases.
 */

/**
 * Base for all events. Monotonic timestamp (ms since epoch) required.
 * Extended by all concrete *Event.
 */
export interface BaseEvent {
	type: string
	at: number
}

// ============================================================
// Supporting canonical info types (reused across events and core reducers)
// These are the platform vocabulary. Keep them minimal but complete.
// ============================================================

/** Workspace/project reference. Serializable info for discovery. */
export interface WorkspaceInfo {
	id: string
	name: string
	directory: string
}

/** Session status values used by core and adapters. */
export type SessionStatus = "idle" | "busy" | "waiting" | "error" | "aborted" | "completed"

/** Full session snapshot for lifecycle events. */
export interface SessionInfo {
	id: string
	workspaceId: string
	title?: string
	status: SessionStatus
	createdAt?: number
	updatedAt?: number
}

/** Message role in a session. */
export type MessageRole = "user" | "assistant" | "system"

/** Discriminated part types for messages and tool use. */
export type MessagePartType = "text" | "tool-call" | "tool-result" | "reasoning" | "file" | "image"

/** A single part of a message. Snapshots use this; deltas target by id/field. */
export interface MessagePartInfo {
	id: string
	type: MessagePartType
	content?: string
	/** For tool parts. */
	tool?: {
		name: string
		args?: Record<string, unknown>
		result?: unknown
		callId?: string
	}
	metadata?: Record<string, unknown>
}

/** A complete message with its current parts (upsert carries full current view). */
export interface MessageInfo {
	id: string
	role: MessageRole
	createdAt?: number
	parts: MessagePartInfo[]
}

/** Permission request surfaced to user/automation for tool approval. */
export interface PermissionRequest {
	id: string
	tool: string
	args?: Record<string, unknown>
	description?: string
	/** Optional file paths or other context. */
	context?: Record<string, unknown>
}

/** Response to a permission request. */
export type PermissionResponse =
	| "allow"
	| "deny"
	| {
			allow: boolean
			remember?: boolean
	  }

/** A question from the agent that requires free-form or choice reply. */
export interface QuestionRequest {
	id: string
	prompt: string
	/** Optional multiple choice. */
	options?: Array<{
		id: string
		label: string
	}>
}

/** Answer(s) supplied for a question. */
export interface QuestionAnswer {
	optionId?: string
	text?: string
}

/** Automation run status and details. */
export type AutomationRunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled"

export interface AutomationRunInfo {
	id: string
	automationId: string
	status: AutomationRunStatus
	sessionId?: string
	startedAt?: number
	endedAt?: number
	error?: string
}

/** Diff / patch info for file changes (used on session.diff channel). */
export interface DiffInfo {
	id: string
	sessionId: string
	filePath: string
	/** Unified diff or structured hunks. */
	patch?: string
	hunks?: Array<{
		header: string
		lines: string[]
	}>
}

// ============================================================
// Base + concrete PalotEvent types (must match core-agent-platform spec + extensions)
// All extend BaseEvent with monotonic at (ms since epoch).
// ============================================================

export interface ProviderConnectedEvent extends BaseEvent {
	type: "provider.connected"
	providerId: string
}

export interface ProviderDisconnectedEvent extends BaseEvent {
	type: "provider.disconnected"
	providerId: string
	reason?: string
}

export interface WorkspaceDiscoveredEvent extends BaseEvent {
	type: "workspace.discovered"
	workspace: WorkspaceInfo
}

export interface SessionCreatedEvent extends BaseEvent {
	type: "session.created"
	session: SessionInfo
}

export interface SessionUpdatedEvent extends BaseEvent {
	type: "session.updated"
	session: Partial<SessionInfo> & { id: string }
}

export interface SessionDeletedEvent extends BaseEvent {
	type: "session.deleted"
	sessionId: string
}

export interface SessionStatusChangedEvent extends BaseEvent {
	type: "session.status.changed"
	sessionId: string
	status: SessionStatus
}

export interface MessageUpsertedEvent extends BaseEvent {
	type: "message.upserted"
	sessionId: string
	message: MessageInfo
}

export interface MessageRemovedEvent extends BaseEvent {
	type: "message.removed"
	sessionId: string
	messageId: string
}

export interface MessagePartUpsertedEvent extends BaseEvent {
	type: "message.part.upserted"
	sessionId: string
	messageId: string
	part: MessagePartInfo
}

export interface MessagePartDeltaEvent extends BaseEvent {
	type: "message.part.delta"
	sessionId: string
	messageId: string
	partId: string
	/** e.g. "content" */
	field: string
	delta: string
}

export interface MessagePartRemovedEvent extends BaseEvent {
	type: "message.part.removed"
	sessionId: string
	messageId: string
	partId: string
}

export interface PermissionRequestedEvent extends BaseEvent {
	type: "permission.requested"
	sessionId: string
	request: PermissionRequest
}

export interface PermissionResolvedEvent extends BaseEvent {
	type: "permission.resolved"
	sessionId: string
	requestId: string
	response: PermissionResponse
}

export interface QuestionRequestedEvent extends BaseEvent {
	type: "question.requested"
	sessionId: string
	request: QuestionRequest
}

export interface QuestionResolvedEvent extends BaseEvent {
	type: "question.resolved"
	sessionId: string
	requestId: string
	answers: QuestionAnswer[]
}

export interface AutomationRunUpdatedEvent extends BaseEvent {
	type: "automation.run.updated"
	run: AutomationRunInfo
}

/** File change / patch notification on a session. Published on SESSION_DIFF channel. */
export interface SessionDiffUpdatedEvent extends BaseEvent {
	type: "session.diff.updated"
	sessionId: string
	diff: DiffInfo
}

/** Settings change fact (keyed or bulk). Core and automations react to it. */
export interface SettingsChangedEvent extends BaseEvent {
	type: "settings.changed"
	key?: string
	value?: unknown
	/** For bulk updates (e.g. full settings blob). */
	payload?: Record<string, unknown>
}

export type PalotEvent =
	| ProviderConnectedEvent
	| ProviderDisconnectedEvent
	| WorkspaceDiscoveredEvent
	| SessionCreatedEvent
	| SessionUpdatedEvent
	| SessionDeletedEvent
	| SessionStatusChangedEvent
	| MessageUpsertedEvent
	| MessageRemovedEvent
	| MessagePartUpsertedEvent
	| MessagePartDeltaEvent
	| MessagePartRemovedEvent
	| PermissionRequestedEvent
	| PermissionResolvedEvent
	| QuestionRequestedEvent
	| QuestionResolvedEvent
	| AutomationRunUpdatedEvent
	| SessionDiffUpdatedEvent
	| SettingsChangedEvent

/**
 * Envelope wraps event with its publish channel for routing and replay.
 * Used by bus and replay.
 */
export interface EventEnvelope<T extends PalotEvent = PalotEvent> {
	channel: Channel
	event: T
}
