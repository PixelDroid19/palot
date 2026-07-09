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
	DEFAULT_MANAGED_SERVER_RUNTIME_CAPABILITIES,
	MCP_PROXY_SOURCE,
	type AgentHostOptions,
	type AgentRuntimeCapabilities,
	type AgentPermissionDecision,
	type AgentRunResult,
	type AgentRuntimeId,
	type AgentSandbox,
	resolveRuntimeTransport,
} from "@palot/agent-host"
import { whichOnPath } from "@palot/cli-registry"
import { app } from "electron"
import { detectAgentClis } from "../agent-clis"
import { checkProjectRuntime } from "../compatibility"
import { createLogger } from "../logger"
import { PROJECT_RUNTIME_ID } from "../../shared/runtime-ids"
import {
	registerManagedServerRuntimeId,
	unregisterManagedServerRuntimeId,
} from "../../shared/runtime-transport-registry"
import {
	resolveProcessBuiltinIds,
	shouldIncludeOpenCode,
} from "./composition"
// Re-export composition API for app entry / tests
export {
	configureRuntimeComposition,
	getRuntimeComposition,
	type RuntimeComposition,
} from "./composition"
import {
	describeRegisteredManagedDescriptors,
	registerRuntimeDescriptorSource,
	unregisterRuntimeDescriptorSource,
	type SessionRuntimeDescriptor,
} from "./descriptor-registry"
import { installDesktopHostToolBackends } from "./host-tool-backends"

export type { SessionRuntimeDescriptor } from "./descriptor-registry"

const log = createLogger("agent-host")

let hostSingleton: AgentHost | null = null
let bridgeSingleton: AgentBridge | null = null
let bridgeStarting: Promise<void> | null = null
let hostOptions: AgentHostOptions = {}
let managedSourcesRegistered = false

/**
 * Compose which process adapters load into AgentHost (before first getAgentHost).
 * Prefer {@link configureRuntimeComposition} for full product composition.
 * Example custom-only: `{ builtinProviders: false, providers: [myHarness] }`.
 */
export function configureAgentHost(options: AgentHostOptions): void {
	if (hostSingleton) {
		log.warn("configureAgentHost called after host was created; restart required for full effect")
	}
	hostOptions = options
}

export function getAgentHost(): AgentHost {
	// Align AgentHost built-ins with product composition when not overridden explicitly.
	if (!hostSingleton && hostOptions.builtinProviders === undefined) {
		const ids = resolveProcessBuiltinIds()
		hostOptions = {
			...hostOptions,
			builtinProviders: ids.length === 0 ? false : ids,
		}
	}
	if (!hostSingleton) {
		hostSingleton = new AgentHost(hostOptions)
		// Host-owned tool plane: automation / system / browser for every harness.
		// Independent of which CLI adapters are plugged in.
		installDesktopHostToolBackends(hostSingleton)
	} else {
		// Long-lived main process (dev hot reload / mid-upgrade): reinstall core
		// host tools if a newer plane (e.g. subagents) is missing.
		ensureHostToolPlaneComplete(hostSingleton)
	}
	return hostSingleton
}

/** Core host tools that must always be present for agentic multi-harness scale. */
const REQUIRED_HOST_TOOLS = [
	"palot_list_agents",
	"palot_delegate",
	"palot_list_subagents",
	"palot_run_subagent",
	"palot_automation_list",
	"palot_system_run",
	"palot_browser_open",
] as const

function ensureHostToolPlaneComplete(host: AgentHost): void {
	const missing = REQUIRED_HOST_TOOLS.filter((name) => !host.tools.has(name))
	if (missing.length === 0) return
	log.warn("Host tool plane incomplete; reinstalling defaults", { missing })
	host.installDefaultHostTools()
	installDesktopHostToolBackends(host)
}

/**
 * Register managed-server descriptor sources per composition.
 * When OpenCode is omitted, does not re-register it (unplug sticks).
 */
export function registerDefaultManagedDescriptorSources(): void {
	if (managedSourcesRegistered) return
	managedSourcesRegistered = true
	if (!shouldIncludeOpenCode()) {
		unregisterRuntimeDescriptorSource(PROJECT_RUNTIME_ID)
		unregisterManagedServerRuntimeId(PROJECT_RUNTIME_ID)
		return
	}
	registerManagedServerRuntimeId(PROJECT_RUNTIME_ID)
	registerRuntimeDescriptorSource({
		id: PROJECT_RUNTIME_ID,
		describe: () => describeOpenCodeAdapter(),
	})
}

/** Force re-evaluation of managed sources after composition changes (tests). */
export function resetManagedDescriptorRegistration(): void {
	managedSourcesRegistered = false
}

/**
 * Start the host tool bridge (idempotent). CLIs launched afterwards get the
 * `palot` MCP server injected with the full host tool plane (automation,
 * system, browser, agents, context) — independent of which harness is running.
 * A bridge failure only disables host tools — sessions still work.
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
		log.info("Agent bridge started", {
			url: info.url,
			node: systemNode ?? "electron",
			hostTools: getAgentHost().tools.list().map((t) => t.name),
		})
	})().catch((err) => {
		bridgeStarting = null
		log.error("Agent bridge failed to start; host tools disabled for CLIs", {}, err)
	})
	await bridgeStarting
}

/** Image attachment sent from the renderer as a data URL. */
export interface AgentImageAttachment {
	dataUrl: string
	filename?: string
}

/** OpenCode is one managed-server adapter — not the product base. */
const OPENCODE_ADAPTER_LABEL = "OpenCode"
const OPENCODE_ADAPTER_CAPABILITIES: AgentRuntimeCapabilities =
	DEFAULT_MANAGED_SERVER_RUNTIME_CAPABILITIES
const OPENCODE_SESSION_CAPABILITIES: SessionRuntimeDescriptor["sessionCapabilities"] = {
	supportsSessionRevert: true,
	supportsSessionSummarize: true,
	supportsServerSlashCommands: true,
	supportsFork: true,
	supportsRuntimeConfiguration: true,
	supportsWorktreeLaunch: true,
	supportsServerHistory: true,
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

async function describeOpenCodeAdapter(): Promise<SessionRuntimeDescriptor> {
	const detections = await detectAgentClis()
	const detection = detections.find((d) => d.id === PROJECT_RUNTIME_ID)
	const runtime = await checkProjectRuntime()
	return {
		id: PROJECT_RUNTIME_ID,
		displayName: OPENCODE_ADAPTER_LABEL,
		installed: runtime.installed,
		capabilities: OPENCODE_ADAPTER_CAPABILITIES,
		sessionCapabilities: OPENCODE_SESSION_CAPABILITIES,
		transport: "managed-server" as const,
		setup: {
			description:
				runtime.path ?? detection?.binaryPath ?? detection?.installHint ?? "Checking...",
			version: runtime.version,
			compatible: runtime.compatible,
			warning: runtime.compatible ? null : runtime.message,
		},
		// Models come from the managed server provider catalog at session time.
		models: [],
	}
}

/**
 * Session runtime descriptors for pickers and setup UI.
 * Managed-server sources (OpenCode, …) come from the descriptor registry;
 * process adapters come from AgentHost — both are pluggable.
 */
export async function describeSessionRuntimes(): Promise<SessionRuntimeDescriptor[]> {
	registerDefaultManagedDescriptorSources()

	const [cliDetections, managedDescriptors, agentHostRuntimes] = await Promise.all([
		detectAgentClis(),
		describeRegisteredManagedDescriptors(),
		getAgentHost().describeRuntimes(),
	])
	const detections = new Map<string, (typeof cliDetections)[number]>(
		cliDetections.map((runtime) => [runtime.id, runtime]),
	)

	const processDescriptors: SessionRuntimeDescriptor[] = agentHostRuntimes.map((runtime) => {
		const transport = resolveRuntimeTransport(runtime)
		const detection = detections.get(runtime.id)
		return {
			...runtime,
			transport,
			setup: {
				description: detection?.installed
					? (detection.binaryPath ?? "")
					: (detection?.installHint ?? ""),
				version: detection?.version ?? null,
				compatible: detection?.installed ?? false,
				warning: null,
			},
		}
	})

	return [...managedDescriptors, ...processDescriptors]
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
