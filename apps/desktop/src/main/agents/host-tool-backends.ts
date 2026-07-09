/**
 * Desktop backends for the host tool plane (automation, system, browser).
 * Registered on AgentHost.tools — available to every harness via MCP bridge.
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { shell } from "electron"
import { registerDefaultPlatformTools } from "@gcode/agent-host"
import type { AgentHost } from "@gcode/agent-host"
import { createLogger } from "../logger"
import { listAutomations, runNow } from "../automation"

const log = createLogger("host-tools")
const execFileAsync = promisify(execFile)

/** Allowlist-style system runner: short commands only, no shell metachar chaining. */
async function runSystemCommand(
	command: string,
	cwd?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const trimmed = command.trim()
	if (!trimmed) {
		return { exitCode: 1, stdout: "", stderr: "empty command" }
	}
	// Split on whitespace only — no shell interpretation (fail closed for pipes/redirects).
	if (/[|&;<>$`]/.test(trimmed)) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: "shell metacharacters are not allowed; pass a simple command and args",
		}
	}
	const parts = trimmed.split(/\s+/)
	const bin = parts[0]!
	const args = parts.slice(1)
	try {
		const { stdout, stderr } = await execFileAsync(bin, args, {
			cwd: cwd || process.cwd(),
			timeout: 30_000,
			maxBuffer: 1024 * 1024,
			env: process.env,
		})
		return { exitCode: 0, stdout: String(stdout), stderr: String(stderr) }
	} catch (err) {
		const e = err as { code?: number; stdout?: string; stderr?: string; message?: string }
		return {
			exitCode: typeof e.code === "number" ? e.code : 1,
			stdout: String(e.stdout ?? ""),
			stderr: String(e.stderr ?? e.message ?? "command failed"),
		}
	}
}

async function openBrowser(url: string): Promise<{ ok: boolean; message: string }> {
	try {
		await shell.openExternal(url)
		return { ok: true, message: `opened ${url}` }
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		log.warn("browser open failed", { url, message })
		return { ok: false, message }
	}
}

/**
 * Wire real desktop backends onto the host tool plane (replaces stub platform tools).
 * Safe to call after AgentHost construction; re-registers automation/system/browser names.
 */
export function installDesktopHostToolBackends(host: AgentHost): void {
	// Re-register platform tools with live backends (overwrites stub handlers).
	registerDefaultPlatformTools(host.tools, {
		listAutomations: async () => {
			try {
				const items = await listAutomations()
				return items.map((a) => ({
					id: a.id,
					name: a.name,
					status: a.status,
				}))
			} catch (err) {
				log.warn("listAutomations failed", err)
				return []
			}
		},
		runAutomation: async (id) => {
			try {
				const ok = await runNow(id)
				return ok
					? { ok: true, message: `automation ${id} queued` }
					: { ok: false, message: `automation not found or failed to start: ${id}` }
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				return { ok: false, message }
			}
		},
		runSystemCommand,
		openBrowser,
	})
	log.info("Desktop host tool backends installed", {
		tools: host.tools.list().map((t) => t.name),
	})
}
