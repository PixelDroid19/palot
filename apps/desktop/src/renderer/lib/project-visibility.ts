/**
 * Project visibility helpers for the sidebar / new-session empty states.
 *
 * Pure functions so unit tests drive the same logic the UI uses — no Electron.
 *
 * Lessons from multi-workspace desktop shells (e.g. pi-gui): distinguish
 * "nothing discovered", "all hidden", and "offline" so users are never stranded
 * with a dead empty state when workspaces still exist.
 */

/** Worktrees that are OpenCode bookkeeping, not user projects. */
export function isNonProductWorktree(directory: string | null | undefined): boolean {
	if (directory == null) return true
	const trimmed = directory.trim()
	if (!trimmed) return true
	// OpenCode "global" project roots at filesystem root
	if (trimmed === "/" || trimmed === "\\") return true
	return false
}

export function isProductWorktree(directory: string | null | undefined): boolean {
	return !isNonProductWorktree(directory)
}

export type ProjectsEmptyKind =
	| "ready"
	/** Server offline / not connected */
	| "offline"
	/** Discovery loaded, no product worktrees at all */
	| "none"
	/** Product worktrees exist but every one is hidden */
	| "all-hidden"

export interface ProjectsEmptyInput {
	serverConnected: boolean
	/** Product worktrees from discovery (after non-product filter), before hide. */
	productDiscoveredCount: number
	/** Product worktrees currently visible in the sidebar. */
	visibleProjectCount: number
	/** How many product worktrees are currently hidden (intersect discovery ∩ hidden). */
	hiddenProductCount: number
}

/**
 * Decide which empty-state variant to show.
 * `ready` means there is something to list (visible projects or sessions elsewhere).
 */
export function resolveProjectsEmptyKind(input: ProjectsEmptyInput): ProjectsEmptyKind {
	if (!input.serverConnected) return "offline"
	if (input.visibleProjectCount > 0) return "ready"
	if (input.hiddenProductCount > 0) return "all-hidden"
	if (input.productDiscoveredCount === 0) return "none"
	// Discovered product worktrees but none visible and none counted as hidden:
	// treat as none (edge: race before hide list applies).
	return "none"
}

export interface DirLike {
	directory: string
}

/**
 * Drop non-product worktrees and those present in the hidden set.
 */
export function filterVisibleProjectDirs<T extends DirLike>(
	items: readonly T[],
	hiddenDirs: readonly string[],
): T[] {
	const hidden = new Set(hiddenDirs)
	return items.filter(
		(item) => isProductWorktree(item.directory) && !hidden.has(item.directory),
	)
}

/**
 * Product worktrees present in discovery that the user has hidden.
 */
export function listHiddenProductDirs(
	discoveredDirs: readonly string[],
	hiddenDirs: readonly string[],
): string[] {
	const hidden = new Set(hiddenDirs)
	return discoveredDirs.filter((d) => isProductWorktree(d) && hidden.has(d))
}

/**
 * Counts for empty-state: product discovered, visible after hide, hidden product.
 */
export function summarizeProjectVisibility(
	discoveredDirs: readonly string[],
	hiddenDirs: readonly string[],
): {
	productDiscoveredCount: number
	visibleProjectCount: number
	hiddenProductCount: number
	hiddenProductDirs: string[]
} {
	const product = discoveredDirs.filter(isProductWorktree)
	const hiddenProductDirs = listHiddenProductDirs(product, hiddenDirs)
	const hiddenSet = new Set(hiddenDirs)
	const visibleProjectCount = product.filter((d) => !hiddenSet.has(d)).length
	return {
		productDiscoveredCount: product.length,
		visibleProjectCount,
		hiddenProductCount: hiddenProductDirs.length,
		hiddenProductDirs,
	}
}
