import { describe, expect, test } from "bun:test"
import {
	filterVisibleProjectDirs,
	isNonProductWorktree,
	isProductWorktree,
	listHiddenProductDirs,
	resolveProjectsEmptyKind,
	summarizeProjectVisibility,
} from "../src/renderer/lib/project-visibility"

describe("project visibility", () => {
	test("filters filesystem root and empty as non-product", () => {
		expect(isNonProductWorktree("/")).toBe(true)
		expect(isNonProductWorktree("")).toBe(true)
		expect(isNonProductWorktree(null)).toBe(true)
		expect(isProductWorktree("/Users/me/palot")).toBe(true)
	})

	test("filterVisibleProjectDirs drops hidden and root", () => {
		const items = [
			{ directory: "/" },
			{ directory: "/Users/me/a" },
			{ directory: "/Users/me/b" },
		]
		const visible = filterVisibleProjectDirs(items, ["/Users/me/a"])
		expect(visible.map((v) => v.directory)).toEqual(["/Users/me/b"])
	})

	test("all-hidden empty kind when every product worktree is hidden", () => {
		const dirs = ["/", "/Users/me/palot", "/Users/me/other"]
		const hidden = ["/Users/me/palot", "/Users/me/other", "/"]
		const summary = summarizeProjectVisibility(dirs, hidden)
		expect(summary.productDiscoveredCount).toBe(2)
		expect(summary.visibleProjectCount).toBe(0)
		expect(summary.hiddenProductCount).toBe(2)
		expect(resolveProjectsEmptyKind({
			serverConnected: true,
			productDiscoveredCount: summary.productDiscoveredCount,
			visibleProjectCount: summary.visibleProjectCount,
			hiddenProductCount: summary.hiddenProductCount,
		})).toBe("all-hidden")
	})

	test("none when discovery has only root worktree", () => {
		const summary = summarizeProjectVisibility(["/"], [])
		expect(summary.productDiscoveredCount).toBe(0)
		expect(
			resolveProjectsEmptyKind({
				serverConnected: true,
				...summary,
			}),
		).toBe("none")
	})

	test("offline takes precedence over hidden", () => {
		expect(
			resolveProjectsEmptyKind({
				serverConnected: false,
				productDiscoveredCount: 3,
				visibleProjectCount: 0,
				hiddenProductCount: 3,
			}),
		).toBe("offline")
	})

	test("listHiddenProductDirs ignores non-product paths in the hide list", () => {
		expect(listHiddenProductDirs(["/Users/me/a", "/"], ["/", "/Users/me/a"])).toEqual([
			"/Users/me/a",
		])
	})

	test("ready when at least one visible product project", () => {
		expect(
			resolveProjectsEmptyKind({
				serverConnected: true,
				productDiscoveredCount: 2,
				visibleProjectCount: 1,
				hiddenProductCount: 1,
			}),
		).toBe("ready")
	})
})
