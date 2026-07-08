/**
 * Desktop wiring for the agent platform. The actual core (providers, sessions,
 * host, bridge, shared context) lives in `@palot/agent-host`; this file only
 * owns the Electron-specific pieces: a lazy singleton, where the MCP proxy
 * script is written, which Node binary CLIs use to launch it, and the
 * session functions the IPC layer calls.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join } from "node:path"
import {
	AgentBridge,
	AgentHost,
	MCP_PROXY_SOURCE,
	type AgentRuntimeCapabilities,
	type AgentPermissionDecision,
	type AgentRunResult,
	type AgentRuntimeDescriptor,
	type AgentRuntimeId,
	type AgentSandbox,
} from "@palot/agent-host"
import { whichOnPath } from "@palot/cli-registry"
import { app } from "electron"
import { detectAgentClis } from "../agent-clis"
import { checkManagedRuntime } from "../compatibility"
import { createLogger } from "../logger"
import { PROJECT_RUNTIME_ID } from "../../shared/runtime-ids"

const log = createLogger("agent-host")

let hostSingleton: AgentHost | null = null
let bridgeSingleton: AgentBridge | null = null
let bridgeStarting: Promise<void> | null = null

export function getAgentHost(): AgentHost {
	hostSingleton ??= new AgentHost()
	return hostSingleton
}

/**
 * Start the inter-agent bridge (idempotent). CLIs launched afterwards get the
 * `palot` MCP server injected, giving them palot_delegate + shared context.
 * A bridge failure only disables cross-agent tools — sessions still work.
 */
async function ensureBridge(): Promise<void> {
	if (bridgeSingleton?.getInfo()) return
	bridgeStarting ??= (async () => {
		const dir = join(app.getPath("userData"), "agent-bridge")
		mkdirSync(dir, { recursive: true })
		const proxyScriptPath = join(dir, "palot-mcp.cjs")
		writeFileSync(proxyScriptPath, MCP_PROXY_SOURCE)

		// Prefer a real Node from PATH; fall back to Electron-as-Node.
		const systemNode = await whichOnPath("node")
		const bridge = new AgentBridge(getAgentHost(), {
			proxyScriptPath,
			nodeBinary: systemNode ?? process.execPath,
		})
		const info = await bridge.start()
		if (!systemNode) info.proxyEnv = { ELECTRON_RUN_AS_NODE: "1" }
		bridgeSingleton = bridge
		log.info("Agent bridge started", { url: info.url, node: systemNode ?? "electron" })
	})().catch((err) => {
		bridgeStarting = null
		log.error("Agent bridge failed to start; cross-agent tools disabled", {}, err)
	})
	await bridgeStarting
}

/** Image attachment sent from the renderer as a data URL. */
export interface AgentImageAttachment {
	dataUrl: string
	filename?: string
}

export interface SessionRuntimeDescriptor extends AgentRuntimeDescriptor {
	mode: "project" | "cli"
	sessionCapabilities: {
		supportsSessionRevert: boolean
		supportsSessionSummarize: boolean
		supportsServerSlashCommands: boolean
		supportsFork: boolean
		supportsProjectRuntimeConfig: boolean
		supportsWorktreeLaunch: boolean
		supportsServerHistory: boolean
	}
	setup: {
		description: string
		version: string | null
		compatible: boolean
		warning: string | null
	}
}

const PROJECT_RUNTIME_DESCRIPTOR_LABEL = "OpenCode"
const PROJECT_RUNTIME_DESCRIPTOR_CAPABILITIES: AgentRuntimeCapabilities = {
	imageInput: true,
	reasoningEffort: false,
	resume: true,
	permissions: true,
	interrupt: true,
	steering: false,
}
const PROJECT_RUNTIME_SESSION_CAPABILITIES: SessionRuntimeDescriptor["sessionCapabilities"] = {
	supportsSessionRevert: true,
	supportsSessionSummarize: true,
	supportsServerSlashCommands: true,
	supportsFork: true,
	supportsProjectRuntimeConfig: true,
	supportsWorktreeLaunch: true,
	supportsServerHistory: true,
}
const CLI_RUNTIME_SESSION_CAPABILITIES: SessionRuntimeDescriptor["sessionCapabilities"] = {
	supportsSessionRevert: false,
	supportsSessionSummarize: false,
	supportsServerSlashCommands: false,
	supportsFork: false,
	supportsProjectRuntimeConfig: false,
	supportsWorktreeLaunch: false,
	supportsServerHistory: false,
}

/**
 * Materialize renderer image attachments (data URLs) as temp files the CLI can
 * read. Returns the paths plus a cleanup function.
 */
function writeImageFiles(images: AgentImageAttachment[]): { paths: string[]; cleanup: () => void } {
	const dir = join(tmpdir(), `palot-images-${Math.random().toString(36).slice(2)}`)
	mkdirSync(dir, { recursive: true })
	const paths: string[] = []
	for (const [index, image] of images.entries()) {
		const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(image.dataUrl)
		if (!match) continue
		const [, mime, isBase64, data] = match
		const ext =
			(image.filename && extname(image.filename)) ||
			(mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png")
		const file = join(dir, `image-${index}${ext}`)
		writeFileSync(file, isBase64 ? Buffer.from(data, "base64") : decodeURIComponent(data))
		paths.push(file)
	}
	return { paths, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function describeProjectRuntime(detection?: {
	binaryPath: string | null
	installHint: string
}): Promise<SessionRuntimeDescriptor> {
	return checkManagedRuntime().then((runtime) => ({
		id: PROJECT_RUNTIME_ID,
		displayName: PROJECT_RUNTIME_DESCRIPTOR_LABEL,
		mode: "project",
		installed: runtime.installed,
		capabilities: PROJECT_RUNTIME_DESCRIPTOR_CAPABILITIES,
		sessionCapabilities: PROJECT_RUNTIME_SESSION_CAPABILITIES,
		setup: {
			description: runtime.path ?? detection?.binaryPath ?? detection?.installHint ?? "Checking...",
			version: runtime.version,
			compatible: runtime.compatible,
			warning: runtime.compatible ? null : runtime.message,
		},
		models: [],
	}))
}

/** Session runtime descriptors (managed + CLI) for runtime pickers and setup UI. */
export async function describeSessionRuntimes(): Promise<SessionRuntimeDescriptor[]> {
	const [cliDetections, cliRuntimes] = await Promise.all([
		detectAgentClis(),
		getAgentHost().describeRuntimes(),
	])
	const detections = new Map(cliDetections.map((runtime) => [runtime.id, runtime]))
	const projectRuntime = await describeProjectRuntime(detections.get(PROJECT_RUNTIME_ID))
	return [
		projectRuntime,
		...cliRuntimes.map((runtime) => ({
			...runtime,
			mode: "cli" as const,
			sessionCapabilities: CLI_RUNTIME_SESSION_CAPABILITIES,
			setup: {
				description: detections.get(runtime.id)?.installed
					? (detections.get(runtime.id)?.binaryPath ?? "")
					: (detections.get(runtime.id)?.installHint ?? ""),
				version: detections.get(runtime.id)?.version ?? null,
				compatible: detections.get(runtime.id)?.installed ?? false,
				warning: null,
			},
		})),
	]
}

export interface AgentSessionOpenOptions {
	cwd: string
	sandbox?: AgentSandbox
	model?: string
	reasoningEffort?: string
	resumeId?: string
}

/** Open (or reuse) the persistent session backing a chat. Called from IPC. */
export async function openAgentSession(
	sessionId: string,
	runtimeId: AgentRuntimeId,
	opts: AgentSessionOpenOptions,
): Promise<{ threadId: string | null }> {
	await ensureBridge()
	const session = await getAgentHost().openSession(sessionId, runtimeId, opts)
	return { threadId: session.threadId }
}

export interface AgentPromptOptions {
	text: string
	model?: string
	reasoningEffort?: string
	sandbox?: AgentSandbox
	imageAttachments?: AgentImageAttachment[]
}

/** Run one turn on an open session, streaming updates via host events. */
export async function promptAgent(
	sessionId: string,
	opts: AgentPromptOptions,
): Promise<AgentRunResult> {
	const images = opts.imageAttachments?.length ? writeImageFiles(opts.imageAttachments) : null
	try {
		return await getAgentHost().prompt(sessionId, {
			text: opts.text,
			model: opts.model,
			reasoningEffort: opts.reasoningEffort,
			sandbox: opts.sandbox,
			images: images?.paths.length ? images.paths : undefined,
		})
	} finally {
		images?.cleanup()
	}
}

/** Inject steering input into the running turn. */
export function steerAgent(sessionId: string, text: string): Promise<void> {
	return getAgentHost().steer(sessionId, text)
}

/** Stop the in-flight turn; the session survives. */
export function interruptAgent(sessionId: string): Promise<boolean> {
	return getAgentHost().interrupt(sessionId)
}

/** Answer a pending tool-approval request. */
export function respondAgentPermission(
	sessionId: string,
	requestId: string,
	decision: AgentPermissionDecision,
): boolean {
	return getAgentHost().respondPermission(sessionId, requestId, decision)
}

/** Answer a pending structured question (Claude's AskUserQuestion tool). */
export function answerAgentQuestion(
	sessionId: string,
	requestId: string,
	answers: Record<string, string>,
): boolean {
	return getAgentHost().answerQuestion(sessionId, requestId, answers)
}

/** Tear down the persistent session (chat deleted / app closing). */
export function closeAgentSession(sessionId: string): Promise<void> {
	return getAgentHost().closeSession(sessionId)
}

export async function stopAgentBridge(): Promise<void> {
	await getAgentHost()
		.dispose()
		.catch(() => {})
	await bridgeSingleton?.stop()
	bridgeSingleton = null
	bridgeStarting = null
	hostSingleton = null
}
