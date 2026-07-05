import { execFile } from "node:child_process"
import { accessSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import type { DetectionHost } from "./types"

/** Expand a leading `~` to the current user's home directory. */
export function expandHome(p: string): string {
	if (p === "~") return os.homedir()
	if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2))
	return p
}

/** Executable file extensions to try on Windows, from PATHEXT. */
function windowsExecExts(): string[] {
	const pathext = process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM"
	return pathext.split(";").filter(Boolean)
}

/**
 * Resolve a binary name to an absolute path by scanning `PATH`, mirroring how a
 * shell would. Pure filesystem probing — it never executes the binary, so it is
 * safe to call for CLIs we don't control. Returns null when not found.
 */
export async function whichOnPath(binary: string): Promise<string | null> {
	const isWindows = process.platform === "win32"
	const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)
	const candidates = isWindows
		? [binary, ...windowsExecExts().map((ext) => binary + ext)]
		: [binary]

	for (const dir of dirs) {
		for (const name of candidates) {
			const full = path.join(dir, name)
			try {
				accessSync(full)
				return full
			} catch {
				// Not here; keep scanning.
			}
		}
	}
	return null
}

/** Run a binary and return combined stdout+stderr, capped and never throwing. */
export function runCapture(binary: string, args: string[]): Promise<string> {
	return new Promise((resolve) => {
		execFile(
			binary,
			args,
			{ timeout: 5_000, maxBuffer: 1024 * 1024, windowsHide: true },
			(_err, stdout, stderr) => {
				resolve(`${stdout ?? ""}${stderr ?? ""}`.trim())
			},
		)
	})
}

/** Real host implementation backed by Node's child_process and filesystem. */
export function createNodeHost(): DetectionHost {
	return {
		which: whichOnPath,
		run: runCapture,
		pathExists: (p: string) => {
			try {
				accessSync(expandHome(p))
				return true
			} catch {
				return false
			}
		},
	}
}
