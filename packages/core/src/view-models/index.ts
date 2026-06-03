/**
 * View models.
 *
 * Pure derivation functions: FullCoreState (or slices) -> serializable VM objects.
 * These are the data contracts passed to UI components (Lit or React adapters).
 *
 * No callbacks, no DOM, no framework types. Stable ids. Easy to snapshot in tests.
 *
 * Recommended set from roadmap/core-agent-platform.md + more (e.g. diffs).
 * All pure, no side effects.
 */

import type {
	AutomationRunInfo,
	MessagePartInfo,
	SessionStatus,
	WorkspaceInfo,
} from "@palot/events"
import { getActiveRuns } from "../automations"
import { getDiffsForSession, getPendingPermissions, getPendingQuestions } from "../sessions"
import type { FullCoreState } from "../state"
import { listWorkspaces } from "../workspaces"

export interface SessionListItemViewModel {
	id: string
	title: string
	status: SessionStatus
	workspaceId: string
	lastUpdated: number
	messageCount: number
}

export interface SidebarViewModel {
	sessions: SessionListItemViewModel[]
	workspaces: WorkspaceInfo[]
	currentProviderId?: string
}

export interface ChatTurnPartViewModel {
	id: string
	type: MessagePartInfo["type"]
	content: string
	tool?: MessagePartInfo["tool"]
}

export interface ChatTurnViewModel {
	id: string
	role: "user" | "assistant" | "system"
	parts: ChatTurnPartViewModel[]
}

export interface ChatViewModel {
	sessionId: string
	title?: string
	status: SessionStatus
	turns: ChatTurnViewModel[]
	pendingPermissions: Array<{
		id: string
		tool: string
		args?: Record<string, unknown>
	}>
	pendingQuestions: Array<{
		id: string
		prompt: string
		options?: Array<{ id: string; label: string }>
	}>
}

export interface PromptInputViewModel {
	sessionId: string
	disabled: boolean
	placeholder: string
}

export interface PermissionPanelViewModel {
	sessionId: string
	requests: Array<{
		id: string
		tool: string
		description?: string
		args?: Record<string, unknown>
	}>
}

export interface QuestionPanelViewModel {
	sessionId: string
	requests: Array<{
		id: string
		prompt: string
		options?: Array<{ id: string; label: string }>
	}>
}

export interface AutomationRunRowViewModel {
	id: string
	automationId: string
	status: AutomationRunInfo["status"]
	sessionId?: string
	startedAt?: number
}

export interface AutomationInboxViewModel {
	active: AutomationRunRowViewModel[]
	byAutomation: Record<string, AutomationRunRowViewModel[]>
}

export interface SettingsViewModel {
	values: Record<string, unknown>
}

/**
 * Derive sidebar list (sorted by last updated desc).
 * Covers recommended SidebarViewModel + workspaces + provider.
 */
export function deriveSidebarViewModel(state: FullCoreState): SidebarViewModel {
	const sessions = Object.values(state.sessions.sessions)
		.map((s): SessionListItemViewModel => {
			const msgs = state.sessions.messages[s.id] ?? {}
			return {
				id: s.id,
				title: s.title || "Untitled",
				status: s.status,
				workspaceId: s.workspaceId,
				lastUpdated: s.lastUpdated,
				messageCount: Object.keys(msgs).length,
			}
		})
		.sort((a, b) => b.lastUpdated - a.lastUpdated)

	return {
		sessions,
		workspaces: listWorkspaces(state.workspaces),
		currentProviderId: state.provider.connectedProviderId,
	}
}

/**
 * Derive full chat surface for a session.
 * Covers recommended ChatViewModel + turns + pending perm/q.
 */
export function deriveChatViewModel(state: FullCoreState, sessionId: string): ChatViewModel | null {
	const sess = state.sessions.sessions[sessionId]
	if (!sess) return null

	const msgMap = state.sessions.messages[sessionId] ?? {}
	const turns: ChatTurnViewModel[] = Object.values(msgMap)
		.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
		.map(
			(m): ChatTurnViewModel => ({
				id: m.id,
				role: m.role,
				parts: Object.values(m.parts).map(
					(p): ChatTurnPartViewModel => ({
						id: p.id,
						type: p.type,
						content: p.content ?? "",
						tool: p.tool,
					}),
				),
			}),
		)

	return {
		sessionId,
		title: sess.title,
		status: sess.status,
		turns,
		pendingPermissions: getPendingPermissions(state.sessions, sessionId).map((p) => ({
			id: p.id,
			tool: p.request.tool,
			args: p.request.args,
			description: p.request.description,
		})),
		pendingQuestions: getPendingQuestions(state.sessions, sessionId).map((q) => ({
			id: q.id,
			prompt: q.request.prompt,
			options: q.request.options,
		})),
	}
}

/**
 * Derive prompt input props.
 * Covers recommended PromptInputViewModel (disabled when busy).
 */
export function derivePromptInputViewModel(
	state: FullCoreState,
	sessionId: string,
): PromptInputViewModel {
	const sess = state.sessions.sessions[sessionId]
	const disabled = !sess || sess.status === "busy"
	return {
		sessionId,
		disabled,
		placeholder: disabled ? "Agent is working..." : "Type a prompt...",
	}
}

/**
 * Derive permission panel VM for session.
 * Covers recommended PermissionPanelViewModel.
 */
export function derivePermissionPanelViewModel(
	state: FullCoreState,
	sessionId: string,
): PermissionPanelViewModel {
	return {
		sessionId,
		requests: getPendingPermissions(state.sessions, sessionId).map((p) => ({
			id: p.id,
			tool: p.request.tool,
			description: p.request.description,
			args: p.request.args,
		})),
	}
}

/**
 * Derive question panel VM.
 * Covers recommended QuestionPanelViewModel.
 */
export function deriveQuestionPanelViewModel(
	state: FullCoreState,
	sessionId: string,
): QuestionPanelViewModel {
	return {
		sessionId,
		requests: getPendingQuestions(state.sessions, sessionId).map((q) => ({
			id: q.id,
			prompt: q.request.prompt,
			options: q.request.options,
		})),
	}
}

/**
 * Derive automations inbox.
 * Covers recommended AutomationInboxViewModel.
 */
export function deriveAutomationInboxViewModel(state: FullCoreState): AutomationInboxViewModel {
	const active = getActiveRuns(state.automations).map(
		(r): AutomationRunRowViewModel => ({
			id: r.id,
			automationId: r.automationId,
			status: r.status,
			sessionId: r.sessionId,
			startedAt: r.startedAt,
		}),
	)
	const byAutomation: Record<string, AutomationRunRowViewModel[]> = {}
	for (const r of Object.values(state.automations.runs)) {
		const vm: AutomationRunRowViewModel = {
			id: r.id,
			automationId: r.automationId,
			status: r.status,
			sessionId: r.sessionId,
			startedAt: r.startedAt,
		}
		byAutomation[r.automationId] = byAutomation[r.automationId] ?? []
		byAutomation[r.automationId].push(vm)
	}
	return { active, byAutomation }
}

/** Derive settings surface. */
export function deriveSettingsViewModel(state: FullCoreState): SettingsViewModel {
	return {
		values: { ...state.settings.values },
	}
}

/**
 * Derive diffs for a session (more than recommended, to cover session.diff channel fully).
 * Uses expanded core diffs state.
 */
export interface DiffListViewModel {
	sessionId: string
	diffs: Array<{
		id: string
		filePath: string
		hasPatch: boolean
	}>
}

export function deriveDiffListViewModel(
	state: FullCoreState,
	sessionId: string,
): DiffListViewModel {
	const diffs = getDiffsForSession(state.sessions, sessionId).map((d) => ({
		id: d.id,
		filePath: d.filePath,
		hasPatch: !!d.patch || (d.hunks?.length ?? 0) > 0,
	}))
	return { sessionId, diffs }
}

/**
 * Simple project tree from workspaces (covers ProjectTreeViewModel need via workspaces).
 * For richer tree would need dir scan (native port).
 */
export interface ProjectTreeViewModel {
	workspaces: Array<WorkspaceInfo & { sessionCount?: number }>
}

export function deriveProjectTreeViewModel(state: FullCoreState): ProjectTreeViewModel {
	const workspaces = listWorkspaces(state.workspaces).map((w) => ({
		...w,
		sessionCount: Object.values(state.sessions.sessions).filter((s) => s.workspaceId === w.id)
			.length,
	}))
	return { workspaces }
}
