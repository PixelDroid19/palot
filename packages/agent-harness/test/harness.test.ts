import { describe, expect, test } from "bun:test"
import type { AgentProviderAdapter, PalotCommand } from "@palot/agent-adapter-opencode"
import { OpenCodeAgentAdapter } from "@palot/agent-adapter-opencode"
import type { Channel } from "@palot/events"
import { createHarness } from "../src"

describe("agent-harness", () => {
	test("emits events into the bus", () => {
		const harness = createHarness()
		const received: unknown[] = []
		const unsub = harness.bus.subscribe("session.lifecycle" as Channel, (env) => {
			received.push(env)
		})

		harness.emit({
			type: "session.created",
			at: Date.now(),
			session: { id: "s-harness", workspaceId: "w1", status: "idle" },
		} as unknown)

		expect(received.length).toBe(1)
		unsub()
	})

	test("harness supports multiple emits and reset (harness e2e sim)", () => {
		const harness = createHarness()
		const received: unknown[] = []
		harness.bus.subscribe("session.lifecycle" as Channel, (env) => received.push(env))
		harness.emit({
			type: "session.created",
			at: 1,
			session: { id: "s1", workspaceId: "w", status: "idle" },
		} as unknown)
		harness.emit({
			type: "session.status.changed",
			at: 2,
			sessionId: "s1",
			status: "busy",
		} as unknown)
		expect(received.length).toBe(2)
		harness.reset()
		expect(harness.bus.getRecorded().length).toBe(0) // after clear in reset
	})

	test("adapter contract surface (delegated impl, contract test)", () => {
		const adapter: AgentProviderAdapter = new OpenCodeAgentAdapter()
		expect(adapter.id).toBe("opencode")
		expect(adapter.label).toBe("OpenCode")
		expect(typeof adapter.connect).toBe("function")
		expect(typeof adapter.disconnect).toBe("function")
		expect(typeof adapter.dispatch).toBe("function")
		expect(typeof adapter.listWorkspaces).toBe("function")
		expect(typeof adapter.events).toBe("function")
		// command type check (no throw on shape)
		const cmd: PalotCommand = { type: "session.abort", sessionId: "x" } as unknown as PalotCommand
		expect(cmd.type).toBe("session.abort")
	})

	// ============================================================
	// Expanded harness-e2e flows (create+stream+finish, perm, q, abort, automation, concurrent, reconnect)
	// These exercise the full deterministic simulate surface + correct channel publishes.
	// ============================================================

	test("harness flow: create + prompt stream + finish to idle", () => {
		const harness = createHarness()
		const events: unknown[] = []
		harness.bus.subscribe("session.lifecycle" as Channel, (e) => events.push(e.event))
		harness.bus.subscribe("session.messages" as Channel, (e) => events.push(e.event))

		harness.simulateSessionCreated({ id: "s-flow", workspaceId: "w1" })
		harness.simulatePrompt("s-flow", [
			{ id: "p1", type: "text", delta: "Hel" },
			{ id: "p1", type: "text", delta: "lo" },
			{ id: "p2", type: "tool-call", content: "ls" },
		])

		const statuses = events.filter((e) => e.type === "session.status.changed").map((e) => e.status)
		expect(statuses).toContain("busy")
		expect(statuses).toContain("idle")
		const deltas = events.filter((e) => e.type === "message.part.delta")
		expect(deltas.length).toBeGreaterThan(0)
		expect(deltas[0].delta).toBe("Hel")
	})

	test("harness flow: permission request + reply", () => {
		const harness = createHarness()
		const received: unknown[] = []
		harness.bus.subscribe("session.permissions" as Channel, (e) => received.push(e.event))

		harness.simulateSessionCreated({ id: "s-perm", workspaceId: "w1" })
		harness.simulatePermissionRequest("s-perm", { id: "pr-42", tool: "bash", args: { cmd: "rm" } })
		harness.replyToPermission("s-perm", "pr-42", "allow")

		expect(received.length).toBe(2)
		expect(received[0].type).toBe("permission.requested")
		expect(received[1].type).toBe("permission.resolved")
		expect(received[1].response).toBe("allow")
	})

	test("harness flow: question request + reply", () => {
		const harness = createHarness()
		const received: unknown[] = []
		harness.bus.subscribe("session.questions" as Channel, (e) => received.push(e.event))

		harness.simulateQuestionRequest("s-q", {
			id: "q-7",
			prompt: "Which?",
			options: [{ id: "o1", label: "one" }],
		})
		harness.replyToQuestion("q-7", [{ optionId: "o1" }])

		expect(received.some((e) => e.type === "question.requested")).toBe(true)
		expect(received.some((e) => e.type === "question.resolved")).toBe(true)
	})

	test("harness flow: tool call + diff + completion", () => {
		const harness = createHarness()
		const msgs: unknown[] = []
		const diffs: unknown[] = []
		harness.bus.subscribe("session.messages" as Channel, (e) => msgs.push(e.event))
		harness.bus.subscribe("session.diff" as Channel, (e) => diffs.push(e.event))

		harness.simulateSessionCreated({ id: "s-tool", workspaceId: "w1" })
		harness.simulateToolCall("s-tool", "m1", { id: "tp1", name: "edit" })
		harness.simulateDiff("s-tool", { id: "d1", filePath: "foo.ts", patch: "--- a\n+++ b" })
		harness.simulateCompletion("s-tool")

		expect(msgs.some((e) => e.type === "message.part.upserted")).toBe(true)
		expect(diffs.length).toBe(1)
	})

	test("harness flow: simulate error + reconnect", () => {
		const harness = createHarness()
		const conn: unknown[] = []
		harness.bus.subscribe("provider.connection" as Channel, (e) => conn.push(e.event))

		harness.simulateError("s-err", "crashed")
		harness.simulateReconnect("harness")

		expect(conn.some((e) => e.type === "provider.disconnected")).toBe(true)
		expect(conn.some((e) => e.type === "provider.connected")).toBe(true)
	})

	test("harness flow: automation run updated", () => {
		const harness = createHarness()
		const runs: unknown[] = []
		harness.bus.subscribe("automation.runs" as Channel, (e) => runs.push(e.event))

		harness.simulateAutomationRun({
			id: "ar1",
			automationId: "autoA",
			status: "running",
			sessionId: "s1",
		})
		harness.simulateAutomationRun({
			id: "ar1",
			automationId: "autoA",
			status: "succeeded",
			sessionId: "s1",
		})

		expect(runs.length).toBe(2)
		expect(runs[1].run.status).toBe("succeeded")
	})

	test("harness flow: concurrent sessions", () => {
		const harness = createHarness()
		const ids = harness.simulateConcurrentSessions(3, "w-con")
		expect(ids.length).toBe(3)
		expect(new Set(ids).size).toBe(3)
	})

	test("harness flow: abort via status", () => {
		const harness = createHarness()
		const sts: unknown[] = []
		harness.bus.subscribe("session.lifecycle" as Channel, (e) => {
			if (e.event.type === "session.status.changed") sts.push(e.event)
		})

		harness.simulateSessionCreated({ id: "s-ab", workspaceId: "w1", status: "busy" })
		harness.emit({
			type: "session.status.changed",
			at: Date.now(),
			sessionId: "s-ab",
			status: "aborted",
		} as unknown)

		expect(sts.some((s) => s.status === "aborted")).toBe(true)
	})

	test("harness publishes to correct channels (not just lifecycle)", () => {
		const harness = createHarness()
		const chans: string[] = []
		harness.bus.subscribe("session.messages" as Channel, () => chans.push("messages"))
		harness.bus.subscribe("session.permissions" as Channel, () => chans.push("perms"))
		harness.bus.subscribe("automation.runs" as Channel, () => chans.push("auto"))

		harness.simulatePrompt("s-ch", [{ id: "p", type: "text", delta: "x" }])
		harness.simulatePermissionRequest("s-ch", { id: "pr", tool: "fs" })
		harness.simulateAutomationRun({ id: "r", automationId: "a", status: "pending" })

		expect(chans).toContain("messages")
		expect(chans).toContain("perms")
		expect(chans).toContain("auto")
	})
})
