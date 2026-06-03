/**
 * Palot Agent Harness - fully deterministic local provider for functional tests.
 *
 * Simulates the full range of provider behaviors behind the AgentProviderAdapter
 * contract (and directly on the bus for E2E harness flows):
 * - workspaces, sessions, create/prompt/stream/complete
 * - tool calls, diffs
 * - permission requests + replies
 * - questions + replies/rejects
 * - errors, reconnects, concurrent sessions, automation runs
 * - abort, status changes to idle
 *
 * All publishes use real PalotEvent on the correct CHANNELS (see @palot/events).
 * Tests drive via simulate* methods; harness is pure + sync for determinism.
 *
 * Does not depend on React/Electron/provider SDKs.
 */

import type { PalotEvent } from "@palot/events"
import { CHANNELS, type Channel, type EventBus, InMemoryEventBus } from "@palot/events"

export interface HarnessOptions {
	/** Optional shared bus (for wiring with core replay etc). Defaults to fresh InMemory. */
	bus?: EventBus
}

export interface Harness {
	/** The underlying bus. Subscribe/publish here or use simulate helpers. */
	bus: EventBus

	/** Low level: publish any event (chooses best channel automatically). */
	emit(event: PalotEvent): void

	/** Reset internal sim state + bus recording. */
	reset(): void

	// --- simulation drivers (publish canonical PalotEvents on correct channels) ---

	simulateWorkspaceDiscovered(workspace: { id: string; name: string; directory: string }): void

	simulateSessionCreated(session: {
		id: string
		workspaceId: string
		title?: string
		status?: "idle" | "busy"
	}): void

	/**
	 * Simulate a prompt flow: creates/updates messages + emits part deltas + status busy->idle.
	 * parts can be array of {id, type, content?} or deltas for streaming sim.
	 */
	simulatePrompt(
		sessionId: string,
		parts: Array<{ id: string; type: string; content?: string; delta?: string }>,
	): void

	simulatePermissionRequest(
		sessionId: string,
		request: { id: string; tool: string; args?: Record<string, unknown>; description?: string },
	): void

	/** Simulate user/automation responding; emits resolved on permissions channel. */
	replyToPermission(
		sessionId: string,
		requestId: string,
		response: "allow" | "deny" | { allow: boolean; remember?: boolean },
	): void

	simulateQuestionRequest(
		sessionId: string,
		request: { id: string; prompt: string; options?: Array<{ id: string; label: string }> },
	): void

	replyToQuestion(requestId: string, answers: Array<{ optionId?: string; text?: string }>): void

	simulateToolCall(
		sessionId: string,
		messageId: string,
		toolPart: { id: string; name: string; args?: Record<string, unknown> },
	): void

	simulateDiff(sessionId: string, diff: { id: string; filePath: string; patch?: string }): void

	simulateError(sessionId: string, reason?: string): void

	/** Simulate provider disconnect + reconnect events. */
	simulateReconnect(providerId?: string): void

	/** Force a session to idle (completion). */
	simulateCompletion(sessionId: string): void

	/** Simulate automation run lifecycle. */
	simulateAutomationRun(run: {
		id: string
		automationId: string
		status: "pending" | "running" | "succeeded" | "failed" | "cancelled"
		sessionId?: string
	}): void

	/** For concurrent tests: create N sessions quickly. */
	simulateConcurrentSessions(count: number, baseWorkspaceId: string): string[]
}

function pickChannelForEvent(event: PalotEvent): Channel {
	switch (event.type) {
		case "provider.connected":
		case "provider.disconnected":
			return CHANNELS.PROVIDER_CONNECTION
		case "workspace.discovered":
			return CHANNELS.WORKSPACE_DISCOVERY
		case "session.created":
		case "session.updated":
		case "session.deleted":
		case "session.status.changed":
			return CHANNELS.SESSION_LIFECYCLE
		case "message.upserted":
		case "message.removed":
		case "message.part.upserted":
		case "message.part.delta":
		case "message.part.removed":
			return CHANNELS.SESSION_MESSAGES
		case "permission.requested":
		case "permission.resolved":
			return CHANNELS.SESSION_PERMISSIONS
		case "question.requested":
		case "question.resolved":
			return CHANNELS.SESSION_QUESTIONS
		case "session.diff.updated":
			return CHANNELS.SESSION_DIFF
		case "automation.run.updated":
			return CHANNELS.AUTOMATION_RUNS
		case "settings.changed":
			return CHANNELS.SETTINGS_CHANGED
		default:
			return CHANNELS.SESSION_LIFECYCLE
	}
}

export function createHarness(opts: HarnessOptions = {}): Harness {
	const bus = opts.bus ?? new InMemoryEventBus()
	// ensure coalescer for deltas like prod
	bus.setCoalescer?.((e) => e) // identity for harness determinism; tests can set own

	const simulatedSessions = new Set<string>()
	const simulatedWorkspaces = new Set<string>()

	function emit(event: PalotEvent): void {
		const ch = pickChannelForEvent(event)
		// biome-ignore lint/suspicious/noExplicitAny: channel is canonical literal
		bus.publish(ch as any, event)
	}

	function reset(): void {
		simulatedSessions.clear()
		simulatedWorkspaces.clear()
		bus.clearRecorded()
	}

	// Public API
	const harness: Harness = {
		bus,
		emit,
		reset,

		simulateWorkspaceDiscovered(ws) {
			if (!simulatedWorkspaces.has(ws.id)) simulatedWorkspaces.add(ws.id)
			emit({
				type: "workspace.discovered",
				at: Date.now(),
				workspace: { id: ws.id, name: ws.name, directory: ws.directory },
			})
		},

		simulateSessionCreated(sess) {
			simulatedSessions.add(sess.id)
			emit({
				type: "session.created",
				at: Date.now(),
				session: {
					id: sess.id,
					workspaceId: sess.workspaceId,
					title: sess.title,
					// biome-ignore lint/suspicious/noExplicitAny: status union normalize for sim
					status: (sess.status ?? "idle") as any,
				},
			})
		},

		simulatePrompt(sessionId, parts) {
			const now = Date.now()
			// ensure session exists
			if (!simulatedSessions.has(sessionId)) {
				harness.simulateSessionCreated({ id: sessionId, workspaceId: "default", status: "busy" })
			}
			// status busy
			emit({ type: "session.status.changed", at: now, sessionId, status: "busy" })

			// user message stub if first
			const userMsgId = `m-user-${sessionId}`
			emit({
				type: "message.upserted",
				at: now + 1,
				sessionId,
				message: {
					id: userMsgId,
					role: "user",
					parts: [{ id: "p-user", type: "text", content: "prompt" }],
				},
			})

			// assistant message + parts/deltas
			const assistantMsgId = `m-assist-${sessionId}`
			emit({
				type: "message.upserted",
				at: now + 2,
				sessionId,
				message: { id: assistantMsgId, role: "assistant", parts: [] },
			})

			for (const [i, p] of parts.entries()) {
				const partId = p.id || `p-${i}`
				if (p.delta) {
					emit({
						type: "message.part.delta",
						at: now + 10 + i,
						sessionId,
						messageId: assistantMsgId,
						partId,
						field: "content",
						delta: p.delta,
					})
				} else {
					emit({
						type: "message.part.upserted",
						at: now + 10 + i,
						sessionId,
						messageId: assistantMsgId,
						part: {
							id: partId,
							// biome-ignore lint/suspicious/noExplicitAny: part type in sim input
							type: (p.type as any) || "text",
							content: p.content,
						},
					})
				}
			}

			// finish idle
			emit({ type: "session.status.changed", at: now + 100, sessionId, status: "idle" })
		},

		simulatePermissionRequest(sessionId, req) {
			emit({
				type: "permission.requested",
				at: Date.now(),
				sessionId,
				request: { id: req.id, tool: req.tool, args: req.args, description: req.description },
			})
		},

		replyToPermission(sessionId, requestId, response) {
			emit({
				type: "permission.resolved",
				at: Date.now(),
				sessionId,
				requestId,
				response,
			})
		},

		simulateQuestionRequest(sessionId, req) {
			emit({
				type: "question.requested",
				at: Date.now(),
				sessionId,
				request: { id: req.id, prompt: req.prompt, options: req.options },
			})
		},

		replyToQuestion(requestId, answers) {
			emit({
				type: "question.resolved",
				at: Date.now(),
				sessionId: "unknown-in-harness", // tests usually don't care; override via direct emit if needed
				requestId,
				answers,
			})
		},

		simulateToolCall(sessionId, messageId, toolPart) {
			emit({
				type: "message.part.upserted",
				at: Date.now(),
				sessionId,
				messageId,
				part: {
					id: toolPart.id,
					type: "tool-call",
					tool: { name: toolPart.name, args: toolPart.args },
				},
			})
		},

		simulateDiff(sessionId, d) {
			emit({
				type: "session.diff.updated",
				at: Date.now(),
				sessionId,
				diff: { id: d.id, sessionId, filePath: d.filePath, patch: d.patch },
			})
		},

		simulateError(sessionId, reason) {
			emit({ type: "session.status.changed", at: Date.now(), sessionId, status: "error" })
			emit({
				type: "provider.disconnected",
				providerId: "harness",
				at: Date.now(),
				reason: reason || "simulated error",
			})
		},

		simulateReconnect(providerId = "harness") {
			emit({ type: "provider.disconnected", providerId, at: Date.now(), reason: "sim reconnect" })
			emit({ type: "provider.connected", providerId, at: Date.now() + 5 })
		},

		simulateCompletion(sessionId) {
			emit({ type: "session.status.changed", at: Date.now(), sessionId, status: "idle" })
		},

		simulateAutomationRun(run) {
			emit({
				type: "automation.run.updated",
				at: Date.now(),
				run: {
					id: run.id,
					automationId: run.automationId,
					status: run.status,
					sessionId: run.sessionId,
				},
			})
		},

		simulateConcurrentSessions(count, baseWorkspaceId) {
			const ids: string[] = []
			for (let i = 0; i < count; i++) {
				const id = `concurrent-${Date.now()}-${i}`
				ids.push(id)
				harness.simulateSessionCreated({ id, workspaceId: baseWorkspaceId, title: `c${i}` })
			}
			return ids
		},
	}

	return harness
}
