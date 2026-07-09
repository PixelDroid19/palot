/**
 * Task / session catalog for the multi-runtime desktop shell.
 *
 * Views: workspace grouping, reverse-chronological timeline, keyword search.
 * Multi-runtime by design — never filter by `runtimeId === "opencode"`.
 */

export interface CatalogSession {
	id: string
	parentId?: string | null
	status: string
	createdAt: number
	lastActiveAt: number
	/** Runtime that owns this session (opencode | claude | codex | custom). */
	runtimeId?: string | null
	/** Task title for search. */
	name?: string
	/** Workspace / project display name. */
	project?: string
	/** Workspace directory for grouping. */
	projectDirectory?: string
}

/** Sidebar task organization modes. */
export type TaskCatalogView = "workspace" | "timeline"

/** Sort key for timeline / recent lists. */
export type TaskSortKey = "created" | "updated"

const ACTIVE_STATUSES = new Set(["running", "waiting", "failed"])

/**
 * Active Now: non-parent sessions that are running, waiting, or failed.
 * Sorted newest created first. Includes every runtimeId.
 */
export function selectActiveSessions<T extends CatalogSession>(sessions: readonly T[]): T[] {
	return sessions
		.filter((s) => !s.parentId && ACTIVE_STATUSES.has(s.status))
		.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Recent: non-parent sessions not in Active, by last activity, capped.
 * Includes every runtimeId — no OpenCode-only branch.
 */
export function selectRecentSessions<T extends CatalogSession>(
	sessions: readonly T[],
	activeIds: ReadonlySet<string>,
	limit: number,
): T[] {
	return sessions
		.filter((s) => !s.parentId && !activeIds.has(s.id))
		.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
		.slice(0, Math.max(0, limit))
}

/**
 * Timeline view: all non-parent tasks reverse-chronological by created or updated.
 * Multi-runtime peers share one reverse-chronological stream.
 */
export function selectTimelineTasks<T extends CatalogSession>(
	sessions: readonly T[],
	sort: TaskSortKey = "updated",
	limit?: number,
): T[] {
	const list = sessions
		.filter((s) => !s.parentId)
		.sort((a, b) => {
			const ta = sort === "created" ? a.createdAt : a.lastActiveAt
			const tb = sort === "created" ? b.createdAt : b.lastActiveAt
			return tb - ta
		})
	return limit != null ? list.slice(0, Math.max(0, limit)) : list
}

/**
 * Keyword search over title, project, path, and runtime id (case-insensitive).
 */
export function filterTasksByQuery<T extends CatalogSession>(
	sessions: readonly T[],
	query: string,
): T[] {
	const q = query.trim().toLowerCase()
	if (!q) return [...sessions]
	return sessions.filter((s) => {
		const hay = [s.name, s.project, s.projectDirectory, s.runtimeId, s.id]
			.filter(Boolean)
			.join(" ")
			.toLowerCase()
		return hay.includes(q)
	})
}

export interface WorkspaceTaskGroup<T extends CatalogSession> {
	/** Group key (project directory or "__unassigned__"). */
	key: string
	/** Display label. */
	label: string
	tasks: T[]
}

/**
 * Workspace view: tasks nested under project directory.
 * Empty projectDirectory → unassigned bucket.
 */
export function groupTasksByWorkspace<T extends CatalogSession>(
	sessions: readonly T[],
): WorkspaceTaskGroup<T>[] {
	const map = new Map<string, WorkspaceTaskGroup<T>>()
	for (const s of sessions) {
		if (s.parentId) continue
		const key = s.projectDirectory?.trim() || "__unassigned__"
		const label =
			s.project?.trim() ||
			(key === "__unassigned__" ? "Unassigned" : key.split("/").pop() || key)
		let group = map.get(key)
		if (!group) {
			group = { key, label, tasks: [] }
			map.set(key, group)
		}
		group.tasks.push(s)
	}
	// Within each workspace: newest activity first
	for (const g of map.values()) {
		g.tasks.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
	}
	// Groups by most recent task activity
	return [...map.values()].sort((a, b) => {
		const ta = a.tasks[0]?.lastActiveAt ?? 0
		const tb = b.tasks[0]?.lastActiveAt ?? 0
		return tb - ta
	})
}

/**
 * True if a catalog list would incorrectly exclude non-OpenCode runtimes
 * when both exist (structural guard for tests).
 */
export function catalogIncludesMultipleRuntimes(
	sessions: readonly CatalogSession[],
): boolean {
	const ids = new Set(
		sessions.map((s) => s.runtimeId).filter((id): id is string => !!id && id.length > 0),
	)
	return ids.size >= 2
}

