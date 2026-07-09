import { describe, expect, test } from "bun:test"
import {
	catalogIncludesMultipleRuntimes,
	filterTasksByQuery,
	groupTasksByWorkspace,
	selectActiveSessions,
	selectRecentSessions,
	selectTimelineTasks,
} from "../src/renderer/lib/session-catalog"

describe("session catalog multi-runtime", () => {
	const sessions = [
		{
			id: "oc-1",
			status: "idle",
			createdAt: 100,
			lastActiveAt: 200,
			runtimeId: "opencode",
			name: "Refactor auth",
			project: "palot",
			projectDirectory: "/Users/me/palot",
		},
		{
			id: "claude-1",
			status: "running",
			createdAt: 300,
			lastActiveAt: 400,
			runtimeId: "claude",
			name: "QA_OK_CLAUDE",
			project: "palot",
			projectDirectory: "/Users/me/palot",
		},
		{
			id: "codex-1",
			status: "idle",
			createdAt: 250,
			lastActiveAt: 500,
			runtimeId: "codex",
			name: "Wire gateway",
			project: "api",
			projectDirectory: "/Users/me/api",
		},
		{
			id: "child",
			parentId: "claude-1",
			status: "running",
			createdAt: 350,
			lastActiveAt: 450,
			runtimeId: "claude",
			name: "child",
			project: "palot",
			projectDirectory: "/Users/me/palot",
		},
	]

	test("active includes process-adapter sessions, not only managed-server", () => {
		const active = selectActiveSessions(sessions)
		expect(active.map((s) => s.id)).toEqual(["claude-1"])
		expect(active.every((s) => s.runtimeId !== undefined)).toBe(true)
		// child agents excluded
		expect(active.some((s) => s.id === "child")).toBe(false)
	})

	test("recent includes OpenCode + Codex + Claude peers (not OpenCode-only)", () => {
		const active = selectActiveSessions(sessions)
		const activeIds = new Set(active.map((s) => s.id))
		const recent = selectRecentSessions(sessions, activeIds, 5)
		const runtimes = new Set(recent.map((s) => s.runtimeId))
		expect(runtimes.has("opencode")).toBe(true)
		expect(runtimes.has("codex")).toBe(true)
		// Claude is in active, not recent
		expect(runtimes.has("claude")).toBe(false)
		expect(catalogIncludesMultipleRuntimes(recent)).toBe(true)
	})

	test("never filters by runtimeId === opencode only", () => {
		const source = selectRecentSessions(
			sessions,
			new Set(["claude-1"]),
			10,
		)
		// Guard: result is not a pure OpenCode list when mixed input exists
		expect(source.some((s) => s.runtimeId === "codex")).toBe(true)
		expect(source.every((s) => s.runtimeId === "opencode")).toBe(false)
	})

	test("timeline is reverse-chronological multi-runtime", () => {
		const timeline = selectTimelineTasks(sessions, "updated")
		expect(timeline.map((s) => s.id)).toEqual(["codex-1", "claude-1", "oc-1"])
		expect(catalogIncludesMultipleRuntimes(timeline)).toBe(true)
	})

	test("workspace groups tasks by project directory", () => {
		const groups = groupTasksByWorkspace(sessions)
		expect(groups.map((g) => g.key).sort()).toEqual(["/Users/me/api", "/Users/me/palot"])
		const palot = groups.find((g) => g.key === "/Users/me/palot")!
		expect(palot.tasks.some((t) => t.runtimeId === "claude")).toBe(true)
		expect(palot.tasks.some((t) => t.runtimeId === "opencode")).toBe(true)
		// children excluded
		expect(palot.tasks.some((t) => t.id === "child")).toBe(false)
	})

	test("search filters by title keyword across runtimes", () => {
		const hits = filterTasksByQuery(sessions, "gateway")
		expect(hits.map((s) => s.id)).toEqual(["codex-1"])
		const multi = filterTasksByQuery(sessions, "palot")
		expect(multi.length).toBeGreaterThanOrEqual(2)
	})
})
