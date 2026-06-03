/**
 * Use cases.
 *
 * Higher level pure functions / business rules that operate on commands + state
 * or prepare data for dispatch.
 *
 * Examples:
 * - validate command against current state
 * - resolve effective model (future multi-provider)
 * - build prompt payload from parts + history
 * - decide if a permission response is terminal
 * - compute next automation action from run state
 * - prepare parts, preview diffs
 *
 * These are called by adapters, harness, or host before/after bus publish.
 * Still no side effects, no providers, no UI.
 *
 * All exported have full JSDoc + examples.
 */

import type { PalotEvent } from "@palot/events"
import type { PalotCommand, PromptPart, SessionPromptCommand } from "../commands"
import type { MessageState } from "../sessions"
import type { FullCoreState } from "../state"

/** Result of command validation. */
export interface CommandValidation {
	valid: boolean
	reason?: string
}

/**
 * Validate a command can be applied in current state.
 * E.g. cannot prompt a deleted or busy session without abort.
 * Uses explicit guards, descriptive reasons. No weird fallbacks.
 *
 * @example
 * const res = validateCommand({type:"session.prompt", sessionId:"s1", parts:[...]}, state)
 * if (!res.valid) console.error(res.reason)
 */
export function validateCommand(command: PalotCommand, state: FullCoreState): CommandValidation {
	switch (command.type) {
		case "session.create": {
			if (!state.workspaces.byId[command.workspaceId]) {
				return { valid: false, reason: "workspace not found" }
			}
			return { valid: true }
		}
		case "session.prompt": {
			const s = state.sessions.sessions[command.sessionId]
			if (!s) return { valid: false, reason: "session not found" }
			if (s.status === "busy") {
				return { valid: false, reason: "session busy, abort first" }
			}
			if (command.parts.length === 0) {
				return { valid: false, reason: "prompt requires at least one part" }
			}
			return { valid: true }
		}
		case "session.abort": {
			const s = state.sessions.sessions[command.sessionId]
			if (!s) return { valid: false, reason: "session not found" }
			if (s.status !== "busy") return { valid: false, reason: "session not busy" }
			return { valid: true }
		}
		case "session.delete": {
			const s = state.sessions.sessions[command.sessionId]
			if (!s) return { valid: false, reason: "session not found" }
			return { valid: true }
		}
		case "session.rename": {
			const s = state.sessions.sessions[command.sessionId]
			if (!s) return { valid: false, reason: "session not found" }
			if (!command.title || command.title.trim() === "") {
				return { valid: false, reason: "title required" }
			}
			return { valid: true }
		}
		case "permission.respond": {
			const p = state.sessions.permissions[command.requestId]
			if (!p) return { valid: false, reason: "no such permission" }
			if (p.resolved) return { valid: false, reason: "already resolved" }
			return { valid: true }
		}
		case "question.reply":
		case "question.reject": {
			const q = state.sessions.questions[command.requestId]
			if (!q) return { valid: false, reason: "no such question" }
			if (q.resolved) return { valid: false, reason: "already resolved" }
			return { valid: true }
		}
		case "automation.run-now": {
			if (!shouldRunAutomation(command.automationId, state)) {
				return { valid: false, reason: "automation not actionable" }
			}
			return { valid: true }
		}
		case "automation.cancel-run": {
			const run = state.automations.runs[command.runId]
			if (!run) return { valid: false, reason: "no such run" }
			if (run.status !== "pending" && run.status !== "running") {
				return { valid: false, reason: "run not active" }
			}
			return { valid: true }
		}
		default:
			return { valid: true }
	}
}

/**
 * Resolve a model ref for prompt. In single-provider today just returns as-is.
 * Future: can consult settings or workspace config.
 * Always pass resolved (non-undefined) to provider prompt calls.
 *
 * @example
 * const model = resolveModelForPrompt(cmd, state) ?? defaultModel
 */
export function resolveModelForPrompt(
	command: SessionPromptCommand,
	_state: FullCoreState,
): { providerID: string; modelID: string } | undefined {
	return command.model
}

/**
 * Build a simple transcript from session messages + new prompt parts.
 * Used by adapters before calling provider prompt.
 * Returns plain serializable structure. Flattens parts for basic agents.
 * For richer, adapters can use full state.
 */
export function buildTranscriptForPrompt(
	state: FullCoreState,
	sessionId: string,
	newParts: PromptPart[],
): Array<{ role: string; content: string }> {
	const sessMsgs = state.sessions.messages[sessionId] ?? {}
	const history = Object.values(sessMsgs)
		.sort((a: MessageState, b: MessageState) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
		.map((m) => ({
			role: m.role,
			content: Object.values(m.parts)
				.map((p) => p.content ?? "")
				.join(""),
		}))
	const userTurn = {
		role: "user",
		content: newParts.map((p) => p.content ?? p.path ?? "").join("\n"),
	}
	return [...history, userTurn]
}

/**
 * Given a permission response, returns whether it should be considered final
 * for the request (always true for allow/deny here).
 * Documented default behavior at this boundary.
 */
export function isTerminalPermissionResponse(_response: unknown): boolean {
	return true
}

/**
 * Compute whether an automation run should be considered actionable now.
 * Used by validate and decideAutomationAction.
 */
export function shouldRunAutomation(runId: string, state: FullCoreState): boolean {
	const run = state.automations.runs[runId]
	return !!run && (run.status === "pending" || run.status === "running")
}

/**
 * Simple helper: create a synthetic PalotEvent for tests (typed).
 * Not for production use.
 *
 * @example
 * const evt = makeTestEvent("session.status.changed", {at:1, sessionId:"s", status:"busy"})
 */
export function makeTestEvent<T extends PalotEvent["type"]>(
	type: T,
	partial: Partial<Extract<PalotEvent, { type: T }>> & { at: number },
): Extract<PalotEvent, { type: T }> {
	return { type, ...partial } as Extract<PalotEvent, { type: T }>
}

/**
 * Prepare/normalize prompt parts (e.g. trim, ensure minimal fields).
 * Pure. Can be extended for attachment validation.
 */
export function preparePromptParts(parts: PromptPart[]): PromptPart[] {
	return parts
		.filter((p) => p.content || p.path)
		.map((p) => ({
			type: p.type,
			content: p.content?.trim(),
			path: p.path,
			mediaType: p.mediaType,
		}))
}

/**
 * Preview a diff (simple summary). For UI before apply or in chat.
 * Uses data from state diffs if present.
 */
export function previewDiffForSession(
	state: FullCoreState,
	sessionId: string,
): Array<{ filePath: string; summary: string }> {
	// Note: getDiffsForSession lives in sessions, but to avoid import cycle in use-cases
	// (state is used), we inline simple filter here. View models use the dedicated helper.
	const diffs = Object.values(state.sessions.diffs).filter((d) => d.sessionId === sessionId)
	return diffs.map((d) => ({
		filePath: d.filePath,
		summary: d.patch ? d.patch.split("\n").slice(0, 3).join("\n") : "structured hunks",
	}))
}

/**
 * Compute automation decision: whether to dispatch run-now or other.
 * Returns a suggested command or null. Finds active run for the automation.
 */
export function decideAutomationAction(
	automationId: string,
	state: FullCoreState,
): { type: "automation.run-now"; automationId: string } | null {
	const runs = Object.values(state.automations.runs).filter(
		(r) => r.automationId === automationId && (r.status === "pending" || r.status === "running"),
	)
	if (runs.length > 0) {
		return { type: "automation.run-now", automationId }
	}
	return null
}
