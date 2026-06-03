/**
 * Sessions + messages reducer (expanded).
 *
 * Pure, framework-neutral reducers over PalotEvent -> CoreState.
 * Handles:
 * - session lifecycle (create/update/delete/status)
 * - messages + parts (upsert full, deltas applied to content, remove)
 * - basic permission and question tracking (pending sets)
 *
 * State is designed to be serializable and easy to derive view models from.
 * No side effects, no provider calls, no UI.
 *
 * Other reducers (automations, settings) compose via root apply or separate.
 */

import type {
	DiffInfo,
	MessageInfo,
	MessagePartInfo,
	PalotEvent,
	PermissionRequest,
	PermissionResponse,
	QuestionAnswer,
	QuestionRequest,
	SessionStatus,
} from "@palot/events"

export interface SessionState {
	id: string
	workspaceId: string
	title?: string
	status: SessionStatus
	lastUpdated: number
}

export interface MessageState {
	id: string
	role: MessageInfo["role"]
	createdAt?: number
	parts: Record<string, MessagePartInfo> // keyed by part id for fast delta apply
}

export interface PermissionState {
	id: string
	sessionId: string
	request: PermissionRequest
	resolved?: { response: PermissionResponse; at: number }
}

export interface QuestionState {
	id: string
	sessionId: string
	request: QuestionRequest
	resolved?: { answers: QuestionAnswer[]; at: number }
}

export interface CoreState {
	sessions: Record<string, SessionState>
	messages: Record<string, Record<string, MessageState>> // sessionId -> msgId -> MessageState
	permissions: Record<string, PermissionState> // by request id
	questions: Record<string, QuestionState> // by request id
	/** Diffs keyed by diff.id (each carries its sessionId). */
	diffs: Record<string, DiffInfo>
}

export const initialCoreState: CoreState = {
	sessions: {},
	messages: {},
	permissions: {},
	questions: {},
	diffs: {},
}

// ============================================================
// Session lifecycle slice
// ============================================================

function applySessionEvent(state: CoreState, event: PalotEvent): CoreState {
	switch (event.type) {
		case "session.created": {
			const s = event.session
			return {
				...state,
				sessions: {
					...state.sessions,
					[s.id]: {
						id: s.id,
						workspaceId: s.workspaceId,
						title: s.title,
						status: s.status,
						lastUpdated: event.at,
					},
				},
				messages: { ...state.messages, [s.id]: {} },
			}
		}
		case "session.updated": {
			const s = event.session
			const existing = state.sessions[s.id]
			if (!existing) return state
			return {
				...state,
				sessions: {
					...state.sessions,
					[s.id]: {
						...existing,
						title: s.title ?? existing.title,
						status: s.status ?? existing.status,
						lastUpdated: event.at,
					},
				},
			}
		}
		case "session.status.changed": {
			const existing = state.sessions[event.sessionId]
			if (!existing) return state
			return {
				...state,
				sessions: {
					...state.sessions,
					[event.sessionId]: {
						...existing,
						status: event.status,
						lastUpdated: event.at,
					},
				},
			}
		}
		case "session.deleted": {
			const { [event.sessionId]: _s, ...restSessions } = state.sessions
			const { [event.sessionId]: _m, ...restMsgs } = state.messages
			const restDiffs = Object.fromEntries(
				Object.entries(state.diffs).filter(([, d]) => d.sessionId !== event.sessionId),
			)
			return { ...state, sessions: restSessions, messages: restMsgs, diffs: restDiffs }
		}
		default:
			return state
	}
}

// ============================================================
// Messages + parts slice (deltas applied in place for streaming efficiency)
// ============================================================

function applyMessageEvent(state: CoreState, event: PalotEvent): CoreState {
	switch (event.type) {
		case "message.upserted": {
			const { sessionId, message } = event
			const sessMsgs = state.messages[sessionId] ?? {}
			const partsMap: Record<string, MessagePartInfo> = {}
			for (const p of message.parts) {
				partsMap[p.id] = { ...p }
			}
			return {
				...state,
				messages: {
					...state.messages,
					[sessionId]: {
						...sessMsgs,
						[message.id]: {
							id: message.id,
							role: message.role,
							createdAt: message.createdAt,
							parts: partsMap,
						},
					},
				},
			}
		}
		case "message.removed": {
			const { sessionId, messageId } = event
			const sessMsgs = { ...(state.messages[sessionId] ?? {}) }
			delete sessMsgs[messageId]
			return {
				...state,
				messages: { ...state.messages, [sessionId]: sessMsgs },
			}
		}
		case "message.part.upserted": {
			const { sessionId, messageId, part } = event
			const sessMsgs = state.messages[sessionId]
			if (!sessMsgs || !sessMsgs[messageId]) return state
			return {
				...state,
				messages: {
					...state.messages,
					[sessionId]: {
						...sessMsgs,
						[messageId]: {
							...sessMsgs[messageId],
							parts: {
								...sessMsgs[messageId].parts,
								[part.id]: { ...part },
							},
						},
					},
				},
			}
		}
		case "message.part.delta": {
			const { sessionId, messageId, partId, field, delta } = event
			const sessMsgs = state.messages[sessionId]
			if (!sessMsgs || !sessMsgs[messageId]) return state
			const msg = sessMsgs[messageId]
			const part = msg.parts[partId]
			if (!part) return state
			const current = (part as unknown as Record<string, unknown>)[field] ?? ""
			const updatedPart = {
				...part,
				[field]: String(current) + delta,
			} as MessagePartInfo
			return {
				...state,
				messages: {
					...state.messages,
					[sessionId]: {
						...sessMsgs,
						[messageId]: {
							...msg,
							parts: {
								...msg.parts,
								[partId]: updatedPart,
							},
						},
					},
				},
			}
		}
		case "message.part.removed": {
			const { sessionId, messageId, partId } = event
			const sessMsgs = state.messages[sessionId]
			if (!sessMsgs || !sessMsgs[messageId]) return state
			const msg = sessMsgs[messageId]
			const { [partId]: _p, ...restParts } = msg.parts
			return {
				...state,
				messages: {
					...state.messages,
					[sessionId]: {
						...sessMsgs,
						[messageId]: { ...msg, parts: restParts },
					},
				},
			}
		}
		default:
			return state
	}
}

// ============================================================
// Permissions slice
// ============================================================

function applyPermissionEvent(state: CoreState, event: PalotEvent): CoreState {
	switch (event.type) {
		case "permission.requested": {
			const { sessionId, request } = event
			return {
				...state,
				permissions: {
					...state.permissions,
					[request.id]: {
						id: request.id,
						sessionId,
						request: { ...request },
					},
				},
			}
		}
		case "permission.resolved": {
			const { requestId, response } = event
			const existing = state.permissions[requestId]
			if (!existing) return state
			return {
				...state,
				permissions: {
					...state.permissions,
					[requestId]: {
						...existing,
						resolved: { response, at: event.at },
					},
				},
			}
		}
		default:
			return state
	}
}

// ============================================================
// Questions slice
// ============================================================

function applyQuestionEvent(state: CoreState, event: PalotEvent): CoreState {
	switch (event.type) {
		case "question.requested": {
			const { sessionId, request } = event
			return {
				...state,
				questions: {
					...state.questions,
					[request.id]: {
						id: request.id,
						sessionId,
						request: { ...request },
					},
				},
			}
		}
		case "question.resolved": {
			const { requestId, answers } = event
			const existing = state.questions[requestId]
			if (!existing) return state
			return {
				...state,
				questions: {
					...state.questions,
					[requestId]: {
						...existing,
						resolved: { answers, at: event.at },
					},
				},
			}
		}
		default:
			return state
	}
}

// ============================================================
// Diffs slice (for session.diff.updated events on SESSION_DIFF channel)
// ============================================================

function applyDiffEvent(state: CoreState, event: PalotEvent): CoreState {
	if (event.type !== "session.diff.updated") {
		return state
	}
	const { diff } = event
	return {
		...state,
		diffs: {
			...state.diffs,
			[diff.id]: { ...diff },
		},
	}
}

/**
 * Root reducer for the core session/message/permission/question/diff domain.
 * Compose the slices. Idempotent and pure. Explicit if/guards, no silent ignore
 * for unknown (falls to identity in slices).
 */
export function sessionLifecycleReducer(state: CoreState, event: PalotEvent): CoreState {
	let next = applySessionEvent(state, event)
	next = applyMessageEvent(next, event)
	next = applyPermissionEvent(next, event)
	next = applyQuestionEvent(next, event)
	next = applyDiffEvent(next, event)
	return next
}

/**
 * Helper to get ordered messages for a session (by creation or stable order).
 * Used by view models and transcript builders.
 */
export function getMessagesForSession(state: CoreState, sessionId: string): MessageState[] {
	const msgs = state.messages[sessionId] ?? {}
	return Object.values(msgs).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
}

/** List pending (unresolved) permissions for a session. */
export function getPendingPermissions(state: CoreState, sessionId: string): PermissionState[] {
	return Object.values(state.permissions).filter((p) => p.sessionId === sessionId && !p.resolved)
}

/** List pending questions for a session. */
export function getPendingQuestions(state: CoreState, sessionId: string): QuestionState[] {
	return Object.values(state.questions).filter((q) => q.sessionId === sessionId && !q.resolved)
}

/**
 * List diffs recorded for a session (from session.diff.updated events).
 * Diffs survive until session delete.
 *
 * @example
 * const diffs = getDiffsForSession(state, "s1")
 */
export function getDiffsForSession(state: CoreState, sessionId: string): DiffInfo[] {
	return Object.values(state.diffs).filter((d) => d.sessionId === sessionId)
}
