import { type ChildProcess, spawn } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { whichOnPath } from "@palot/cli-registry"
import { createLogger } from "./logger"

const log = createLogger("opencode-runtime")

const DEFAULT_READY_PATH = "/session"
const DEFAULT_READY_TIMEOUT_MS = 15_000
const DEFAULT_AUTH_USERNAME = "opencode"

export interface ProjectRuntimeServerProcess {
	url: string
	process: ChildProcess
	binary: string
}

export type ManagedRuntimeServerProcess = ProjectRuntimeServerProcess
export interface OpenCodeServerProcess extends ProjectRuntimeServerProcess {}

export interface StartProjectRuntimeServerOptions {
	hostname: string
	port: number
	password?: string | null
	mdns?: boolean
	mdnsDomain?: string
	cwd?: string
	timeoutMs?: number
}

export type StartManagedRuntimeServerOptions = StartProjectRuntimeServerOptions
export interface StartOpenCodeServerOptions extends StartProjectRuntimeServerOptions {}

export function getProjectRuntimeBinDir(): string {
	return path.join(homedir(), ".opencode", "bin")
}

export const getManagedRuntimeBinDir = getProjectRuntimeBinDir
export const getOpenCodeBinDir = getProjectRuntimeBinDir

export function getProjectRuntimeAugmentedPath(basePath = process.env.PATH ?? ""): string {
	const sep = process.platform === "win32" ? ";" : ":"
	const binDir = getProjectRuntimeBinDir()
	const segments = basePath.split(sep).filter(Boolean)
	if (segments.includes(binDir)) return basePath
	return basePath ? `${binDir}${sep}${basePath}` : binDir
}

export const getManagedRuntimeAugmentedPath = getProjectRuntimeAugmentedPath
export const getOpenCodeAugmentedPath = getProjectRuntimeAugmentedPath

export async function resolveProjectRuntimeBinary(
	augmentedPath = getProjectRuntimeAugmentedPath(),
): Promise<string> {
	return (
		(await whichOnPath("opencode", augmentedPath)) ??
		(await whichOnPath("opencode-cli", augmentedPath)) ??
		"opencode"
	)
}

export const resolveManagedRuntimeBinary = resolveProjectRuntimeBinary
export const resolveOpenCodeBinary = resolveProjectRuntimeBinary

export function buildProjectRuntimeAuthHeader(
	password: string,
	username = DEFAULT_AUTH_USERNAME,
): string {
	return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

export const buildManagedRuntimeAuthHeader = buildProjectRuntimeAuthHeader
export const buildOpenCodeAuthHeader = buildProjectRuntimeAuthHeader

function createHeaders(authHeader?: string | null): Record<string, string> | undefined {
	if (!authHeader) return undefined
	return { Authorization: authHeader }
}

export function createMainProcessProjectRuntimeClient(args: {
	baseUrl: string
	directory?: string
	authHeader?: string | null
}): OpencodeClient {
	return createOpencodeClient({
		baseUrl: args.baseUrl,
		...(args.directory ? { directory: args.directory } : {}),
		...(args.authHeader ? { headers: createHeaders(args.authHeader) } : {}),
	})
}

export const createMainProcessManagedRuntimeClient = createMainProcessProjectRuntimeClient
export const createMainProcessOpenCodeClient = createMainProcessProjectRuntimeClient

export async function probeProjectRuntimeServer(
	url: string,
	args: {
		authHeader?: string | null
		timeoutMs?: number
		pathname?: string
		okStatuses?: number[]
	} = {},
): Promise<boolean> {
	try {
		const res = await fetch(`${url}${args.pathname ?? DEFAULT_READY_PATH}`, {
			headers: createHeaders(args.authHeader),
			signal: AbortSignal.timeout(args.timeoutMs ?? 2_000),
		})
		const okStatuses = args.okStatuses ?? [200]
		if (okStatuses.includes(res.status)) {
			log.debug("OpenCode probe OK", { url })
			return true
		}
		log.debug("OpenCode probe returned error status", { url, status: res.status })
	} catch (err) {
		log.debug("OpenCode probe failed", { url, reason: String(err) })
	}
	return false
}

export const probeManagedRuntimeServer = probeProjectRuntimeServer
export const probeOpenCodeServer = probeProjectRuntimeServer

export async function waitForProjectRuntimeServer(
	url: string,
	args: {
		authHeader?: string | null
		timeoutMs?: number
		pollMs?: number
		pathname?: string
	} = {},
): Promise<void> {
	const start = Date.now()
	const timeoutMs = args.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS
	const pollMs = args.pollMs ?? 250
	let attempts = 0

	while (Date.now() - start < timeoutMs) {
		attempts++
		try {
			const res = await fetch(`${url}${args.pathname ?? DEFAULT_READY_PATH}`, {
				headers: createHeaders(args.authHeader),
				signal: AbortSignal.timeout(1_000),
			})
			if (res.ok) {
				log.debug("OpenCode runtime ready", {
					url,
					attempts,
					elapsed: Date.now() - start,
				})
				return
			}
			log.debug("OpenCode runtime not ready yet", { url, status: res.status, attempts })
		} catch (err) {
			log.debug("OpenCode runtime not ready yet", {
				url,
				reason: String(err),
				attempts,
			})
		}
		await sleep(pollMs)
	}

	throw new Error(`Project runtime at ${url} did not become ready within ${timeoutMs}ms`)
}

export const waitForManagedRuntimeServer = waitForProjectRuntimeServer
export const waitForOpenCodeServer = waitForProjectRuntimeServer

export async function startProjectRuntimeServerProcess(
	options: StartProjectRuntimeServerOptions,
): Promise<ProjectRuntimeServerProcess> {
	const augmentedPath = getProjectRuntimeAugmentedPath()
	const binary = await resolveProjectRuntimeBinary(augmentedPath)
	const args = ["serve", `--hostname=${options.hostname}`, `--port=${options.port}`]

	if (options.password) {
		args.push(`--password=${options.password}`)
	}
	if (options.mdns) {
		args.push("--mdns")
		if (options.mdnsDomain) {
			args.push(`--mdns-domain=${options.mdnsDomain}`)
		}
	}

	log.info("Starting OpenCode runtime", {
		hostname: options.hostname,
		port: options.port,
		binary,
		mdns: !!options.mdns,
		hasPassword: !!options.password,
	})

	const proc = spawn(binary, args, {
		cwd: options.cwd ?? homedir(),
		stdio: "pipe",
		env: { ...process.env, PATH: augmentedPath },
	})

	const url = `http://${options.hostname}:${options.port}`
	let startupStderr = ""
	proc.stderr?.on("data", (chunk: Buffer | string) => {
		const text = String(chunk)
		startupStderr = `${startupStderr}${text}`.slice(-4_000)
	})
	await new Promise<void>((resolve, reject) => {
		const onError = (err: unknown) => {
			cleanup()
			reject(err)
		}
		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			cleanup()
			reject(
				new Error(
					`Managed runtime exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "null"})${startupStderr.trim() ? `: ${startupStderr.trim()}` : ""}`,
				),
			)
		}
		const cleanup = () => {
			proc.off("error", onError)
			proc.off("exit", onExit)
		}

		proc.once("error", onError)
		proc.once("exit", onExit)
		void waitForProjectRuntimeServer(url, {
			authHeader: options.password ? buildProjectRuntimeAuthHeader(options.password) : null,
			timeoutMs: options.timeoutMs,
		}).then(
			() => {
				cleanup()
				resolve()
			},
			(err) => {
				cleanup()
				reject(err)
			},
		)
	})

	return { url, process: proc, binary }
}

export const startManagedRuntimeServerProcess = startProjectRuntimeServerProcess
export const startOpenCodeServerProcess = startProjectRuntimeServerProcess
