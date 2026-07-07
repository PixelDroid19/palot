/**
 * Codex provider, driven through `codex app-server` — the same persistent
 * JSON-RPC-over-stdio protocol the official Codex IDE extension uses. One
 * app-server process is shared by all sessions; each session is a thread.
 *
 * Client→server: initialize · thread/start · thread/resume · turn/start ·
 * turn/steer · turn/interrupt · model/list.
 * Server→client notifications: turn/started|completed · item/started|completed
 * · item/agentMessage/delta · item/reasoning/textDelta|summaryTextDelta ·
 * thread/tokenUsage/updated · error.
 * Server→client REQUESTS (block until we answer): item/commandExecution/
 * requestApproval · item/fileChange/requestApproval — these become
 * `permission` updates the UI answers via respondPermission.
 */
import { spawn } from "node:child_process"
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
	readNumber,
	readString,
} from "../types"

const CODEX_FALLBACK_MODELS: AgentModelInfo[] = [
	{
		slug: "",
		label: "Default",
		efforts: ["low", "medium", "high", "xhigh"],
		defaultEffort: "medium",
	},
]

/**
 * Approval routing per sandbox level. Codex escalates outside-sandbox actions
 * as approval requests; full access never asks.
 */
function approvalPolicy(sandbox: AgentSandbox | undefined): string {
	return sandbox === "danger-full-access" ? "never" : "on-request"
}

function toolNameForItem(itemType: string): string {
	switch (itemType) {
		case "commandExecution":
			return "shell"
		case "fileChange":
			return "edit"
		case "webSearch":
			return "web_search"
		case "mcpToolCall":
			return "mcp"
		case "imageGeneration":
			return "image"
		default:
			return itemType
	}
}

function itemDetail(item: Record<string, unknown>): string | undefined {
	const changes = Array.isArray(item.changes) ? item.changes : []
	return (
		readString(item.command) ||
		readString(item.query) ||
		readString(item.tool) ||
		changes
			.map((c) => readString(asRecord(c)?.path))
			.filter(Boolean)
			.join(", ") ||
		undefined
	)
}

function parseUsage(total: Record<string, unknown>): AgentUsage {
	return {
		inputTokens: readNumber(total.inputTokens),
		cachedInputTokens: readNumber(total.cachedInputTokens),
		outputTokens: readNumber(total.outputTokens),
		reasoningOutputTokens: readNumber(total.reasoningOutputTokens),
	}
}

interface PendingTurn {
	resolve: (result: AgentRunResult) => void
	reject: (err: Error) => void
	messages: string[]
	notices: string[]
	usage: AgentUsage | null
}

class CodexSession implements AgentSession {
	threadId: string | null = null
	busy = false
	private currentTurnId: string | null = null
	private turn: PendingTurn | null = null
	private pendingPermissions = new Map<
		string,
		{ resolve: (decision: AgentPermissionDecision | "cancel") => void }
	>()
	private closed = false

	constructor(
		private readonly provider: CodexProvider,
		private readonly opts: AgentSessionOptions,
		private readonly onUpdate: (update: AgentUpdate) => void,
	) {}

	async open(): Promise<void> {
		const rpc = await this.provider.connection()
		// The Palot bridge rides in as a per-thread MCP server. Unlike the old
		// `codex exec` path, approvals are answered interactively here, so the
		// bridge works in every sandbox mode.
		const bridge = this.opts.bridge
		const config = bridge
			? {
					mcp_servers: {
						palot: {
							command: bridge.nodeBinary,
							args: [bridge.proxyScriptPath],
							env: {
								...bridge.proxyEnv,
								PALOT_BRIDGE_URL: bridge.url,
								PALOT_BRIDGE_TOKEN: bridge.token,
							},
						},
					},
				}
			: undefined
		const params = {
			cwd: this.opts.cwd,
			sandbox: this.opts.sandbox ?? "read-only",
			approvalPolicy: approvalPolicy(this.opts.sandbox),
			...(this.opts.model ? { model: this.opts.model } : {}),
			...(config ? { config } : {}),
		}
		const result = (await (this.opts.resumeId
			? rpc.request("thread/resume", { threadId: this.opts.resumeId, ...params }).catch(() =>
					// A stale/missing thread id falls back to a fresh thread.
					rpc.request("thread/start", params),
				)
			: rpc.request("thread/start", params))) as { thread?: { id?: string } }
		this.threadId = readString(result?.thread?.id) || null
		if (!this.threadId) throw new Error("Codex did not return a thread id")
		this.provider.registerSession(this.threadId, this)
		this.onUpdate({ kind: "thread", threadId: this.threadId })
	}

	async send(input: AgentTurnInput): Promise<AgentRunResult> {
		if (this.closed) throw new Error("Session is closed")
		if (this.busy) throw new Error("A turn is already running; steer or interrupt it first")
		const rpc = await this.provider.connection()
		const userInput: unknown[] = [{ type: "text", text: input.text, text_elements: [] }]
		for (const path of input.images ?? []) userInput.push({ type: "localImage", path })

		this.busy = true
		const done = new Promise<AgentRunResult>((resolve, reject) => {
			this.turn = { resolve, reject, messages: [], notices: [], usage: null }
		})
		try {
			await rpc.request("turn/start", {
				threadId: this.threadId,
				input: userInput,
				...(input.model ? { model: input.model } : {}),
				...(input.reasoningEffort ? { effort: input.reasoningEffort } : {}),
				...(input.sandbox
					? {
							sandboxPolicy: sandboxPolicy(input.sandbox, this.opts.cwd),
							approvalPolicy: approvalPolicy(input.sandbox),
						}
					: {}),
			})
		} catch (err) {
			this.busy = false
			this.turn = null
			throw err
		}
		return done
	}

	async steer(text: string): Promise<void> {
		if (!this.busy || !this.currentTurnId) throw new Error("No turn is running")
		const rpc = await this.provider.connection()
		await rpc.request("turn/steer", {
			threadId: this.threadId,
			expectedTurnId: this.currentTurnId,
			input: [{ type: "text", text, text_elements: [] }],
		})
	}

	async interrupt(): Promise<void> {
		if (!this.busy || !this.currentTurnId) return
		const rpc = await this.provider.connection()
		await rpc.request("turn/interrupt", { threadId: this.threadId, turnId: this.currentTurnId })
	}

	respondPermission(requestId: string, decision: AgentPermissionDecision): void {
		const pending = this.pendingPermissions.get(requestId)
		if (!pending) return
		this.pendingPermissions.delete(requestId)
		pending.resolve(decision)
		this.onUpdate({ kind: "permission-resolved", requestId, decision })
	}

	// Codex has no structured-question tool; approvals cover its interaction.
	answerQuestion(): void {}

	async close(): Promise<void> {
		this.closed = true
		this.cancelPendingPermissions()
		this.turn?.reject(new Error("Session closed"))
		this.turn = null
		if (this.threadId) this.provider.unregisterSession(this.threadId)
	}

	/** Server asked for approval; block its RPC until the user decides. */
	handleApproval(action: string, params: Record<string, unknown>): Promise<unknown> {
		const requestId = `${readString(params.itemId) || "req"}:${this.pendingPermissions.size}:${Date.now()}`
		const request = {
			requestId,
			action,
			name: action === "file-change" ? "edit" : "shell",
			detail:
				readString(params.command) ||
				(Array.isArray(params.changes)
					? params.changes.map((c) => readString(asRecord(c)?.path)).join(", ")
					: undefined) ||
				undefined,
			reason: readString(params.reason) || undefined,
			decisions: ["accept", "acceptForSession", "decline"] as AgentPermissionDecision[],
		}
		return new Promise((resolve) => {
			this.pendingPermissions.set(requestId, {
				resolve: (decision) => resolve({ decision }),
			})
			this.onUpdate({ kind: "permission", request })
		})
	}

	handleNotification(method: string, params: Record<string, unknown>): void {
		switch (method) {
			case "turn/started": {
				this.currentTurnId = readString(asRecord(params.turn)?.id) || null
				return
			}
			case "turn/completed": {
				const turn = asRecord(params.turn)
				const status = readString(turn?.status)
				const error = asRecord(turn?.error)
				const pending = this.turn
				this.busy = false
				this.currentTurnId = null
				this.turn = null
				this.cancelPendingPermissions()
				if (!pending) return
				if (status === "failed" && error) {
					pending.reject(new Error(readString(error.message) || "Codex turn failed"))
					return
				}
				pending.resolve({
					message: pending.messages.join("\n\n"),
					threadId: this.threadId,
					usage: pending.usage,
					notices: pending.notices,
				})
				return
			}
			case "item/agentMessage/delta": {
				const delta = readString(params.delta)
				if (delta) this.onUpdate({ kind: "message-delta", text: delta })
				return
			}
			case "item/reasoning/textDelta":
			case "item/reasoning/summaryTextDelta": {
				const delta = readString(params.delta)
				if (delta) this.onUpdate({ kind: "reasoning-delta", text: delta })
				return
			}
			case "item/reasoning/summaryPartAdded": {
				this.onUpdate({ kind: "reasoning-delta", text: "\n\n" })
				return
			}
			case "item/commandExecution/outputDelta": {
				// Live command output; the UI appends chunks to the tool card.
				const chunk = readString(params.delta) || readString(params.chunk)
				const itemId = readString(params.itemId)
				if (chunk && itemId) {
					this.onUpdate({
						kind: "tool",
						id: itemId,
						name: "shell",
						status: "running",
						output: chunk,
					})
				}
				return
			}
			case "item/started":
			case "item/completed": {
				this.handleItem(method.endsWith("/completed") ? "completed" : "started", params)
				return
			}
			case "turn/plan/updated": {
				// The agent's todo/plan — rendered as an updating tool card.
				const steps = Array.isArray(params.plan) ? params.plan : []
				const lines = steps
					.map((s) => {
						const step = asRecord(s)
						const status = readString(step?.status)
						const mark = status === "completed" ? "[x]" : status === "inProgress" ? "[~]" : "[ ]"
						return `${mark} ${readString(step?.step)}`
					})
					.filter((line) => line.length > 4)
				if (!lines.length) return
				const done = steps.every((s) => asRecord(s)?.status === "completed")
				this.onUpdate({
					kind: "tool",
					id: `plan-${this.currentTurnId ?? "turn"}`,
					name: "plan",
					detail: readString(params.explanation) || undefined,
					status: done ? "completed" : "running",
					output: lines.join("\n"),
				})
				return
			}
			case "thread/tokenUsage/updated": {
				const total = asRecord(asRecord(params.tokenUsage)?.total)
				if (total && this.turn) {
					this.turn.usage = parseUsage(total)
					this.onUpdate({ kind: "usage", usage: this.turn.usage })
				}
				return
			}
			case "error": {
				const text = readString(params.message) || readString(asRecord(params.error)?.message)
				if (text) {
					this.turn?.notices.push(text)
					this.onUpdate({ kind: "notice", text })
				}
				return
			}
			default:
				return
		}
	}

	private handleItem(phase: string, params: Record<string, unknown>): void {
		const item = asRecord(params.item)
		if (!item) return
		const itemType = readString(item.type)
		const completed = phase === "completed"
		switch (itemType) {
			case "agentMessage": {
				if (!completed) return
				const text = readString(item.text)
				if (text) {
					this.turn?.messages.push(text)
					this.onUpdate({ kind: "message", text })
				}
				return
			}
			case "reasoning":
				// Streamed via reasoning deltas already.
				return
			case "userMessage":
			case "contextCompaction":
			case "plan":
				return
			case "error": {
				const text = readString(item.message)
				if (text) {
					this.turn?.notices.push(text)
					this.onUpdate({ kind: "notice", text })
				}
				return
			}
			default: {
				const status = readString(item.status)
				this.onUpdate({
					kind: "tool",
					id: readString(item.id) || undefined,
					name: toolNameForItem(itemType),
					detail: itemDetail(item),
					status: completed ? (status === "failed" ? "error" : "completed") : "running",
					output: completed
						? readString(item.aggregatedOutput ?? item.aggregated_output).slice(0, 4_000) ||
							undefined
						: undefined,
				})
			}
		}
	}

	private cancelPendingPermissions(): void {
		for (const [requestId, pending] of this.pendingPermissions) {
			pending.resolve("cancel")
			this.onUpdate({ kind: "permission-resolved", requestId, decision: null })
		}
		this.pendingPermissions.clear()
	}
}

function sandboxPolicy(sandbox: AgentSandbox, cwd: string): unknown {
	switch (sandbox) {
		case "danger-full-access":
			return { type: "dangerFullAccess" }
		case "workspace-write":
			return {
				type: "workspaceWrite",
				writableRoots: [cwd],
				networkAccess: false,
				excludeTmpdirEnvVar: false,
				excludeSlashTmp: false,
			}
		default:
			return { type: "readOnly", networkAccess: false }
	}
}

export class CodexProvider implements AgentSessionProvider {
	readonly id = "codex"
	readonly displayName = "Codex"
	readonly binary = "codex"
	readonly capabilities = {
		imageInput: true,
		reasoningEffort: true,
		resume: true,
		permissions: true,
		interrupt: true,
		steering: true,
	}

	private rpc: JsonRpcConnection | null = null
	private connecting: Promise<JsonRpcConnection> | null = null
	private sessions = new Map<string, CodexSession>()

	constructor(private readonly resolveBinary: () => Promise<string | null>) {}

	/** Lazily start (and share) the app-server process. */
	async connection(): Promise<JsonRpcConnection> {
		if (this.rpc?.alive) return this.rpc
		this.connecting ??= this.start().finally(() => {
			this.connecting = null
		})
		return this.connecting
	}

	private async start(): Promise<JsonRpcConnection> {
		const binary = await this.resolveBinary()
		if (!binary) throw new Error("Codex CLI is not installed")
		const child = spawn(binary, ["app-server"], { stdio: ["pipe", "pipe", "pipe"] })
		const rpc = new JsonRpcConnection(child)
		rpc.onNotification((method, params) => {
			const record = asRecord(params) ?? {}
			const threadId = readString(record.threadId)
			const session = threadId ? this.sessions.get(threadId) : undefined
			session?.handleNotification(method, record)
		})
		rpc.onRequest(async (method, params) => {
			const record = asRecord(params) ?? {}
			const session = this.sessions.get(readString(record.threadId))
			if (!session) return { decision: "decline" }
			switch (method) {
				case "item/commandExecution/requestApproval":
				case "execCommandApproval":
					return session.handleApproval("command", record)
				case "item/fileChange/requestApproval":
				case "applyPatchApproval":
					return session.handleApproval("file-change", record)
				default:
					return {}
			}
		})
		rpc.onClose(() => {
			if (this.rpc === rpc) this.rpc = null
		})
		await rpc.request("initialize", {
			clientInfo: { name: "palot", title: "Palot", version: "1.0.0" },
			// Experimental API unlocks streaming extras (e.g. command output deltas).
			capabilities: { experimentalApi: true, requestAttestation: false },
		})
		rpc.notify("initialized")
		this.rpc = rpc
		return rpc
	}

	registerSession(threadId: string, session: CodexSession): void {
		this.sessions.set(threadId, session)
	}

	unregisterSession(threadId: string): void {
		this.sessions.delete(threadId)
	}

	async listModels(): Promise<AgentModelInfo[]> {
		try {
			const rpc = await this.connection()
			const result = (await rpc.request("model/list", {})) as { data?: unknown[] }
			const models: AgentModelInfo[] = []
			for (const entry of result?.data ?? []) {
				const model = asRecord(entry)
				if (!model || model.hidden === true) continue
				const efforts = Array.isArray(model.supportedReasoningEfforts)
					? model.supportedReasoningEfforts
							.map((e) => readString(asRecord(e)?.reasoningEffort))
							.filter(Boolean)
					: []
				models.push({
					slug: readString(model.id) || readString(model.model),
					label: readString(model.displayName) || readString(model.id),
					efforts,
					defaultEffort: readString(model.defaultReasoningEffort) || undefined,
				})
			}
			if (!models.length) return CODEX_FALLBACK_MODELS
			return [{ ...CODEX_FALLBACK_MODELS[0] }, ...models] as AgentModelInfo[]
		} catch {
			return CODEX_FALLBACK_MODELS
		}
	}

	async openSession(
		opts: AgentSessionOptions,
		onUpdate: (update: AgentUpdate) => void,
	): Promise<AgentSession> {
		const session = new CodexSession(this, opts, onUpdate)
		await session.open()
		return session
	}

	async dispose(): Promise<void> {
		this.sessions.clear()
		this.rpc?.close()
		this.rpc = null
	}
}
