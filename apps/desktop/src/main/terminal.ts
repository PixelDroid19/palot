/**
 * Embedded terminal support. Each panel in the renderer is backed by a real
 * PTY here (node-pty), spawned in the chat's working directory with the user's
 * login shell — so `Terminal` in the chat opens a shell already `cd`'d into the
 * project the conversation is about, matching what the CLIs' own desktop apps
 * offer. Output streams to the renderer; input/resize flow back.
 */
import { createRequire } from "node:module"
import { chmodSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { IPty } from "node-pty"
import { createLogger } from "./logger"

const log = createLogger("terminal")

// The main process is bundled as ESM, so `require` isn't global — make one.
// node-pty is a native module kept external, resolved from node_modules here.
const nodeRequire = createRequire(import.meta.url)

/** node-pty ships prebuilt binaries, but package managers can strip the exec
 * bit off the `spawn-helper` used by posix_spawn — restore it before first use
 * or every spawn fails with "posix_spawnp failed". */
function ensureSpawnHelperExecutable(): void {
	if (process.platform === "win32") return
	try {
		const ptyRoot = dirname(nodeRequire.resolve("node-pty/package.json"))
		const arch = process.arch === "x64" ? "darwin-x64" : "darwin-arm64"
		const candidates =
			process.platform === "darwin"
				? [join(ptyRoot, "prebuilds", arch, "spawn-helper")]
				: [join(ptyRoot, "prebuilds", `linux-${process.arch}`, "spawn-helper")]
		candidates.push(join(ptyRoot, "build", "Release", "spawn-helper"))
		for (const path of candidates) {
			if (existsSync(path)) chmodSync(path, 0o755)
		}
	} catch (err) {
		log.warn("Could not fix spawn-helper permissions", {}, err)
	}
}

interface TerminalHandle {
	pty: IPty
	onData: (data: string) => void
	onExit: (code: number) => void
}

class TerminalManager {
	private terminals = new Map<string, TerminalHandle>()
	private helperFixed = false
	private ptyModule: typeof import("node-pty") | null = null

	private load(): typeof import("node-pty") {
		if (!this.helperFixed) {
			ensureSpawnHelperExecutable()
			this.helperFixed = true
		}
		// Lazy require: node-pty is a native module, only loaded when a terminal
		// is actually opened (keeps startup cheap and failures contained).
		this.ptyModule ??= nodeRequire("node-pty") as typeof import("node-pty")
		return this.ptyModule
	}

	/** Open a PTY for `id` in `cwd`. Re-opening an existing id is a no-op. */
	create(
		id: string,
		cwd: string,
		size: { cols: number; rows: number },
		handlers: { onData: (data: string) => void; onExit: (code: number) => void },
	): void {
		if (this.terminals.has(id)) return
		const pty = this.load()
		const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "/bin/zsh")
		const workdir = cwd && existsSync(cwd) ? cwd : homedir()
		// Login+interactive shell so the user's real prompt, aliases and PATH load.
		const args = process.platform === "win32" ? [] : ["-l"]
		const child = pty.spawn(shell, args, {
			name: "xterm-256color",
			cwd: workdir,
			cols: size.cols || 80,
			rows: size.rows || 24,
			env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
		})
		const handle: TerminalHandle = { pty: child, ...handlers }
		this.terminals.set(id, handle)
		child.onData((data) => handle.onData(data))
		child.onExit(({ exitCode }) => {
			this.terminals.delete(id)
			handle.onExit(exitCode)
		})
		log.info("Terminal opened", { id, cwd: workdir, shell })
	}

	write(id: string, data: string): void {
		this.terminals.get(id)?.pty.write(data)
	}

	resize(id: string, cols: number, rows: number): void {
		const handle = this.terminals.get(id)
		if (!handle || cols <= 0 || rows <= 0) return
		try {
			handle.pty.resize(cols, rows)
		} catch {
			// The pty may have exited between the resize event and here.
		}
	}

	kill(id: string): void {
		const handle = this.terminals.get(id)
		if (!handle) return
		this.terminals.delete(id)
		try {
			handle.pty.kill()
		} catch {
			// Already gone.
		}
	}

	killAll(): void {
		for (const id of [...this.terminals.keys()]) this.kill(id)
	}
}

export const terminalManager = new TerminalManager()
