/**
 * Generic ACP (Agent Client Protocol) provider — the Zed protocol spoken over
 * newline-delimited JSON-RPC on a child process's stdio. This is the same
 * transport family as `codex app-server`: one shared process, persistent
 * sessions, streamed `session/update` notifications, interactive
 * `session/request_permission` round-trips and `session/cancel` interrupts.
 *
 * OpenCode (`opencode acp`) is the first adapter built on it; `cursor-agent
 * acp` and `gemini --experimental-acp` can reuse the same class with a
 * different spawn spec.
 *
 * Client→agent: initialize · session/new · session/load · session/prompt ·
 * session/set_mode · session/set_config_option. Agent→client notifications:
 * session/update (agent_message_chunk · agent_thought_chunk · tool_call ·
 * tool_call_update · plan · usage_update · current_mode_update · …).
 * Agent→client REQUESTS: session/request_permission — answered via
 * respondPermission with optionId once/always/reject.
 */
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { extname } from "node:path"
import { JsonRpcConnection } from "../rpc"
import {
	type AgentModelInfo,
	type AgentPermissionDecision,
	type AgentRunResult,
	type AgentSandbox,
	type AgentSession,
	type AgentSessionOptions,
	type AgentSessionProvider,
	type AgentTurnInput,
	type AgentUpdate,
	type AgentUsage,
	asRecord,
	type BridgeInfo,
	DEFAULT_PROCESS_RUNTIME_CAPABILITIES,
	readNumber,
	readString,
} from "../types"

const ACP_PROTOCOL_VERSION = 1
const TOOL_OUTPUT_MAX_CHARS = 4_000

/** How an ACP agent is spawned and presented. */
export interface AcpAgentSpec {
	id: string
	displayName: string
	/** Executable resolved on PATH for install detection. */
	binary: string
	/** Arguments that start the ACP stdio server (e.g. ["acp"]). */
	args: string[]
	/** Fallback catalog when the agent exposes no model config option. */
	fallbackModels?: AgentModelInfo[]
}

/** OpenCode's ACP surface: `opencode acp` (no HTTP server to manage). */
export const OPENCODE_ACP_SPEC: AcpAgentSpec = {
	id: "opencode",
	displayName: "OpenCode",
	binary: "opencode",
	args: ["acp"],
	fallbackModels: [{ slug: "", label: "Default (OpenCode)", efforts: [] }],
}

/**
 * ACP mode per sandbox. OpenCode ships `build` (default permissions) and
 * `plan` (no edit tools). `read-only` maps to plan — the closest native
 * posture; `plan` always wins so a plan turn can never leak writes.
 */
function acpMode(sandbox: AgentSandbox | undefined): string {
	return sandbox === "plan" || sandbox === "read-only" ? "plan" : "build"
}

function imageMimeType(path: string): string {
	switch (extname(path).toLowerCase()) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg"
		case ".webp":
			return "image/webp"
		case ".gif":
			return "image/gif"
		default:
			return "image/png"
	}
}

/** ACP tool-call `kind` → the neutral tool names the UI already knows. */
function toolName(kind: string, title: string): string {
	switch (kind) {
		case "execute":
			return "shell"
		case "edit":
			return "edit"
		case "read":
			return "read"
		case "search":
			return "search"
		case "fetch":
			return "web_search"
		case "delete":
		case "move":
			return "edit"
		default:
			return title || kind || "tool"
	}
}

/** Flatten ACP tool-call content blocks into displayable text. */
function toolOutput(content: unknown): string | undefined {
	if (!Array.isArray(content)) return undefined
	const parts: string[] = []
	for (const entry of content) {
		const item = asRecord(entry)
		if (!item) continue
		if (item.type === "content") {
			const inner = asRecord(item.content)
			const text = readString(inner?.text)
			if (text) parts.push(text)
		} else if (item.type === "diff") {
			const path = readString(item.path)
			if (path) parts.push(`diff: ${path}`)
		} else if (item.type === "terminal") {
			const text = readString(item.output)
			if (text) parts.push(text)
		}
	}
	const joined = parts.join("\n")
	return joined ? joined.slice(0, TOOL_OUTPUT_MAX_CHARS) : undefined
}

/** ACP mcpServers entry for the GCode bridge proxy (stdio transport). */
function bridgeMcpServers(bridge: BridgeInfo | undefined): unknown[] {
	if (!bridge) return []
	const env = [
		...Object.entries(bridge.proxyEnv ?? {}).map(([name, value]) => ({ name, value })),
		{ name: "GCODE_BRIDGE_URL", value: bridge.url },
		{ name: "GCODE_BRIDGE_TOKEN", value: bridge.token },
	]
	return [{ name: "gcode", command: bridge.nodeBinary, args: [bridge.proxyScriptPath], env }]
}

interface PendingTurn {
	resolve: (result: AgentRunResult) => void
	reject: (err: Error) => void
	message: string
	reasoning: string
	notices: string[]
	usage: AgentUsage | null
	/** Any stream activity (message/reasoning/tool) — an all-quiet end_turn is an upstream error. */
	sawActivity: boolean
}

class AcpSession implements AgentSession {
	threadId: string | null = null
	busy = false
	private turn: PendingTurn | null = null
	private currentModel: string | undefined
	private currentMode: string | undefined
	private connectionLost = false
	private pendingPermissions = new Map<string, { resolve: (optionId: string | null) => void }>()
	/** Whether the last emitted content block was reasoning (for separators). */
	private closed = false
	/** Set while session/cancel is in flight so `cancelled` resolves softly. */
	private interrupted = false

	constructor(
		private readonly provider: AcpProvider,
		private readonly opts: AgentSessionOptions,
		private readonly onUpdate: (update: AgentUpdate) => void,
	) {
		this.currentModel = opts.model || undefined
	}

	async open(): Promise<void> {
		const rpc = await this.provider.connection()
		const params = {
			cwd: this.opts.cwd,
			mcpServers: bridgeMcpServers(this.opts.bridge),
		}
		let result: Record<string, unknown> | null = null
		if (this.opts.resumeId) {
			// A stale/missing session id falls back to a fresh session.
			result = asRecord(
				await rpc
					.request("session/load", { sessionId: this.opts.resumeId, ...params })
					.catch(() => null),
			)
			if (result) result = { sessionId: this.opts.resumeId, ...result }
		}
		result ??= asRecord(await rpc.request("session/new", params))
		const sessionId = readString(result?.sessionId)
		if (!sessionId) throw new Error(`${this.provider.displayName} did not return a session id`)
		this.threadId = sessionId
		this.connectionLost = false
		this.provider.registerSession(sessionId, this)
		this.provider.rememberConfigOptions(result)
		this.onUpdate({ kind: "thread", threadId: sessionId })
		const mode = acpMode(this.opts.sandbox)
		this.currentMode = mode
		if (mode !== "build") await this.setMode(mode)
		if (this.currentModel) await this.setModel(this.currentModel)
	}

	private async setMode(modeId: string): Promise<void> {
		const rpc = await this.provider.connection()
		if (this.connectionLost) await this.recover(rpc)
		await rpc.request("session/set_mode", { sessionId: this.threadId, modeId }).catch(() => {})
	}

	private async setModel(model: string): Promise<void> {
		const rpc = await this.provider.connection()
		await rpc
			.request("session/set_config_option", {
				sessionId: this.threadId,
				configId: "model",
				value: model,
			})
			.catch(() => {})
	}

	async send(input: AgentTurnInput): Promise<AgentRunResult> {
		if (this.closed) throw new Error("Session is closed")
		if (this.busy) throw new Error("A turn is already running; interrupt it first")
		const rpc = await this.provider.connection()

		if (input.model !== undefined && input.model !== this.currentModel) {
			this.currentModel = input.model || undefined
			if (this.currentModel) await this.setModel(this.currentModel)
		}
		if (input.sandbox) {
			const mode = acpMode(input.sandbox)
			if (mode !== this.currentMode) {
				this.currentMode = mode
				await this.setMode(mode)
			}
		}

		const prompt: unknown[] = [{ type: "text", text: input.text }]
		for (const path of input.images ?? []) {
			try {
				prompt.push({
					type: "image",
					data: readFileSync(path).toString("base64"),
					mimeType: imageMimeType(path),
				})
			} catch {
				// Unreadable attachment — the text turn still goes through.
			}
		}

		this.busy = true
		this.interrupted = false
		const turn: PendingTurn = {
			resolve: () => {},
			reject: () => {},
			message: "",
			reasoning: "",
			notices: [],
			usage: null,
			sawActivity: false,
		}
		const done = new Promise<AgentRunResult>((resolve, reject) => {
			turn.resolve = resolve
			turn.reject = reject
		})
		this.turn = turn

		rpc
			.request("session/prompt", { sessionId: this.threadId, prompt })
			.then((raw) => this.finishTurn(turn, asRecord(raw)))
			.catch((err: unknown) => {
				if (this.turn !== turn) return
				this.busy = false
				this.turn = null
				this.cancelPendingPermissions()
				turn.reject(err instanceof Error ? err : new Error(String(err)))
			})
		return done
	}

	/** Reattach the persisted ACP session after the shared CLI process restarts. */
	private async recover(rpc: JsonRpcConnection): Promise<void> {
		if (!this.threadId) throw new Error("Cannot recover an ACP session without a thread id")
		const result = await rpc.request("session/load", {
			sessionId: this.threadId,
			cwd: this.opts.cwd,
			mcpServers: bridgeMcpServers(this.opts.bridge),
		})
		this.provider.rememberConfigOptions(asRecord(result))
		this.connectionLost = false
	}

	private finishTurn(turn: PendingTurn, result: Record<string, unknown> | null): void {
		if (this.turn !== turn) return
		this.busy = false
		this.turn = null
		if (!this.closed) this.connectionLost = true
		this.cancelPendingPermissions()
		const stopReason = readString(result?.stopReason)
		const usageRecord = asRecord(result?.usage)
		const usage: AgentUsage | null = usageRecord
			? {
					inputTokens: readNumber(usageRecord.inputTokens),
					cachedInputTokens: readNumber(usageRecord.cachedInputTokens),
					outputTokens: readNumber(usageRecord.outputTokens),
					reasoningOutputTokens: 0,
				}
			: null
		if (usage) this.onUpdate({ kind: "usage", usage })
		const notices = [...turn.notices]
		if (!turn.sawActivity && stopReason === "end_turn") {
			// OpenCode's ACP bridge swallows LLM errors (disabled model, no
			// credits) and reports a clean end_turn with nothing streamed.
			// Surface it instead of showing a silently blank reply.
			const text =
				"The turn ended without any output — the selected model may be unavailable for your account. Try another model."
			notices.push(text)
			this.onUpdate({ kind: "notice", text })
		}
		if (stopReason === "cancelled") notices.push("Turn interrupted")
		else if (stopReason === "refusal") notices.push("The model refused this request")
		else if (stopReason === "max_tokens") notices.push("Turn stopped at the max-token limit")
		const text = turn.message.replace(/^\s+/, "")
		if (text) this.onUpdate({ kind: "message", text })
		turn.resolve({
			message: text,
			threadId: this.threadId,
			usage: usage ?? turn.usage,
			notices,
		})
	}

	// ACP has no mid-turn steering; the UI hides the affordance via capabilities.
	async steer(): Promise<void> {
		throw new Error("Steering is not supported by this runtime")
	}

	async interrupt(): Promise<void> {
		if (!this.busy) return
		this.interrupted = true
		const rpc = await this.provider.connection()
		// Notification per ACP spec; the in-flight prompt resolves with
		// stopReason "cancelled" and the session stays usable.
		rpc.notify("session/cancel", { sessionId: this.threadId })
	}

	respondPermission(requestId: string, decision: AgentPermissionDecision): void {
		const pending = this.pendingPermissions.get(requestId)
		if (!pending) return
		this.pendingPermissions.delete(requestId)
		pending.resolve(
			decision === "accept" ? "once" : decision === "acceptForSession" ? "always" : "reject",
		)
		this.onUpdate({ kind: "permission-resolved", requestId, decision })
	}

	// ACP has no structured-question surface; approvals cover its interaction.
	answerQuestion(): void {}

	async close(): Promise<void> {
		this.closed = true
		this.cancelPendingPermissions()
		if (this.busy) await this.interrupt().catch(() => {})
		if (this.threadId) {
			const rpc = await this.provider.connection().catch(() => null)
			await rpc?.request("session/close", { sessionId: this.threadId }).catch(() => {})
		}
		this.turn?.reject(new Error("Session closed"))
		this.turn = null
		if (this.threadId) this.provider.unregisterSession(this.threadId)
	}

	/** Agent asked for approval; block its RPC until the user decides. */
	handlePermissionRequest(params: Record<string, unknown>): Promise<unknown> {
		const toolCall = asRecord(params.toolCall)
		const options = Array.isArray(params.options) ? params.options : []
		const optionIds = new Map<string, string>()
		for (const entry of options) {
			const option = asRecord(entry)
			const kind = readString(option?.kind)
			const optionId = readString(option?.optionId)
			if (!optionId) continue
			// ACP kinds: allow_once / allow_always / reject_once / reject_always.
			if (kind.startsWith("allow") && kind.includes("always")) optionIds.set("always", optionId)
			else if (kind.startsWith("allow")) optionIds.set("once", optionId)
			else if (!optionIds.has("reject")) optionIds.set("reject", optionId)
		}
		// Full access auto-approves like Codex's "never ask" policy.
		if (this.opts.sandbox === "danger-full-access" || this.closed) {
			const auto = this.closed ? optionIds.get("reject") : optionIds.get("once")
			if (auto) return Promise.resolve({ outcome: { outcome: "selected", optionId: auto } })
		}
		const decisions: AgentPermissionDecision[] = []
		if (optionIds.has("once")) decisions.push("accept")
		if (optionIds.has("always")) decisions.push("acceptForSession")
		if (optionIds.has("reject")) decisions.push("decline")
		const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
		const rawInput = asRecord(toolCall?.rawInput)
		return new Promise((resolve) => {
			this.pendingPermissions.set(requestId, {
				resolve: (choice) => {
					const optionId = choice ? optionIds.get(choice) : undefined
					resolve(
						optionId
							? { outcome: { outcome: "selected", optionId } }
							: { outcome: { outcome: "cancelled" } },
					)
				},
			})
			this.onUpdate({
				kind: "permission",
				request: {
					requestId,
					action: readString(toolCall?.kind) || "tool",
					name: toolName(readString(toolCall?.kind), readString(toolCall?.title)),
					detail:
						readString(rawInput?.command) ||
						readString(rawInput?.filePath) ||
						readString(toolCall?.title) ||
						undefined,
					decisions: decisions.length > 0 ? decisions : ["accept", "decline"],
				},
			})
		})
	}

	handleUpdate(update: Record<string, unknown>): void {
		// ACP sends stream updates before the final session/prompt response.
		// Record activity so a successful tool-only or reasoning-only turn is
		// not mistaken for an upstream model failure.
		if (this.turn) this.turn.sawActivity = true
		switch (readString(update.sessionUpdate)) {
			case "agent_message_chunk": {
				const text = readString(asRecord(update.content)?.text)
				if (!text) return
				if (this.turn) {
					if (!this.turn.message && this.turn.reasoning) {
						// Visual break between a thought block and the answer.
						this.onUpdate({ kind: "message-delta", text: "\n\n" })
					}
					this.turn.message += text
				}
				this.onUpdate({ kind: "message-delta", text })
				return
			}
			case "agent_thought_chunk": {
				const text = readString(asRecord(update.content)?.text)
				if (!text) return
				if (this.turn) this.turn.reasoning += text
				this.onUpdate({ kind: "reasoning-delta", text })
				return
			}
			case "tool_call":
			case "tool_call_update": {
				const status = readString(update.status)
				this.onUpdate({
					kind: "tool",
					id: readString(update.toolCallId) || undefined,
					name: toolName(readString(update.kind), readString(update.title)),
					detail: readString(update.title) || undefined,
					status: status === "completed" ? "completed" : status === "failed" ? "error" : "running",
					output: toolOutput(update.content),
				})
				return
			}
			case "plan": {
				const entries = Array.isArray(update.entries) ? update.entries : []
				const lines = entries
					.map((e) => {
						const entry = asRecord(e)
						const status = readString(entry?.status)
						const mark = status === "completed" ? "[x]" : status === "in_progress" ? "[~]" : "[ ]"
						return `${mark} ${readString(entry?.content)}`
					})
					.filter((line) => line.length > 4)
				if (!lines.length) return
				const done = entries.every((e) => readString(asRecord(e)?.status) === "completed")
				this.onUpdate({
					kind: "tool",
					id: `plan-${this.threadId ?? "session"}`,
					name: "plan",
					status: done ? "completed" : "running",
					output: lines.join("\n"),
				})
				return
			}
			case "current_mode_update": {
				this.currentMode = readString(update.currentModeId) || this.currentMode
				return
			}
			case "usage_update":
			case "available_commands_update":
				// Context-window telemetry / slash-command catalog — no UI slot yet.
				return
			default:
				return
		}
	}

	/** The shared agent process died — fail the in-flight turn, keep resumability. */
	handleConnectionClosed(error: Error | null): void {
		const pending = this.turn
		this.busy = false
		this.turn = null
		this.cancelPendingPermissions()
		if (pending && this.interrupted) {
			pending.resolve({
				message: pending.message.replace(/^\s+/, ""),
				threadId: this.threadId,
				usage: pending.usage,
				notices: [...pending.notices, "Turn interrupted"],
			})
			return
		}
		pending?.reject(error ?? new Error(`${this.provider.displayName} process exited`))
	}

	private cancelPendingPermissions(): void {
		for (const [requestId, pending] of this.pendingPermissions) {
			pending.resolve(null)
			this.onUpdate({ kind: "permission-resolved", requestId, decision: null })
		}
		this.pendingPermissions.clear()
	}
}

export class AcpProvider implements AgentSessionProvider {
	readonly id: string
	readonly displayName: string
	readonly binary: string
	readonly fallbackModels: AgentModelInfo[]
	readonly capabilities = {
		...DEFAULT_PROCESS_RUNTIME_CAPABILITIES,
		reasoningEffort: false,
		imageInput: true,
	}
	readonly sessionCapabilities = {
		supportsSessionRevert: false,
		supportsSessionSummarize: false,
		supportsServerSlashCommands: false,
		supportsFork: false,
		supportsRuntimeConfiguration: false,
		supportsWorktreeLaunch: false,
		supportsServerHistory: false,
	}

	private rpc: JsonRpcConnection | null = null
	private connecting: Promise<JsonRpcConnection> | null = null
	private sessions = new Map<string, AcpSession>()
	/** Model catalog captured from the last session/new configOptions payload. */
	private modelCatalog: AgentModelInfo[] = []

	constructor(
		private readonly spec: AcpAgentSpec,
		private readonly resolveBinary: () => Promise<string | null>,
	) {
		this.id = spec.id
		this.displayName = spec.displayName
		this.binary = spec.binary
		this.fallbackModels = spec.fallbackModels ?? []
	}

	/** Lazily start (and share) the ACP agent process. */
	async connection(): Promise<JsonRpcConnection> {
		if (this.rpc?.alive) return this.rpc
		this.connecting ??= this.start().finally(() => {
			this.connecting = null
		})
		return this.connecting
	}

	private async start(): Promise<JsonRpcConnection> {
		const binary = await this.resolveBinary()
		if (!binary) throw new Error(`${this.displayName} CLI is not installed`)
		const child = spawn(binary, this.spec.args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env },
		})
		const rpc = new JsonRpcConnection(child)
		rpc.onNotification((method, params) => {
			if (method !== "session/update") return
			const record = asRecord(params) ?? {}
			const session = this.sessions.get(readString(record.sessionId))
			const update = asRecord(record.update)
			if (session && update) session.handleUpdate(update)
		})
		rpc.onRequest(async (method, params) => {
			const record = asRecord(params) ?? {}
			const session = this.sessions.get(readString(record.sessionId))
			if (method === "session/request_permission") {
				if (!session) return { outcome: { outcome: "cancelled" } }
				return session.handlePermissionRequest(record)
			}
			// fs/* and terminal/* are not advertised in our clientCapabilities.
			throw new Error(`Unsupported client method: ${method}`)
		})
		rpc.onClose((error) => {
			if (this.rpc === rpc) this.rpc = null
			for (const session of this.sessions.values()) session.handleConnectionClosed(error)
		})
		await rpc.request("initialize", {
			protocolVersion: ACP_PROTOCOL_VERSION,
			clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
			clientInfo: { name: "gcode", title: "GCode", version: "1.0.0" },
		})
		this.rpc = rpc
		return rpc
	}

	registerSession(sessionId: string, session: AcpSession): void {
		this.sessions.set(sessionId, session)
	}

	unregisterSession(sessionId: string): void {
		this.sessions.delete(sessionId)
	}

	/** Cache the model catalog from a session/new result's configOptions. */
	rememberConfigOptions(result: Record<string, unknown> | null): void {
		const configOptions = Array.isArray(result?.configOptions) ? result.configOptions : []
		for (const entry of configOptions) {
			const option = asRecord(entry)
			if (readString(option?.id) !== "model") continue
			const current = readString(option?.currentValue)
			const models: AgentModelInfo[] = []
			if (current) {
				models.push({ slug: "", label: `Default (${current.split("/").pop()})`, efforts: [] })
			}
			for (const raw of Array.isArray(option?.options) ? option.options : []) {
				const model = asRecord(raw)
				const slug = readString(model?.value)
				if (!slug) continue
				models.push({ slug, label: readString(model?.name) || slug, efforts: [] })
			}
			if (models.length > 0) this.modelCatalog = models
		}
	}

	/**
	 * Catalog from the agent's own configOptions. ACP only exposes it inside a
	 * session, so open a throwaway one when nothing is cached yet.
	 */
	async listModels(): Promise<AgentModelInfo[]> {
		if (this.modelCatalog.length > 0) return this.modelCatalog
		try {
			const rpc = await this.connection()
			const result = asRecord(
				await rpc.request("session/new", { cwd: process.cwd(), mcpServers: [] }),
			)
			this.rememberConfigOptions(result)
			const sessionId = readString(result?.sessionId)
			if (sessionId) {
				await rpc.request("session/close", { sessionId }).catch(() => {})
			}
			return this.modelCatalog.length > 0 ? this.modelCatalog : this.fallbackModels
		} catch {
			return this.fallbackModels
		}
	}

	async openSession(
		opts: AgentSessionOptions,
		onUpdate: (update: AgentUpdate) => void,
	): Promise<AgentSession> {
		const session = new AcpSession(this, opts, onUpdate)
		await session.open()
		return session
	}

	async dispose(): Promise<void> {
		this.sessions.clear()
		this.rpc?.close()
		this.rpc = null
	}
}
