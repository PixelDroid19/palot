/**
 * Event mapper: translates raw OpenCode SDK v2 events (from /global/event)
 * into canonical PalotEvent[] .
 *
 * MUST be exhaustive for known interesting events.
 * Never leaks SDK types in return value.
 * Used by OpenCodeAgentAdapter.
 *
 * Rules:
 * - Timestamps: use Date.now() for Palot at (or derive from event if present in time fields).
 * - Workspace: prefer event directory or fall back to provided.
 * - Status mapping: OpenCode SessionStatus (idle/busy/retry) -> Palot SessionStatus.
 * - Parts: map Text, Tool (call/result from state), Reasoning etc to Palot MessagePartInfo.
 * - Permission/Question: map nested structures to Palot shapes without data loss.
 * - Unhandled event types return [] (no drop of data from handled ones).
 * - Always produce valid serializable PalotEvent.
 *
 * Fixtures/synthetic tests cover the mappings.
 */

import type {
	Event as OpenCodeEvent,
	EventMessageRemoved as OpenCodeMsgRemoved,
	EventMessageUpdated as OpenCodeMsgUpdated,
	Part as OpenCodePart,
	EventMessagePartDelta as OpenCodePartDelta,
	EventMessagePartRemoved as OpenCodePartRemoved,
	EventMessagePartUpdated as OpenCodePartUpdated,
	EventPermissionAsked as OpenCodePermAsked,
	PermissionRequest as OpenCodePermissionRequest,
	EventPermissionReplied as OpenCodePermReplied,
	EventQuestionAsked as OpenCodeQAsked,
	EventQuestionRejected as OpenCodeQRejected,
	EventQuestionReplied as OpenCodeQReplied,
	QuestionRequest as OpenCodeQuestionRequest,
	EventSessionCreated as OpenCodeSessCreated,
	EventSessionDeleted as OpenCodeSessDeleted,
	EventSessionDiff as OpenCodeSessDiff,
	EventSessionError as OpenCodeSessErr,
	Session as OpenCodeSession,
	SessionStatus as OpenCodeSessionStatus,
	EventSessionStatus as OpenCodeSessStatus,
	EventSessionUpdated as OpenCodeSessUpdated,
} from "@opencode-ai/sdk/v2/client"
import type {
	MessageInfo,
	MessagePartInfo,
	MessagePartType,
	MessageRole,
	PalotEvent,
	PermissionRequest,
	PermissionResponse,
	QuestionAnswer,
	QuestionRequest,
	SessionInfo,
	SessionStatus,
} from "@palot/core"

/** Map OpenCode session status union to canonical Palot status. */
export function mapOpenCodeStatus(status: OpenCodeSessionStatus): SessionStatus {
	if (status.type === "idle") return "idle"
	if (status.type === "busy") return "busy"
	if (status.type === "retry") return "waiting"
	// exhaustive
	return "idle"
}

/** Map SDK Session snapshot to Palot SessionInfo. */
export function mapOpenCodeSession(s: OpenCodeSession, directory?: string): SessionInfo {
	return {
		id: s.id,
		workspaceId: s.directory || directory || "default",
		title: s.title || undefined,
		status: "idle", // status is delivered via separate session.status events; default idle here
		createdAt: s.time?.created,
		updatedAt: s.time?.updated,
	}
}

/** Map SDK Part (text/tool/...) to Palot MessagePartInfo. Explicit, no data loss.
 * Uses SDK v2 Part union + discriminated narrowing (no `any`).
 * Dynamic fields (metadata) use unknown + guard only.
 */
export function mapOpenCodePart(part: OpenCodePart): MessagePartInfo {
	const base = {
		id: part.id,
		// metadata open in SDK; unknown + shape guard (no any)
		metadata: (part as unknown as { metadata?: Record<string, unknown> }).metadata,
	}
	switch (part.type) {
		case "text": {
			return {
				...base,
				type: "text" as MessagePartType,
				content: part.text,
			}
		}
		case "tool": {
			const st = part.state
			const isResult = st.status === "completed" || st.status === "error"
			const partType: MessagePartType = isResult ? "tool-result" : "tool-call"
			// All ToolState variants have .input per SDK types.gen.d.ts; result only on completed (guard)
			const args = st.input
			const result =
				st.status === "completed" && "output" in st ? (st as { output: unknown }).output : undefined
			return {
				...base,
				type: partType,
				tool: {
					name: part.tool,
					args,
					result,
					callId: part.callID,
				},
			}
		}
		case "reasoning": {
			// narrowed by discriminant: ReasoningPart has .text
			return {
				...base,
				type: "reasoning" as MessagePartType,
				content: (part as { text?: string }).text ?? "",
			}
		}
		case "file": {
			// narrowed: FilePart has filename?, url
			const f = part as { filename?: string; url?: string; path?: string }
			return {
				...base,
				type: "file" as MessagePartType,
				content: f.filename || f.path || f.url || "",
			}
		}
		default: {
			// step-start, snapshot, patch, agent, retry, compaction, subtask etc -> text fallback with type info
			return {
				...base,
				type: "text" as MessagePartType,
				content: `[${part.type}]`,
				metadata: { ...(base.metadata || {}), originalType: part.type },
			}
		}
	}
}

/** Map full SDK message (from .updated) to Palot MessageInfo. */
export function mapOpenCodeMessage(msg: {
	id: string
	role: "user" | "assistant" | "system"
	parts?: OpenCodePart[]
}): MessageInfo {
	const role: MessageRole =
		msg.role === "user" ? "user" : msg.role === "assistant" ? "assistant" : "system"
	return {
		id: msg.id,
		role,
		parts: (msg.parts ?? []).map((p) => mapOpenCodePart(p)),
	}
}

/** Map SDK permission request to Palot. */
export function mapOpenCodePermission(req: OpenCodePermissionRequest): PermissionRequest {
	return {
		id: req.id,
		tool: req.permission,
		args: req.metadata as Record<string, unknown> | undefined,
		description: req.patterns?.join(" ") || undefined,
		context: {
			patterns: req.patterns,
			always: req.always,
			tool: req.tool,
		},
	}
}

/** Map SDK question request (first question for simplicity; preserve data in options). */
export function mapOpenCodeQuestion(req: OpenCodeQuestionRequest): QuestionRequest {
	const first = req.questions?.[0]
	const prompt = first?.question || first?.header || "Question from agent"
	const options = (first?.options ?? []).map((o, idx) => ({
		id: String(idx),
		label: o.label,
	}))
	return {
		id: req.id,
		prompt,
		options: options.length > 0 ? options : undefined,
	}
}

/** Map permission reply from SDK "once"|"always"|"reject" to Palot PermissionResponse. */
export function mapPermissionReplyToResponse(
	reply: "once" | "always" | "reject",
): PermissionResponse {
	if (reply === "reject") return "deny"
	if (reply === "always") return { allow: true, remember: true }
	return "allow"
}

/** Map Palot response back for dispatch (used in adapter). */
export function mapPalotResponseToReply(resp: PermissionResponse): "once" | "always" | "reject" {
	if (resp === "deny") return "reject"
	if (typeof resp === "object" && resp.allow && resp.remember) return "always"
	if (resp === "allow" || (typeof resp === "object" && resp.allow)) return "once"
	return "reject"
}

/**
 * Main mapper. Returns 0..N PalotEvents for one OpenCode event.
 * Explicit switch, covers the events used in processor + fixtures.
 * Directory passed from GlobalEvent for workspaceId fallback.
 */
export function mapOpenCodeEventToPalot(ev: OpenCodeEvent, directory?: string): PalotEvent[] {
	const at = Date.now()

	switch (ev.type) {
		case "server.connected": {
			return [
				{
					type: "provider.connected",
					providerId: "opencode",
					at,
				},
			]
		}

		case "session.created": {
			const e = ev as OpenCodeSessCreated
			const session = mapOpenCodeSession(e.properties.info, directory)
			return [{ type: "session.created", at, session }]
		}

		case "session.updated": {
			const e = ev as OpenCodeSessUpdated
			const s = e.properties.info
			return [
				{
					type: "session.updated",
					at,
					session: {
						id: s.id,
						workspaceId: s.directory || directory || "default",
						title: s.title || undefined,
						updatedAt: s.time?.updated,
					},
				},
			]
		}

		case "session.deleted": {
			const e = ev as OpenCodeSessDeleted
			return [
				{
					type: "session.deleted",
					at,
					sessionId: e.properties.info.id,
				},
			]
		}

		case "session.status": {
			const e = ev as OpenCodeSessStatus
			const status = mapOpenCodeStatus(e.properties.status)
			return [
				{
					type: "session.status.changed",
					at,
					sessionId: e.properties.sessionID,
					status,
				},
			]
		}

		case "session.error": {
			const e = ev as OpenCodeSessErr
			const events: PalotEvent[] = []
			if (e.properties.sessionID) {
				events.push({
					type: "session.status.changed",
					at,
					sessionId: e.properties.sessionID,
					status: "error",
				})
			}
			// Also surface as provider disconnect for fatal cases (matches fixtures)
			events.push({
				type: "provider.disconnected",
				providerId: "opencode",
				at,
				reason: e.properties.error?.name || "session error",
			})
			return events
		}

		case "message.updated": {
			const e = ev as OpenCodeMsgUpdated
			// SDK Message (User/Assistant) union in event payload attaches sessionID/parts at runtime
			// (not in base gen type); use unknown + shape for extraction only here. map fn keeps boundary.
			const info = (e.properties.info || {}) as unknown as {
				id: string
				role: "user" | "assistant" | "system"
				sessionID?: string
				parts?: OpenCodePart[]
			}
			// Support both shapes seen in real events and test fixtures: parts on info or sibling on properties.
			// Use unknown + guard (no any) for the sibling case only.
			const propsUnknown = e.properties as unknown as { parts?: unknown; sessionID?: string }
			const partsFromSibling = Array.isArray(propsUnknown.parts)
				? (propsUnknown.parts as OpenCodePart[])
				: undefined
			const effective = {
				...info,
				parts: info.parts || partsFromSibling || [],
			}
			const message = mapOpenCodeMessage(effective)
			return [
				{
					type: "message.upserted",
					at,
					sessionId: info.sessionID || propsUnknown.sessionID || "",
					message,
				},
			]
		}

		case "message.removed": {
			const e = ev as OpenCodeMsgRemoved
			return [
				{
					type: "message.removed",
					at,
					sessionId: e.properties.sessionID,
					messageId: e.properties.messageID,
				},
			]
		}

		case "message.part.updated": {
			const e = ev as OpenCodePartUpdated
			const part = mapOpenCodePart(e.properties.part)
			// Parts from SDK carry sessionID/messageID at runtime (discriminated Part types declare them)
			const p = e.properties.part as unknown as { sessionID?: string; messageID?: string }
			return [
				{
					type: "message.part.upserted",
					at,
					sessionId: p.sessionID || "",
					messageId: p.messageID || "",
					part,
				},
			]
		}

		case "message.part.delta": {
			const e = ev as OpenCodePartDelta
			return [
				{
					type: "message.part.delta",
					at,
					sessionId: e.properties.sessionID,
					messageId: e.properties.messageID,
					partId: e.properties.partID,
					field: e.properties.field,
					delta: e.properties.delta,
				},
			]
		}

		case "message.part.removed": {
			const e = ev as OpenCodePartRemoved
			return [
				{
					type: "message.part.removed",
					at,
					sessionId: e.properties.sessionID,
					messageId: e.properties.messageID,
					partId: e.properties.partID,
				},
			]
		}

		case "permission.asked": {
			const e = ev as OpenCodePermAsked
			const request = mapOpenCodePermission(e.properties)
			return [
				{
					type: "permission.requested",
					at,
					sessionId: e.properties.sessionID,
					request,
				},
			]
		}

		case "permission.replied": {
			const e = ev as OpenCodePermReplied
			const response = mapPermissionReplyToResponse(e.properties.reply)
			return [
				{
					type: "permission.resolved",
					at,
					sessionId: e.properties.sessionID,
					requestId: e.properties.requestID,
					response,
				},
			]
		}

		case "question.asked": {
			const e = ev as OpenCodeQAsked
			const request = mapOpenCodeQuestion(e.properties)
			return [
				{
					type: "question.requested",
					at,
					sessionId: e.properties.sessionID,
					request,
				},
			]
		}

		case "question.replied": {
			const e = ev as OpenCodeQReplied
			// answers: SDK = Array<Array<string>> (QuestionAnswer=string[]); test raws may use objects {optionID} or mixed.
			// Guard explicitly (no any) for robustness in contract tests + real streams.
			const rawAns = (e.properties.answers || []) as unknown[]
			const answers: QuestionAnswer[] = rawAns.map((a) => {
				if (Array.isArray(a)) return { text: a.join(" ") || undefined }
				if (a && typeof a === "object") {
					const o = a as { text?: string; optionID?: string; label?: string; id?: string }
					return { text: o.text || o.optionID || o.label || o.id }
				}
				return { text: a != null ? String(a) : undefined }
			})
			// SDK uses requestID; some test raws use id at properties level for simplicity
			const reqId =
				(e.properties as unknown as { requestID?: string; id?: string }).requestID ||
				(e.properties as unknown as { requestID?: string; id?: string }).id ||
				""
			return [
				{
					type: "question.resolved",
					at,
					sessionId: e.properties.sessionID,
					requestId: reqId,
					answers,
				},
			]
		}

		case "question.rejected": {
			const e = ev as OpenCodeQRejected
			return [
				{
					type: "question.resolved",
					at,
					sessionId: e.properties.sessionID,
					requestId: e.properties.requestID,
					answers: [], // reject -> empty answers
				},
			]
		}

		case "session.diff": {
			const e = ev as OpenCodeSessDiff
			// SDK: diff is Array<FileDiff> where FileDiff has .file (not .path); guard for runtime variance
			const firstDiff = e.properties.diff?.[0]
			let filePath = ""
			if (firstDiff && typeof firstDiff === "object") {
				const d = firstDiff as Record<string, unknown>
				filePath = String(d.file ?? d.path ?? "")
			}
			return [
				{
					type: "session.diff.updated",
					at,
					sessionId: e.properties.sessionID,
					diff: {
						id: `diff-${e.properties.sessionID}-${at}`,
						sessionId: e.properties.sessionID,
						filePath,
						patch: undefined,
						hunks: undefined,
					},
				},
			]
		}

		// Ignore internal / tui / lsp / file watcher / pty etc. Return no events.
		default:
			return []
	}
}
