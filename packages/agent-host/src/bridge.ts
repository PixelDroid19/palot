/**
 * The GCode bridge: a loopback-only HTTP server that lets a running CLI agent
 * use the platform — host tools, peer agents, and shared context. CLIs reach
 * it through the stdio MCP proxy (see `mcp-proxy.ts`), which adapters wire in
 * as an MCP server named "gcode".
 *
 * Host tools (automation, system, browser, agents, context) are registered on
 * {@link AgentHost.tools} and exposed generically — not reimplemented per CLI.
 *
 * Security: binds 127.0.0.1 only and requires a per-bridge bearer token that
 * is handed to CLIs via environment, never written to disk.
 */
import { randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import type { AgentHost } from "./host"
import type { BridgeInfo } from "./types"

const MAX_BODY_BYTES = 512 * 1024
/** Delegated runs get a tighter default budget than interactive turns. */
const DELEGATE_TIMEOUT_MS = 5 * 60 * 1000

export interface BridgeOptions {
	/** Absolute path where the MCP proxy script lives (embedder writes it). */
	proxyScriptPath: string
	/** Node-compatible binary to run the proxy with. */
	nodeBinary: string
	/** Fixed port for tests; defaults to an ephemeral port. */
	port?: number
}

async function readBody(req: IncomingMessage): Promise<string> {
	let size = 0
	const chunks: Buffer[] = []
	for await (const chunk of req) {
		size += (chunk as Buffer).length
		if (size > MAX_BODY_BYTES) throw new Error("Request body too large")
		chunks.push(chunk as Buffer)
	}
	return Buffer.concat(chunks).toString("utf8")
}

function json(res: ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body)
	res.writeHead(status, { "content-type": "application/json" })
	res.end(payload)
}

export class AgentBridge {
	private server: Server | null = null
	private info: BridgeInfo | null = null
	private readonly token = randomBytes(24).toString("hex")

	constructor(
		private readonly host: AgentHost,
		private readonly options: BridgeOptions,
	) {}

	/** Current connection info for injecting into runs; null until started. */
	getInfo(): BridgeInfo | null {
		return this.info
	}

	async start(): Promise<BridgeInfo> {
		if (this.info) return this.info
		const server = createServer((req, res) => {
			this.handle(req, res).catch((err) => {
				json(res, 500, { error: err instanceof Error ? err.message : String(err) })
			})
		})
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject)
			server.listen(this.options.port ?? 0, "127.0.0.1", resolve)
		})
		this.server = server
		const { port } = server.address() as AddressInfo
		this.info = {
			url: `http://127.0.0.1:${port}`,
			token: this.token,
			proxyScriptPath: this.options.proxyScriptPath,
			nodeBinary: this.options.nodeBinary,
		}
		this.host.setBridgeInfoProvider(() => this.info)
		return this.info
	}

	async stop(): Promise<void> {
		if (!this.server) return
		await new Promise<void>((resolve) => this.server?.close(() => resolve()))
		this.server = null
		this.info = null
	}

	private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
		if (req.headers.authorization !== `Bearer ${this.token}`) {
			json(res, 401, { error: "Unauthorized" })
			return
		}
		const url = new URL(req.url ?? "/", "http://127.0.0.1")
		const route = `${req.method} ${url.pathname}`

		// --- Host tool plane (primary surface for all harnesses) ---

		if (route === "GET /v1/tools") {
			json(res, 200, { tools: this.host.tools.listForMcp() })
			return
		}

		if (route === "POST /v1/tools/call") {
			const body = JSON.parse((await readBody(req)) || "{}") as {
				name?: string
				arguments?: Record<string, unknown>
				cwd?: string
				callerRuntimeId?: string
			}
			if (!body.name || typeof body.name !== "string") {
				json(res, 400, { error: "name is required" })
				return
			}
			try {
				const result = await this.host.tools.call(body.name, body.arguments ?? {}, {
					cwd: body.cwd,
					callerRuntimeId: body.callerRuntimeId,
				})
				json(res, 200, { result })
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				// Fail closed: unknown tool / backend errors return 404/502 with message
				const status = /Unknown host tool/i.test(message) ? 404 : 502
				json(res, status, { error: message })
			}
			return
		}

		// --- Legacy convenience routes (still used by older proxies / tests) ---

		if (route === "GET /v1/agents") {
			json(res, 200, { agents: this.host.listRuntimes() })
			return
		}

		if (route === "POST /v1/delegate") {
			const body = JSON.parse((await readBody(req)) || "{}") as {
				agent?: string
				prompt?: string
				cwd?: string
				sandbox?: "read-only" | "workspace-write" | "danger-full-access"
				model?: string
			}
			if (!body.agent || !body.prompt || !body.cwd) {
				json(res, 400, { error: "agent, prompt and cwd are required" })
				return
			}
			try {
				const result = await this.host.delegate({
					runtimeId: body.agent,
					prompt: body.prompt,
					cwd: body.cwd,
					sandbox: body.sandbox,
					model: body.model,
					timeoutMs: DELEGATE_TIMEOUT_MS,
				})
				json(res, 200, { message: result.message, notices: result.notices })
			} catch (err) {
				json(res, 502, { error: err instanceof Error ? err.message : String(err) })
			}
			return
		}

		if (route === "GET /v1/context") {
			json(res, 200, { entries: this.host.context.list() })
			return
		}

		if (route === "POST /v1/context") {
			const body = JSON.parse((await readBody(req)) || "{}") as {
				key?: string
				value?: string
				author?: string
			}
			if (!body.key || typeof body.value !== "string") {
				json(res, 400, { error: "key and value are required" })
				return
			}
			const entry = this.host.context.set(body.key, body.value, body.author ?? "agent")
			json(res, 200, { entry })
			return
		}

		json(res, 404, { error: `No route: ${route}` })
	}
}
