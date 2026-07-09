/**
 * Structural + pure tests for delete chat/project actions.
 * - Context menus must use Base UI onClick (not Radix onSelect).
 * - Hidden project filter is pure and deterministic.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isProjectDirHidden } from "../src/renderer/atoms/hidden-projects"

const root = join(import.meta.dir, "..")

function source(rel: string): string {
	return readFileSync(join(root, rel), "utf-8")
}

describe("sidebar context menu uses Base UI onClick for destructive actions", () => {
	test("session Delete/Rename/Fork use onClick, not onSelect", () => {
		const text = source("src/renderer/components/sidebar.tsx")
		// Session row menu
		expect(text).toContain("onClick={() => void onDelete(agent)}")
		expect(text).toContain("onClick={startEditing}")
		expect(text).toContain("onClick={() => void onFork(agent)}")
		// Must not keep Radix-only onSelect on ContextMenuItem (ignored by Base UI)
		expect(text).not.toMatch(/ContextMenuItem[^>]*onSelect=/)
	})

	test("project folder exposes Remove project via onClick", () => {
		const text = source("src/renderer/components/sidebar.tsx")
		expect(text).toContain("Remove project")
		expect(text).toContain("onClick={() => void onDeleteProject(project)}")
	})

	test("managed-server deleteSession removes local session optimistically", () => {
		const text = source("src/renderer/services/runtime-session-gateway.ts")
		expect(text).toContain("removeSessionAtom, sessionId")
		// After API delete (or 404), local row is dropped without waiting for SSE only
		expect(text).toMatch(/session\.delete[\s\S]*removeSessionAtom/)
	})
})

describe("hidden project filter", () => {
	test("isProjectDirHidden matches exact directory paths", () => {
		const hidden = ["/Users/me/a", "/Users/me/b"]
		expect(isProjectDirHidden(hidden, "/Users/me/a")).toBe(true)
		expect(isProjectDirHidden(hidden, "/Users/me/c")).toBe(false)
	})
})
