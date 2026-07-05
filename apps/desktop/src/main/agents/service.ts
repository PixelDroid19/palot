/**
 * Desktop wiring for the agent platform. The actual core (adapters, runner,
 * host, bridge, shared context) lives in `@palot/agent-host`; this file only
 * owns the Electron-specific pieces: a lazy singleton, where the MCP proxy
 * script is written, which Node binary CLIs use to launch it, and the
 * run/cancel functions the IPC layer calls.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	AgentBridge,
	AgentHost,
	MCP_PROXY_SOURCE,
	type AgentRunOptions,
	type AgentRunResult,
	type AgentRuntimeId,
	type AgentUpdate,
} from "@palot/agent-host"
import { whichOnPath } from "@palot/cli-registry"
import { app } from "electron"
import { createLogger } from "../logger"

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
 * A bridge failure only disables cross-agent tools — runs still work.
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

/** Run one agent turn, streaming normalized updates. Called from IPC. */
export async function runAgent(
	runId: string,
	runtimeId: AgentRuntimeId,
	opts: AgentRunOptions & { sessionKey?: string },
	onUpdate: (update: AgentUpdate) => void,
): Promise<AgentRunResult> {
	await ensureBridge()
	const { sessionKey, ...runOpts } = opts
	return getAgentHost().run(runId, runtimeId, runOpts, { sessionKey, onUpdate })
}

/** Cancel a running agent turn. Returns true if a matching run was killed. */
export function cancelAgent(runId: string): boolean {
	return getAgentHost().cancel(runId)
}

export async function stopAgentBridge(): Promise<void> {
	await bridgeSingleton?.stop()
	bridgeSingleton = null
	bridgeStarting = null
}
