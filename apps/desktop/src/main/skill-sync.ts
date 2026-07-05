import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createLogger } from "./logger"
import { getSettings } from "./settings-store"

const log = createLogger("skill-sync")

export type SkillSyncDirection = "push" | "pull"

export interface SkillSyncResult {
	success: boolean
	output: string
	error?: string
}

/** Local OpenCode user-level skills directory. */
function localSkillsDir(): string {
	return path.join(os.homedir(), ".config", "opencode", "skills")
}

function run(cmd: string, args: string[]): Promise<SkillSyncResult> {
	return new Promise((resolve) => {
		execFile(cmd, args, { timeout: 120_000 }, (err, stdout, stderr) => {
			const output = `${stdout}${stderr}`.trim()
			if (err) {
				resolve({ success: false, output, error: err.message })
			} else {
				resolve({ success: true, output })
			}
		})
	})
}

/**
 * Sync user-level skills to/from a remote host over SSH using rsync.
 *
 * `push` uploads the local skills dir to the remote; `pull` downloads it.
 * Requires rsync + ssh on the PATH and a configured host in settings.
 */
export async function syncSkills(direction: SkillSyncDirection): Promise<SkillSyncResult> {
	const { host, remotePath, port } = getSettings().skillSync
	if (!host || !remotePath) {
		return { success: false, output: "", error: "SSH host and remote path must be configured" }
	}

	const local = localSkillsDir()
	if (direction === "push" && !fs.existsSync(local)) {
		return { success: false, output: "", error: `Local skills directory not found: ${local}` }
	}
	if (direction === "push") {
		fs.mkdirSync(local, { recursive: true })
	}

	// Trailing slashes make rsync copy directory *contents* rather than nesting.
	const localSpec = `${local.replace(/\/?$/, "")}/`
	const remoteSpec = `${host}:${remotePath.replace(/\/?$/, "")}/`
	const sshCmd = `ssh -p ${port || 22} -o BatchMode=yes -o StrictHostKeyChecking=accept-new`

	const args = ["-avz", "--delete", "-e", sshCmd]
	if (direction === "push") {
		args.push(localSpec, remoteSpec)
	} else {
		args.push(remoteSpec, localSpec)
	}

	log.info("Syncing skills", { direction, host, remotePath, port })
	const result = await run("rsync", args)
	log.info("Skill sync finished", { direction, success: result.success })
	return result
}
