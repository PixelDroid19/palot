import { describe, expect, test } from "bun:test"
import type { PalotEvent } from "@palot/core"
import {
	deriveChatViewModel,
	deriveSidebarViewModel,
	initialFullCoreState,
	rootReducer,
} from "@palot/core"

import {
	mapOpenCodeEventToPalot,
	mapOpenCodePart,
	mapOpenCodePermission,
	mapOpenCodeQuestion,
	mapOpenCodeStatus,
} from "../src/event-mapper"

describe("mapOpenCodeEventToPalot + helpers (synthetic)", () => {
	test("maps server.connected to provider.connected", () => {
		// biome-ignore lint/suspicious/noExplicitAny: synthetic raw OpenCode event for mapper test
		const evs = mapOpenCodeEventToPalot({ type: "server.connected", properties: {} } as any)
		expect(evs.length).toBe(1)
		expect(evs[0].type).toBe("provider.connected")
		// biome-ignore lint/suspicious/noExplicitAny: assert on produced palot shape
		expect((evs[0] as any).providerId).toBe("opencode")
	})

	test("maps session.created with directory fallback", () => {
		const raw = {
			type: "session.created",
			properties: {
				info: {
					id: "s1",
					directory: "",
					title: "Test",
					time: { created: 123, updated: 456 },
				},
			},
		}
		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const evs = mapOpenCodeEventToPalot(raw as any, "w-dir")
		expect(evs[0].type).toBe("session.created")
		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const s = (evs[0] as any).session as any
		expect(s.id).toBe("s1")
		expect(s.workspaceId).toBe("w-dir")
		expect(s.title).toBe("Test")
	})

	test("maps session.status to status.changed with mapping", () => {
		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const raw: any = {
			type: "session.status",
			properties: { sessionID: "s2", status: { type: "busy" } },
		}
		const evs = mapOpenCodeEventToPalot(raw)
		expect(evs.length).toBe(1)
		expect(evs[0].type).toBe("session.status.changed")
		// biome-ignore lint/suspicious/noExplicitAny: produced event assert
		expect((evs[0] as any).status).toBe("busy")
	})

	test("maps retry status -> waiting", () => {
		expect(mapOpenCodeStatus({ type: "retry", attempt: 1, message: "", next: 0 })).toBe("waiting")
	})

	test("maps message.part.delta exactly", () => {
		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const raw: any = {
			type: "message.part.delta",
			properties: {
				sessionID: "s",
				messageID: "m",
				partID: "p",
				field: "content",
				delta: "hello",
			},
		}
		const evs = mapOpenCodeEventToPalot(raw)
		expect(evs[0]).toMatchObject({
			type: "message.part.delta",
			sessionId: "s",
			messageId: "m",
			partId: "p",
			delta: "hello",
		})
	})

	test("maps permission.asked preserving tool/args/context", () => {
		const rawPerm = {
			id: "pr1",
			sessionID: "s",
			permission: "bash",
			patterns: ["*"],
			metadata: { cmd: "ls" },
			always: [],
		}
		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const mapped = mapOpenCodePermission(rawPerm as any)
		expect(mapped.tool).toBe("bash")
		expect(mapped.args).toEqual({ cmd: "ls" })

		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const evs = mapOpenCodeEventToPalot({ type: "permission.asked", properties: rawPerm } as any)
		expect(evs[0].type).toBe("permission.requested")
		// biome-ignore lint/suspicious/noExplicitAny: produced
		expect((evs[0] as any).request.id).toBe("pr1")
	})

	test("maps question.asked using first question", () => {
		const rawQ = {
			id: "q1",
			sessionID: "s",
			questions: [
				{ question: "Pick one?", header: "h", options: [{ label: "A" }, { label: "B" }] },
			],
		}
		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const mapped = mapOpenCodeQuestion(rawQ as any)
		expect(mapped.prompt).toBe("Pick one?")
		expect(mapped.options?.length).toBe(2)
		expect(mapped.options?.[0].id).toBe("0")

		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const evs = mapOpenCodeEventToPalot({ type: "question.asked", properties: rawQ } as any)
		expect(evs[0].type).toBe("question.requested")
	})

	test("maps tool part to tool-call or tool-result", () => {
		const pendingTool = {
			id: "pt1",
			type: "tool",
			tool: "bash",
			callID: "c1",
			state: { status: "pending", input: { command: "ls" } },
		}
		// biome-ignore lint/suspicious/noExplicitAny: synthetic part
		const p1 = mapOpenCodePart(pendingTool as any)
		expect(p1.type).toBe("tool-call")
		expect(p1.tool?.name).toBe("bash")

		const doneTool = {
			id: "pt2",
			type: "tool",
			tool: "bash",
			callID: "c1",
			state: { status: "completed", input: {}, output: "out", title: "" },
		}
		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const p2 = mapOpenCodePart(doneTool as any)
		expect(p2.type).toBe("tool-result")
		expect(p2.tool?.result).toBe("out")
	})

	test("session.error produces status error + disconnected", () => {
		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const raw: any = {
			type: "session.error",
			properties: { sessionID: "se", error: { name: "Boom" } },
		}
		const evs = mapOpenCodeEventToPalot(raw)
		expect(
			// biome-ignore lint/suspicious/noExplicitAny: e from mapper
			evs.some((e) => e.type === "session.status.changed" && (e as any).status === "error"),
		).toBe(true)
		expect(evs.some((e) => e.type === "provider.disconnected")).toBe(true)
	})

	test("unknown events return empty array (no crash, no leak)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: synthetic
		const evs = mapOpenCodeEventToPalot({ type: "tui.toast.show", properties: {} } as any)
		expect(evs).toEqual([])
	})
})

// ============================================================
// Adapter contract: realistic raw event "fixture replay" through mapper
// (simulates sequences that would come from live /global/event SSE; exercises full map + core ingest + VM)
// These prove mapper contract without live provider or raw fixture files (use synthetic but high-fidelity "real" seqs).
// ============================================================

describe("adapter contract: mapper replay of realistic raw sequences into core + VMs", () => {
	test("replays a permission+question raw sequence through mapper then rootReducer + derives VMs", () => {
		// realistic raw OpenCode-like events (as would arrive via adapter's SSE loop)
		// biome-ignore lint/suspicious/noExplicitAny: raw provider event seq for mapper contract replay test (matches synthetic style)
		const rawSeq: any[] = [
			{
				type: "session.created",
				properties: {
					info: {
						id: "s-map1",
						directory: "/p",
						title: "MapTest",
						time: { created: 1, updated: 2 },
					},
				},
			},
			{ type: "session.status", properties: { sessionID: "s-map1", status: { type: "busy" } } },
			{
				type: "permission.asked",
				properties: {
					id: "pr-map",
					sessionID: "s-map1",
					permission: "bash",
					patterns: [],
					metadata: { cmd: "ls" },
					always: [],
				},
			},
			{
				type: "question.asked",
				properties: {
					id: "q-map",
					sessionID: "s-map1",
					questions: [{ question: "Pick?", header: "", options: [{ label: "A" }] }],
				},
			},
			{
				type: "permission.replied",
				properties: { requestID: "pr-map", sessionID: "s-map1", reply: "once" },
			},
			{
				type: "question.replied",
				properties: { requestID: "q-map", sessionID: "s-map1", answers: [["A"]] },
			},
			{ type: "session.status", properties: { sessionID: "s-map1", status: { type: "idle" } } },
		]

		// replay sequence through mapper (contract under test)
		let palotEvents: PalotEvent[] = []
		for (const raw of rawSeq) {
			const mapped = mapOpenCodeEventToPalot(raw, "/p") || []
			palotEvents = palotEvents.concat(
				// biome-ignore lint/suspicious/noExplicitAny: cast for filter guard in test (matches synthetic tests)
				mapped.filter((e) => !!e && typeof (e as any).type === "string"),
			)
		}
		expect(palotEvents.length).toBeGreaterThan(5)
		expect(palotEvents.some((e) => e.type === "permission.requested")).toBe(true)
		expect(palotEvents.some((e) => e.type === "question.requested")).toBe(true)

		// now feed mapped events into core full reducer (as adapter would publish to bus, host replays to state)
		let state = initialFullCoreState
		for (const e of palotEvents) {
			state = rootReducer(state, e)
		}
		expect(state.sessions.sessions["s-map1"]).toBeDefined()
		expect(state.sessions.sessions["s-map1"].status).toBe("idle")

		// VMs
		const chat = deriveChatViewModel(state, "s-map1")
		expect(chat).not.toBeNull()
		expect(chat!.pendingPermissions.length).toBe(0)
		expect(chat!.pendingQuestions.length).toBe(0)

		const sidebar = deriveSidebarViewModel(state)
		expect(sidebar.sessions.some((s) => s.id === "s-map1")).toBe(true)
	})

	test("replays concurrent-ish + tool raw seq through mapper to state (no leak, produces usable palot)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: raw provider event seq for mapper contract replay test (matches synthetic style)
		const rawSeq: any[] = [
			{
				type: "session.created",
				properties: {
					info: { id: "s-conc-m", directory: "", title: "C", time: { created: 10, updated: 11 } },
				},
			},
			{ type: "session.status", properties: { sessionID: "s-conc-m", status: { type: "busy" } } },
			{
				type: "message.updated",
				properties: {
					info: { id: "m1", sessionID: "s-conc-m", role: "assistant" },
					parts: [
						{
							id: "pt",
							type: "tool",
							tool: "edit",
							callID: "c1",
							state: { status: "pending", input: { path: "x.ts" } },
						},
					],
				},
			},
			{ type: "session.status", properties: { sessionID: "s-conc-m", status: { type: "idle" } } },
		]

		const palotEvents = rawSeq
			.flatMap((raw) => mapOpenCodeEventToPalot(raw))
			// biome-ignore lint/suspicious/noExplicitAny: cast for filter guard in test (matches synthetic tests)
			.filter((e) => !!e && typeof (e as any).type === "string")

		let state = initialFullCoreState
		for (const e of palotEvents) {
			state = rootReducer(state, e)
		}
		const chat = deriveChatViewModel(state, "s-conc-m")
		expect(chat).not.toBeNull()
		expect(chat!.turns[0].parts.some((p) => p.type === "tool-call")).toBe(true)
	})
})
