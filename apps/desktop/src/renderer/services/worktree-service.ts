/**
 * Worktree lifecycle via OpenCode experimental worktree API.
 * Public API: listWorktrees, removeWorktree, resetWorktree.
 */
import { createLogger } from "../lib/logger"
import { getProjectClient } from "./connection-manager"

const log = createLogger("worktree-service")

/** List worktree directories for a project (empty if server unavailable). */
export async function listWorktrees(projectDir: string): Promise<string[]> {
	const client = getProjectClient(projectDir)
	if (!client) return []
	try {
		const result = await client.worktree.list()
		return (result.data ?? []) as string[]
	} catch {
		log.debug("Worktree list API not available")
		return []
	}
}

/** Remove a worktree and its branch. */
export async function removeWorktree(projectDir: string, worktreeDir: string): Promise<void> {
	const client = getProjectClient(projectDir)
	if (!client) throw new Error("Not connected to managed runtime server")
	try {
		await client.worktree.remove({
			worktreeRemoveInput: { directory: worktreeDir },
		})
		log.info("Worktree removed", { worktreeDir })
	} catch (err) {
		log.error("Worktree removal failed", err)
		throw new Error(
			`Failed to remove worktree: ${err instanceof Error ? err.message : "Unknown error"}`,
		)
	}
}

/** Reset a worktree branch to the primary default branch. */
export async function resetWorktree(projectDir: string, worktreeDir: string): Promise<void> {
	const client = getProjectClient(projectDir)
	if (!client) throw new Error("Not connected to managed runtime server")
	try {
		await client.worktree.reset({
			worktreeResetInput: { directory: worktreeDir },
		})
		log.info("Worktree reset", { worktreeDir })
	} catch (err) {
		log.error("Worktree reset failed", err)
		throw new Error(
			`Failed to reset worktree: ${err instanceof Error ? err.message : "Unknown error"}`,
		)
	}
}
