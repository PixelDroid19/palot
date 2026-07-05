/**
 * Hardened process runner for agent CLIs. Fixes the failure modes that made
 * the previous integration flaky:
 *
 *  - prompts travel over stdin (no argv length limits or quoting hazards)
 *  - runs have a hard timeout with SIGTERM → SIGKILL escalation
 *  - the whole process group is killed, so a CLI's child processes can't
 *    linger after cancellation
 *  - stderr is captured and included in errors so failures are diagnosable
 */
import { type ChildProcess, spawn } from "node:child_process"
import type { AgentAdapter, AgentRunOptions, AgentRunResult, AgentUpdate } from "./types"
import { reduceAgentUpdates } from "./types"

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const KILL_GRACE_MS = 5_000

export interface RunHandle {
	result: Promise<AgentRunResult>
	cancel: () => void
}

function killTree(child: ChildProcess, signal: NodeJS.Signals) {
	if (child.pid == null) return
	try {
		// Negative pid targets the process group (child is spawned detached).
		process.kill(-child.pid, signal)
	} catch {
		try {
			child.kill(signal)
		} catch {
			// Already gone.
		}
	}
}

/**
 * Spawn an adapter's CLI for one run, streaming normalized updates via
 * `onUpdate`. Returns a handle whose promise resolves with the reduced result
 * or rejects with a diagnosable error (timeout, cancel, spawn failure, or a
 * non-zero exit with no message).
 */
export function spawnAgentRun(
	adapter: AgentAdapter,
	binaryPath: string,
	opts: AgentRunOptions,
	onUpdate: (update: AgentUpdate) => void,
): RunHandle {
	const { args, stdin } = adapter.buildCommand(opts)
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

	let cancelRun: () => void = () => {}
	const result = new Promise<AgentRunResult>((resolve, reject) => {
		const updates: AgentUpdate[] = []
		let stderr = ""
		let buffer = ""
		let settled = false
		let failure: Error | null = null

		const child = spawn(binaryPath, args, {
			cwd: opts.cwd,
			env: { ...process.env, ...opts.env },
			stdio: [stdin != null ? "pipe" : "ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
		})

		const timeout = setTimeout(() => {
			failure = new Error(`${adapter.displayName} timed out after ${Math.round(timeoutMs / 1000)}s`)
			killTree(child, "SIGTERM")
			setTimeout(() => killTree(child, "SIGKILL"), KILL_GRACE_MS).unref()
		}, timeoutMs)
		timeout.unref()

		cancelRun = () => {
			failure ??= new Error(`${adapter.displayName} run was cancelled`)
			killTree(child, "SIGTERM")
			setTimeout(() => killTree(child, "SIGKILL"), KILL_GRACE_MS).unref()
		}

		if (stdin != null && child.stdin) {
			child.stdin.on("error", () => {}) // CLI may exit before reading stdin.
			child.stdin.end(stdin)
		}

		const handleLine = (line: string) => {
			for (const update of adapter.parseLine(line)) {
				updates.push(update)
				onUpdate(update)
			}
		}

		child.stdout?.setEncoding("utf8")
		child.stdout?.on("data", (chunk: string) => {
			buffer += chunk
			let newline = buffer.indexOf("\n")
			while (newline !== -1) {
				handleLine(buffer.slice(0, newline))
				buffer = buffer.slice(newline + 1)
				newline = buffer.indexOf("\n")
			}
		})
		child.stderr?.setEncoding("utf8")
		child.stderr?.on("data", (chunk: string) => {
			// Keep only the tail; some CLIs are chatty on stderr.
			stderr = (stderr + chunk).slice(-8_192)
		})

		child.on("error", (err) => {
			if (settled) return
			settled = true
			clearTimeout(timeout)
			reject(err)
		})

		child.on("close", (code) => {
			if (settled) return
			settled = true
			clearTimeout(timeout)
			if (buffer.trim()) handleLine(buffer)
			const reduced = reduceAgentUpdates(updates)
			if (failure) {
				// A timed-out/cancelled run that already produced an answer still
				// resolves — partial results beat a hard error for the caller.
				if (reduced.message) resolve(reduced)
				else reject(failure)
				return
			}
			if (code !== 0 && !reduced.message) {
				reject(new Error(stderr.trim() || `${adapter.displayName} exited with code ${code}`))
				return
			}
			resolve(reduced)
		})
	})

	// Swallow the unhandled-rejection window between construction and await.
	result.catch(() => {})

	return { result, cancel: () => cancelRun() }
}
