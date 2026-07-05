import { type ChildProcess, spawn } from "node:child_process"
import { whichOnPath } from "@palot/cli-registry"
import { createLogger } from "../logger"
import { getAgentAdapter } from "./registry"
import {
	type AgentRunOptions,
	type AgentRunResult,
	type AgentRuntimeId,
	type AgentUpdate,
	reduceAgentUpdates,
} from "./types"

const log = createLogger("agent-runner")

/** Active runs, keyed by a caller-supplied run id, so they can be cancelled. */
const active = new Map<string, ChildProcess>()

/**
 * Run any registered agent CLI headlessly as a delegated subagent, streaming
 * normalized updates via `onUpdate` and resolving with the final result.
 * Rejects if the runtime is unknown, its CLI isn't installed, or it exits
 * non-zero without producing a message.
 */
export async function runAgent(
	runId: string,
	runtimeId: AgentRuntimeId,
	opts: AgentRunOptions,
	onUpdate: (update: AgentUpdate) => void,
): Promise<AgentRunResult> {
	if (!opts.prompt.trim()) throw new Error("A task prompt is required")

	const adapter = getAgentAdapter(runtimeId)
	if (!adapter) throw new Error(`Unknown agent runtime: ${runtimeId}`)

	const binary = await whichOnPath(adapter.binary)
	if (!binary) throw new Error(`${adapter.displayName} CLI is not installed`)

	return new Promise<AgentRunResult>((resolve, reject) => {
		const updates: AgentUpdate[] = []
		let stderr = ""
		let buffer = ""

		// stdin is ignored so the CLI doesn't block waiting for piped input.
		const child = spawn(binary, adapter.buildArgs(opts), {
			cwd: opts.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		})
		active.set(runId, child)

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
			stderr += chunk
		})

		child.on("error", (err) => {
			active.delete(runId)
			reject(err)
		})

		child.on("close", (code) => {
			active.delete(runId)
			if (buffer.trim()) handleLine(buffer)
			const result = reduceAgentUpdates(updates)
			if (code !== 0 && !result.message) {
				reject(new Error(stderr.trim() || `${adapter.displayName} exited with code ${code}`))
				return
			}
			log.info("Agent subagent finished", {
				runId,
				runtimeId,
				code,
				hasMessage: !!result.message,
			})
			resolve(result)
		})
	})
}

/** Cancel a running subagent. Returns true if a matching run was killed. */
export function cancelAgent(runId: string): boolean {
	const child = active.get(runId)
	if (!child) return false
	child.kill("SIGTERM")
	active.delete(runId)
	log.info("Agent subagent cancelled", { runId })
	return true
}
