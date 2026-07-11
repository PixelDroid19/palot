/**
 * Unified backend service layer.
 *
 * Detects whether we're running inside Electron (preload bridge available).
 * The Lit desktop product is host-driven; it does not attach to a browser
 * server as a fallback.
 *
 * In Electron mode, calls go through IPC to the main process.
 */

import type {
	Automation,
	AutomationRun,
	CreateAutomationInput,
	GitApplyResult,
	GitBranchInfo,
	GitCheckoutResult,
	GitCommitResult,
	GitDiffStat,
	GitPushResult,
	GitStashResult,
	GitStatusInfo,
	ModelState,
	OpenInTargetsResult,
	UpdateAutomationInput,
} from "../../preload/api"
import { createLogger } from "../lib/logger"

const log = createLogger("backend")

// ============================================================
// Runtime detection
// ============================================================

/**
 * Returns true when running inside Electron (preload bridge is available).
 * The `gcode` object is exposed via `contextBridge.exposeInMainWorld`.
 */
export const isElectron = typeof window !== "undefined" && "gcode" in window

// ============================================================
// Backend API — same signatures regardless of runtime
// ============================================================

/**
 * Legacy compatibility entry point for callers that still request a local
 * runtime URL. Local OpenCode sessions use agentSession ACP instead.
 *
 * Local OpenCode is intentionally not resolved here: it runs through the
 * agent-session ACP bridge. Remote HTTP server configs remain supported by
 * the generic discovery compatibility path below.
 */
export async function fetchRuntimeServerUrl(): Promise<{ url: string }> {
	log.warn("OpenCode HTTP runtime requested after ACP migration", { electron: isElectron })
	throw new Error("OpenCode HTTP runtime has been removed; use the agent-session CLI runtime")
}

/** @deprecated Use {@link fetchRuntimeServerUrl} */
export const fetchProjectRuntimeUrl = fetchRuntimeServerUrl
/** @deprecated Use {@link fetchRuntimeServerUrl} */
export const fetchManagedRuntimeUrl = fetchRuntimeServerUrl

/**
 * Resolve the connection URL for a server config.
 * Local server configs fail closed because no local HTTP runtime is managed.
 * Remote configs return their explicitly configured URL.
 */
export async function resolveServerUrl(
	server: import("../../preload/api").ServerConfig,
): Promise<string> {
	switch (server.type) {
		case "local": {
			const { url } = await fetchRuntimeServerUrl()
			return url
		}
		case "remote":
			return server.url
		case "ssh":
			// SSH tunneling not yet implemented; the URL would come from the tunnel manager
			throw new Error("SSH tunnel servers are not yet supported")
		default:
			throw new Error(`Unknown server type: ${(server as { type: string }).type}`)
	}
}

/**
 * Resolve the auth header for a server config.
 * Fetches the encrypted password from the main process via IPC.
 * Returns null for unauthenticated servers.
 */
export async function resolveAuthHeader(
	server: import("../../preload/api").ServerConfig,
): Promise<string | null> {
	if (server.type === "local") {
		if (!server.hasPassword || !isElectron) return null
		const password = await window.gcode.credential.get("local")
		if (!password) return null
		return `Basic ${btoa(`opencode:${password}`)}`
	}
	if (server.type === "remote" || server.type === "ssh") {
		if (!server.hasPassword) return null
		if (!isElectron) return null

		const password = await window.gcode.credential.get(server.id)
		if (!password) return null

		const username = server.username || "opencode"
		return `Basic ${btoa(`${username}:${password}`)}`
	}
	return null
}

/**
 * Fetches the OpenCode model state (recent models, favorites, variants)
 * from ~/.local/state/opencode/model.json.
 */
export async function fetchModelState(): Promise<ModelState> {
	if (isElectron) {
		return window.gcode.getModelState()
	}
	throw new Error("Model state is only available through the Electron host")
}

/**
 * Adds a model to the front of the recent list in model.json.
 * Matches the TUI's `model.set(model, { recent: true })` behavior.
 * Returns the updated model state.
 */
export async function updateModelRecent(model: {
	providerID: string
	modelID: string
}): Promise<ModelState> {
	if (isElectron) {
		return window.gcode.updateModelRecent(model)
	}
	throw new Error("Model state is only available through the Electron host")
}

/**
 * Checks if the backend is available.
 * In Electron, always returns true (main process is always there).
 * In standalone browser mode, it fails closed because there is no renderer server.
 */
export async function checkBackendHealth(): Promise<boolean> {
	if (isElectron) {
		return true
	}
	return false
}

// ============================================================
// Directory picker — Electron-only (native dialog via IPC)
// ============================================================

/**
 * Opens a native folder picker dialog.
 * Returns the selected directory path, or null if cancelled.
 */
export async function pickDirectory(): Promise<string | null> {
	if (isElectron) {
		return window.gcode.pickDirectory()
	}
	throw new Error("Directory picker is only available in Electron mode")
}

// ============================================================
// Git operations — Electron-only (main process via IPC)
// In browser mode, these are not available because git operations are exposed
// through the Electron host rather than an agent runtime HTTP API.
// ============================================================

/**
 * Lists all local and remote branches for a project directory.
 */
export async function fetchGitBranches(directory: string): Promise<GitBranchInfo> {
	if (isElectron) {
		return window.gcode.git.listBranches(directory)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Gets the working tree status (clean/dirty, file counts).
 */
export async function fetchGitStatus(directory: string): Promise<GitStatusInfo> {
	if (isElectron) {
		return window.gcode.git.getStatus(directory)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Checks out a branch. Fails if there are uncommitted changes
 * that would conflict.
 */
export async function gitCheckout(directory: string, branch: string): Promise<GitCheckoutResult> {
	if (isElectron) {
		return window.gcode.git.checkout(directory, branch)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Stashes uncommitted changes, then checks out the target branch.
 */
export async function gitStashAndCheckout(
	directory: string,
	branch: string,
): Promise<GitStashResult> {
	if (isElectron) {
		return window.gcode.git.stashAndCheckout(directory, branch)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Pops the most recent stash entry.
 */
export async function gitStashPop(directory: string): Promise<GitStashResult> {
	if (isElectron) {
		return window.gcode.git.stashPop(directory)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Gets the git repository root for a directory.
 */
export async function getGitRoot(directory: string): Promise<string | null> {
	if (isElectron) {
		return window.gcode.git.getRoot(directory)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Gets a summary of uncommitted changes in a directory.
 */
export async function fetchDiffStat(directory: string): Promise<GitDiffStat> {
	if (isElectron) {
		return window.gcode.git.diffStat(directory)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Commits all changes (staged + unstaged) with the given message.
 */
export async function gitCommitAll(directory: string, message: string): Promise<GitCommitResult> {
	if (isElectron) {
		return window.gcode.git.commitAll(directory, message)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Pushes the current branch to the remote.
 */
export async function gitPush(directory: string, remote?: string): Promise<GitPushResult> {
	if (isElectron) {
		return window.gcode.git.push(directory, remote)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Creates a new branch on the given directory.
 */
export async function gitCreateBranch(
	directory: string,
	branchName: string,
): Promise<GitCheckoutResult> {
	if (isElectron) {
		return window.gcode.git.createBranch(directory, branchName)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Gets the remote URL for a repository (defaults to "origin").
 */
export async function getGitRemoteUrl(directory: string, remote?: string): Promise<string | null> {
	if (isElectron) {
		return window.gcode.git.getRemoteUrl(directory, remote)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Applies uncommitted changes from a worktree to the local checkout as a patch.
 */
export async function gitApplyToLocal(
	worktreeDir: string,
	localDir: string,
): Promise<GitApplyResult> {
	if (isElectron) {
		return window.gcode.git.applyToLocal(worktreeDir, localDir)
	}
	throw new Error("Git operations are only available in Electron mode")
}

/**
 * Applies a raw diff string to a local directory using `git apply`.
 * Used for remote worktree apply-to-local, where the diff is fetched
 * from the OpenCode session.diff API rather than from a local worktree.
 */
export async function gitApplyDiffText(
	localDir: string,
	diffText: string,
): Promise<GitApplyResult> {
	if (isElectron) {
		return window.gcode.git.applyDiffText(localDir, diffText)
	}
	throw new Error("Git operations are only available in Electron mode")
}

// ============================================================
// Open in external app — Electron-only (main process via IPC)
// ============================================================

/**
 * Gets the list of available "Open in" targets (editors, terminals, file managers)
 * with their availability status and the user's preferred target.
 */
export async function fetchOpenInTargets(): Promise<OpenInTargetsResult> {
	if (isElectron) {
		return window.gcode.openIn.getTargets()
	}
	throw new Error("Open-in targets are only available in Electron mode")
}

/**
 * Opens a directory in the specified target application.
 * Optionally persists the target as the user's preferred choice.
 */
export async function openInTarget(
	directory: string,
	targetId: string,
	persistPreferred?: boolean,
	remote?: { sshHost: string; sshUser?: string; sshPort?: number },
): Promise<void> {
	if (isElectron) {
		return window.gcode.openIn.open(directory, targetId, persistPreferred, remote)
	}
	throw new Error("Open-in targets are only available in Electron mode")
}

/**
 * Sets the user's preferred "Open in" target without opening anything.
 */
export async function setOpenInPreferred(targetId: string): Promise<{ success: boolean }> {
	if (isElectron) {
		return window.gcode.openIn.setPreferred(targetId)
	}
	throw new Error("Open-in targets are only available in Electron mode")
}

// ============================================================
// Automations — Electron-only
// ============================================================

export async function fetchAutomations(): Promise<Automation[]> {
	if (isElectron) {
		return window.gcode.automation.list()
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function fetchAutomation(id: string): Promise<Automation | null> {
	if (isElectron) {
		return window.gcode.automation.get(id)
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function createAutomation(input: CreateAutomationInput): Promise<Automation> {
	if (isElectron) {
		return window.gcode.automation.create(input)
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function updateAutomation(input: UpdateAutomationInput): Promise<Automation | null> {
	if (isElectron) {
		return window.gcode.automation.update(input)
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function deleteAutomation(id: string): Promise<boolean> {
	if (isElectron) {
		return window.gcode.automation.delete(id)
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function runAutomationNow(id: string): Promise<boolean> {
	if (isElectron) {
		return window.gcode.automation.runNow(id)
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function fetchAutomationRuns(automationId?: string): Promise<AutomationRun[]> {
	if (isElectron) {
		return window.gcode.automation.listRuns(automationId)
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function archiveAutomationRun(runId: string): Promise<boolean> {
	if (isElectron) {
		return window.gcode.automation.archiveRun(runId)
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function acceptAutomationRun(runId: string): Promise<boolean> {
	if (isElectron) {
		return window.gcode.automation.acceptRun(runId)
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function markAutomationRunRead(runId: string): Promise<boolean> {
	if (isElectron) {
		return window.gcode.automation.markRunRead(runId)
	}
	throw new Error("Automations are only available in Electron mode")
}

export async function previewAutomationSchedule(
	rrule: string,
	timezone: string,
): Promise<string[]> {
	if (isElectron) {
		return window.gcode.automation.previewSchedule(rrule, timezone)
	}
	throw new Error("Automations are only available in Electron mode")
}
