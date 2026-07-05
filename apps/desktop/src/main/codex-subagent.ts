import { type ChildProcess, spawn } from "node:child_process"
import { whichOnPath } from "@palot/cli-registry"
import {
	type CodexRunResult,
	type CodexUpdate,
	parseCodexLine,
	reduceCodexUpdates,
} from "./codex-events"
import { createLogger } from "./logger"

const log = createLogger("codex-subagent")

export type CodexSandbox = "read-only" | "workspace-write" | "danger-full-access"

export interface CodexSubagentOptions {
	/** The task/instructions for the Codex agent. */
	prompt: string
	/** Working root the agent operates in. */
	cwd: string
	/** Sandbox policy for model-generated commands. Defaults to read-only. */
	sandbox?: CodexSandbox
	/** Optional model override. */
	model?: string
}

/** Active runs, keyed by a caller-supplied run id, so they can be cancelled. */
const active = new Map<string, ChildProcess>()

/** Build the `codex exec` argument vector. Exported for testing. */
export function buildArgs(opts: CodexSubagentOptions): string[] {
	const args = [
		"exec",
		"--json",
		"--skip-git-repo-check",
		"-s",
		opts.sandbox ?? "read-only",
		"-C",
		opts.cwd,
	]
	if (opts.model) args.push("-m", opts.model)
	args.push(opts.prompt)
	return args
}

/**
 * Run a Codex agent headlessly as a delegated subagent, streaming normalized
 * updates via `onUpdate` and resolving with the final result. Rejects if Codex
 * isn't installed or exits non-zero without producing a message.
 */
export async function runCodexSubagent(
	runId: string,
	opts: CodexSubagentOptions,
	onUpdate: (update: CodexUpdate) => void,
): Promise<CodexRunResult> {
	if (!opts.prompt.trim()) throw new Error("A task prompt is required")

	const binary = await whichOnPath("codex")
	if (!binary) throw new Error("Codex CLI is not installed")

	return new Promise<CodexRunResult>((resolve, reject) => {
		const updates: CodexUpdate[] = []
		let stderr = ""
		let buffer = ""

		// stdin is ignored so Codex doesn't block waiting for piped input.
		const child = spawn(binary, buildArgs(opts), {
			cwd: opts.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		})
		active.set(runId, child)

		const handleLine = (line: string) => {
			const update = parseCodexLine(line)
			if (!update) return
			updates.push(update)
			onUpdate(update)
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
			const result = reduceCodexUpdates(updates)
			if (code !== 0 && !result.message) {
				reject(new Error(stderr.trim() || `Codex exited with code ${code}`))
				return
			}
			log.info("Codex subagent finished", { runId, code, hasMessage: !!result.message })
			resolve(result)
		})
	})
}

/** Cancel a running subagent. Returns true if a matching run was killed. */
export function cancelCodexSubagent(runId: string): boolean {
	const child = active.get(runId)
	if (!child) return false
	child.kill("SIGTERM")
	active.delete(runId)
	log.info("Codex subagent cancelled", { runId })
	return true
}
