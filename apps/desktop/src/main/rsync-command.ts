/**
 * Pure construction of the rsync argument vector used to sync skills over SSH.
 * Isolated from host APIs (child_process/fs/settings) so the command — which is
 * security- and correctness-sensitive — can be unit-tested exactly.
 */

export type SkillSyncDirection = "push" | "pull"

export interface RsyncSpec {
	direction: SkillSyncDirection
	/** SSH target, e.g. "user@host". */
	host: string
	/** Remote path to the skills directory. */
	remotePath: string
	/** Local skills directory (absolute). */
	localDir: string
	/** SSH port; falls back to 22 when unset/zero. */
	port?: number
}

/** Ensure exactly one trailing slash so rsync copies contents, not the dir itself. */
function withTrailingSlash(p: string): string {
	return `${p.replace(/\/+$/, "")}/`
}

/**
 * Build the argument vector for `rsync`. Uses archive+compress, mirrors with
 * `--delete`, and drives a non-interactive SSH transport. Source/destination
 * order is swapped based on direction.
 */
export function buildRsyncArgs(spec: RsyncSpec): string[] {
	const localSpec = withTrailingSlash(spec.localDir)
	const remoteSpec = `${spec.host}:${withTrailingSlash(spec.remotePath)}`
	const sshCmd = `ssh -p ${spec.port || 22} -o BatchMode=yes -o StrictHostKeyChecking=accept-new`

	const args = ["-avz", "--delete", "-e", sshCmd]
	if (spec.direction === "push") {
		args.push(localSpec, remoteSpec)
	} else {
		args.push(remoteSpec, localSpec)
	}
	return args
}
