import type { ChildProcess } from "node:child_process"
import { dialog } from "electron"
import type { LocalServerConfig } from "../preload/api"
import { DEFAULT_LOCAL_SERVER } from "../shared/server-config"
import { getCredential } from "./credential-store"
import { findFreePort } from "./find-free-port"
import { createLogger } from "./logger"
import {
	buildOpenCodeAuthHeader,
	probeOpenCodeServer,
	startOpenCodeServerProcess,
} from "./opencode-runtime"
import { startNotificationWatcher, stopNotificationWatcher } from "./notification-watcher"
import { getListeningProcessOwner, isCurrentUser, isProcessAlive } from "./process-owner"
import { readLockfile, removeLockfile, writeLockfile } from "./server-lockfile"
import { getSettings } from "./settings-store"
import { waitForEnv } from "./shell-env"

const log = createLogger("opencode-manager")

// ============================================================
// Types
// ============================================================

export interface ManagedRuntimeServer {
	url: string
	pid: number | null
	managed: boolean
}

export interface OpenCodeServer extends ManagedRuntimeServer {}

/** Result of detecting an existing server on the target port. */
type DetectionResult =
	| { kind: "found"; server: OpenCodeServer }
	| { kind: "auth-failed"; url: string }
	| { kind: "conflict"; url: string; ownerUid: number | null }
	| { kind: "none" }

// ============================================================
// State -- single server
// ============================================================

let singleServer: {
	server: OpenCodeServer
	process: ChildProcess | null
	authHeader: string | null
} | null = null

const DEFAULT_PORT = 4101
const DEFAULT_HOSTNAME = "127.0.0.1"

// ============================================================
// Public API
// ============================================================

/** Reads the local server config from persisted settings. */
function getLocalServerConfig(): LocalServerConfig {
	const settings = getSettings()
	const local = settings.servers.servers.find((s) => s.id === "local")
	return (local as LocalServerConfig) ?? DEFAULT_LOCAL_SERVER
}

/**
 * Ensures the single OpenCode server is running.
 * Starts it if not already running. Returns the server info.
 *
 * Performs ownership checks to prevent connecting to a server owned by a
 * different OS user. If a conflict is detected, prompts the user with a
 * dialog offering to start on a different port or connect anyway.
 */
export async function ensureManagedRuntimeServer(): Promise<ManagedRuntimeServer> {
	if (singleServer) {
		log.debug("Server already running", {
			url: singleServer.server.url,
			pid: singleServer.server.pid,
		})
		return singleServer.server
	}

	// Ensure the full shell environment is available before spawning the server.
	// startEnvResolution() fires early in app startup; by the time the renderer
	// triggers ensureServer() the promise is usually already resolved.
	await waitForEnv()

	const config = getLocalServerConfig()
	const hostname = config.hostname || DEFAULT_HOSTNAME
	const port = config.port || DEFAULT_PORT
	const localPassword = config.hasPassword ? getCredential("local") : null
	const authHeader = localPassword ? buildOpenCodeAuthHeader(localPassword) : null

	// --- Fast-path: check our own lockfile first ---
	const lockfile = readLockfile()
	if (lockfile) {
		const lockResult = await handleLockfile(lockfile, hostname, authHeader)
		if (lockResult) return lockResult
	}

	// --- Probe the target port for an existing server ---
	log.info("Checking for existing server on port", port)
	const detection = await detectExistingServer(hostname, port, authHeader)

	if (detection.kind === "found") {
		log.info("Detected existing same-user server", { url: detection.server.url })
		singleServer = { server: detection.server, process: null, authHeader }
		startNotificationWatcher(detection.server.url, authHeader)
		return detection.server
	}

	if (detection.kind === "auth-failed") {
		throw new Error(
			authHeader
				? "An OpenCode server is already running on this port, but the saved local password did not authenticate. Update the local server password or stop the running server."
				: "An OpenCode server is already running on this port and requires a password. Save the local server password or stop the running server.",
		)
	}

	if (detection.kind === "conflict") {
		return handleConflict(detection, hostname, port, config, localPassword, authHeader)
	}

	// --- No existing server: spawn one on the configured port ---
	return spawnServer(hostname, port, config, localPassword, authHeader)
}

export const ensureServer = ensureManagedRuntimeServer

/**
 * Gets the single server URL, or null if not running.
 */
export function getManagedRuntimeUrl(): string | null {
	return singleServer?.server.url ?? null
}

export const getServerUrl = getManagedRuntimeUrl

export function getManagedRuntimeAuthHeader(): string | null {
	return singleServer?.authHeader ?? null
}

export const getServerAuthHeader = getManagedRuntimeAuthHeader

/**
 * Stops the single server if we manage it and removes the lockfile.
 */
export function stopManagedRuntimeServer(): boolean {
	stopNotificationWatcher()
	if (!singleServer?.process) {
		log.debug("No managed server to stop")
		singleServer = null
		removeLockfile()
		return false
	}
	log.info("Stopping managed server", { pid: singleServer.process.pid })
	singleServer.process.kill()
	singleServer = null
	removeLockfile()
	return true
}

export const stopServer = stopManagedRuntimeServer

/**
 * Restarts the managed server (stop + start). Used when local server
 * settings (hostname, port, password) change.
 */
export async function restartManagedRuntimeServer(): Promise<ManagedRuntimeServer> {
	log.info("Restarting server due to settings change")
	stopManagedRuntimeServer()
	return ensureManagedRuntimeServer()
}

export const restartServer = restartManagedRuntimeServer

// ============================================================
// Internal -- lockfile handling
// ============================================================

/**
 * Attempts to reconnect to a server described by an existing lockfile.
 * Returns an OpenCodeServer if successful, null if the lockfile is stale
 * or the server belongs to a different user (lockfile is cleaned up and
 * the caller should fall through to normal detection).
 */
async function handleLockfile(
	lockfile: { port: number; pid: number; startedAt: string },
	hostname: string,
	authHeader: string | null,
): Promise<OpenCodeServer | null> {
	if (!isProcessAlive(lockfile.pid)) {
		log.info("Stale lockfile detected (PID dead), cleaning up", {
			pid: lockfile.pid,
			port: lockfile.port,
		})
		removeLockfile()
		return null
	}

	// PID is alive -- verify it's ours
	const owner = await getListeningProcessOwner(lockfile.port)
	if (owner && !isCurrentUser(owner.uid)) {
		log.warn("Lockfile PID is alive but owned by different user", {
			pid: lockfile.pid,
			uid: owner.uid,
		})
		removeLockfile()
		return null // Fall through to normal detection, which will trigger the conflict dialog
	}

	// PID alive + same user: probe to confirm it's actually an opencode server
	const url = `http://${hostname}:${lockfile.port}`
	if (await probeServer(url, authHeader)) {
		log.info("Reconnecting to server from lockfile", { url, pid: lockfile.pid })
		const server: OpenCodeServer = { url, pid: lockfile.pid, managed: false }
		singleServer = { server, process: null, authHeader }
		startNotificationWatcher(url, authHeader)
		return server
	}

	// PID alive but not responding on the expected port -- stale lockfile
	log.info("Lockfile PID alive but server not responding, cleaning up", {
		pid: lockfile.pid,
		port: lockfile.port,
	})
	removeLockfile()
	return null
}

// ============================================================
// Internal -- detection with ownership check
// ============================================================

/**
 * Probes the target port for an existing OpenCode server and checks
 * whether the listening process belongs to the current OS user.
 */
async function detectExistingServer(
	hostname: string,
	port: number,
	authHeader: string | null,
): Promise<DetectionResult> {
	const url = `http://${hostname}:${port}`
	const isReadyWithAuth = await probeServer(url, authHeader, [200])
	const isResponding =
		isReadyWithAuth || (await probeServer(url, null, [200, 401, 403]))
	if (!isResponding) {
		return { kind: "none" }
	}

	// Something is listening -- check who owns it
	const owner = await getListeningProcessOwner(port)

	if (!owner) {
		// Can't determine ownership (Windows, or lsof failed). On Windows this
		// is expected; on macOS/Linux treat as a soft conflict with a less
		// alarming prompt.
		if (process.platform === "win32") {
			log.debug("Existing server responded OK (ownership check skipped on Windows)", { url })
			return { kind: "found", server: { url, pid: null, managed: false } }
		}
		log.warn("Existing server found but could not determine owner", { url })
		return { kind: "conflict", url, ownerUid: null }
	}

	if (isCurrentUser(owner.uid)) {
		if (!isReadyWithAuth) {
			log.warn("Existing server belongs to current user but authentication failed", {
				url,
				pid: owner.pid,
				uid: owner.uid,
			})
			return { kind: "auth-failed", url }
		}
		log.debug("Existing server belongs to current user", { url, pid: owner.pid, uid: owner.uid })
		return { kind: "found", server: { url, pid: owner.pid, managed: false } }
	}

	log.warn("Existing server belongs to a DIFFERENT user", { url, pid: owner.pid, uid: owner.uid })
	return { kind: "conflict", url, ownerUid: owner.uid }
}

// ============================================================
// Internal -- conflict resolution
// ============================================================

/**
 * Shows a dialog when the server on the target port belongs to a different
 * user. Offers three choices: start on a different port, connect anyway,
 * or cancel.
 */
async function handleConflict(
	conflict: { url: string; ownerUid: number | null },
	hostname: string,
	_configuredPort: number,
	config: LocalServerConfig,
	password: string | null,
	authHeader: string | null,
): Promise<OpenCodeServer> {
	const ownerText =
		conflict.ownerUid !== null
			? `It appears to belong to a different user account (UID ${conflict.ownerUid}).`
			: "Its owner could not be determined."

	const { response } = await dialog.showMessageBox({
		type: "warning",
		title: "Server Ownership Conflict",
		message: "An OpenCode server is already running on the configured port.",
		detail:
			`${ownerText}\n\n` +
			"Connecting to a server owned by another user is a security risk: " +
			"they could access your sessions and files.\n\n" +
			"You can start your own server on a different port, or connect anyway " +
			"if you trust this server.",
		buttons: ["Start My Own Server", "Connect Anyway", "Cancel"],
		defaultId: 0,
		cancelId: 2,
	})

	if (response === 0) {
		// Start on a free port
		log.info("User chose to start own server on a different port")
		const freePort = await findFreePort(hostname)
		log.info("Found free port", { freePort })
		return spawnServer(hostname, freePort, config, password, authHeader)
	}

	if (response === 1) {
		// Connect anyway (user accepts the risk)
		log.warn("User chose to connect to foreign server anyway", { url: conflict.url })
		const server: OpenCodeServer = { url: conflict.url, pid: null, managed: false }
		// Do not leak the locally configured password to a foreign server.
		singleServer = { server, process: null, authHeader: null }
		startNotificationWatcher(conflict.url, null)
		return server
	}

	// Cancel
	throw new Error("Server connection cancelled by user due to ownership conflict")
}

// ============================================================
// Internal -- server spawning
// ============================================================

/**
 * Spawns a new opencode server process on the given hostname:port.
 * Writes a lockfile on success.
 */
async function spawnServer(
	hostname: string,
	port: number,
	config: LocalServerConfig,
	password: string | null,
	authHeader: string | null,
): Promise<OpenCodeServer> {
	log.info("Starting managed OpenCode runtime", {
		hostname,
		port,
		hasPassword: !!password,
		mdns: !!config.mdns,
	})

	const started = await startOpenCodeServerProcess({
		hostname,
		port,
		password,
		mdns: config.mdns,
		mdnsDomain: config.mdnsDomain ?? undefined,
	})
	const proc = started.process

	const server: OpenCodeServer = {
		url: started.url,
		pid: proc.pid ?? null,
		managed: true,
	}

	singleServer = { server, process: proc, authHeader }

	// Capture stdout/stderr for diagnostics
	proc.stdout?.on("data", (data: Buffer) => {
		const text = data.toString().trim()
		if (text) log.debug(`[stdout] ${text}`)
	})

	proc.stderr?.on("data", (data: Buffer) => {
		const text = data.toString().trim()
		if (text) log.warn(`[stderr] ${text}`)
	})

	// Handle spawn errors (e.g. binary not found)
	proc.on("error", (err) => {
		log.error("Failed to spawn opencode process", err)
		if (singleServer?.process === proc) {
			singleServer = null
			removeLockfile()
		}
	})

	// Clean up on exit -- allow lazy restart on next request
	proc.on("exit", (code, signal) => {
		if (singleServer?.process === proc) {
			log.warn("Server process exited", { pid: proc.pid, code, signal })
			singleServer = null
			removeLockfile()
		}
	})

	// Write lockfile after successful start
	if (proc.pid) {
		writeLockfile(port, proc.pid)
	}

	log.info("Server started successfully", { url: started.url, pid: proc.pid, binary: started.binary })
	startNotificationWatcher(started.url, authHeader)
	return server
}

// ============================================================
// Internal -- HTTP probe & readiness
// ============================================================

/** Quick probe to check if a server responds on the given URL. */
async function probeServer(
	url: string,
	authHeader: string | null,
	okStatuses?: number[],
): Promise<boolean> {
	return probeOpenCodeServer(url, { authHeader, okStatuses })
}
