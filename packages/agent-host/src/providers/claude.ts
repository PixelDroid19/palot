/**
 * Claude Code provider, driven through the official Claude Agent SDK
 * (`@anthropic-ai/claude-agent-sdk`) — the same engine behind Claude Code
 * itself. One persistent `query()` per session with a streaming input queue:
 * the process stays alive across turns, so context and caches persist and
 * turns start instantly.
 *
 *  - streaming: `includePartialMessages` gives token-level text/thinking
 *  - permissions: the `canUseTool` callback becomes a `permission` update the
 *    UI answers via respondPermission (allow / allow-for-session / deny)
 *  - interrupt: `query.interrupt()` stops the turn, keeps the session
 *  - model switching: `query.setModel()` mid-session; reasoning effort is a
 *    session option, so an effort change transparently re-opens the query
 *    with `resume` (context is preserved by the CLI)
 *  - the user's real Claude Code config loads (`settingSources`), so CLAUDE.md,
 *    skills and MCP servers behave exactly like the CLI
 */
import {
	type CanUseTool,
	type Options,
	type PermissionMode,
	type Query,
	query,
	type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
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

const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"]
const CLAUDE_MODEL_ALIASES: AgentModelInfo[] = [
	{ slug: "sonnet", label: "Sonnet", efforts: CLAUDE_EFFORTS },
	{ slug: "opus", label: "Opus", efforts: CLAUDE_EFFORTS },
	{ slug: "haiku", label: "Haiku", efforts: CLAUDE_EFFORTS },
	{ slug: "fable", label: "Fable", efforts: CLAUDE_EFFORTS },
]

const TOOL_RESULT_MAX_CHARS = 4_000

function permissionMode(sandbox: AgentSandbox | undefined): PermissionMode {
	switch (sandbox) {
		case "plan":
			return "plan"
		case "danger-full-access":
			return "bypassPermissions"
		case "workspace-write":
			return "acceptEdits"
		default:
			return "default"
	}
}

/** Best human-readable one-liner for a tool invocation's input. */
function toolDetail(input: Record<string, unknown> | null): string | undefined {
	if (!input) return undefined
	return (
		readString(input.command) ||
		readString(input.description) ||
		readString(input.file_path) ||
		readString(input.pattern) ||
		readString(input.query) ||
		readString(input.url) ||
		readString(input.prompt).slice(0, 200) ||
		undefined
	)
}

/** An async queue the SDK consumes as its streaming prompt input. */
class InputQueue implements AsyncIterable<SDKUserMessage> {
	private items: SDKUserMessage[] = []
	private waiter: ((value: IteratorResult<SDKUserMessage>) => void) | null = null
	private closed = false

	push(message: SDKUserMessage): void {
		if (this.closed) return
		if (this.waiter) {
			const resolve = this.waiter
			this.waiter = null
			resolve({ value: message, done: false })
		} else {
			this.items.push(message)
		}
	}

	close(): void {
		this.closed = true
		this.waiter?.({ value: undefined as never, done: true })
		this.waiter = null
	}

	[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
		return {
			next: (): Promise<IteratorResult<SDKUserMessage>> => {
				const item = this.items.shift()
				if (item) return Promise.resolve({ value: item, done: false })
				if (this.closed) return Promise.resolve({ value: undefined as never, done: true })
				return new Promise((resolve) => {
					this.waiter = resolve
				})
			},
		}
	}
}

interface PendingTurn {
	resolve: (result: AgentRunResult) => void
	reject: (err: Error) => void
	message: string
	usage: AgentUsage | null
	notices: string[]
}

class ClaudeSession implements AgentSession {
	threadId: string | null = null
	busy = false
	private queue = new InputQueue()
	private q: Query | null = null
	private turn: PendingTurn | null = null
	private currentModel: string | undefined
	private currentEffort: string | undefined
	private permissionMode: PermissionMode
	private pendingPermissions = new Map<
		string,
		{ resolve: (decision: AgentPermissionDecision | "deny") => void }
	>()
	/** Tools the user allowed "for this session" (prefix rules like `Bash`). */
	private sessionAllowedTools = new Set<string>()
	private pendingQuestions = new Map<
		string,
		{ resolve: (answers: Record<string, string>) => void }
	>()
	private closed = false
	private loop: Promise<void> | null = null
	/** Set while an interrupt is in flight so its error result resolves softly. */
	private interrupted = false
	/** Whether the current query emitted its `system/init` (successful startup). */
	private sawInit = false

	constructor(
		private readonly opts: AgentSessionOptions,
		private readonly binaryPath: string | null,
		private readonly onUpdate: (update: AgentUpdate) => void,
	) {
		this.currentModel = opts.model || undefined
		this.currentEffort = opts.reasoningEffort || undefined
		this.permissionMode = permissionMode(opts.sandbox)
		this.threadId = opts.resumeId ?? null
	}

	private buildOptions(): Options {
		const canUseTool: CanUseTool = async (toolName, input, { suggestions: _s, ...rest }) => {
			void rest
			if (this.closed) return { behavior: "deny", message: "Session closed" }
			// AskUserQuestion is not an approval — it's a structured question whose
			// answer is fed back through the tool's `answers` field. Surface it as a
			// question and splice the user's choices into updatedInput.
			if (toolName === "AskUserQuestion") {
				const answers = await this.requestQuestion(asRecord(input))
				return { behavior: "allow", updatedInput: { ...asRecord(input), answers } }
			}
			if (this.sessionAllowedTools.has(toolName)) {
				return { behavior: "allow", updatedInput: input }
			}
			const decision = await this.requestPermission(toolName, asRecord(input))
			if (decision === "accept" || decision === "acceptForSession") {
				if (decision === "acceptForSession") this.sessionAllowedTools.add(toolName)
				return { behavior: "allow", updatedInput: input }
			}
			return { behavior: "deny", message: "The user declined this action" }
		}
		const options: Options = {
			cwd: this.opts.cwd,
			permissionMode: this.permissionMode,
			canUseTool,
			includePartialMessages: true,
			// Behave exactly like the interactive CLI: load the user's real
			// config (CLAUDE.md, skills, MCP servers) and system prompt.
			settingSources: ["user", "project", "local"],
			systemPrompt: { type: "preset", preset: "claude_code" },
			...(this.binaryPath ? { pathToClaudeCodeExecutable: this.binaryPath } : {}),
			...(this.currentModel ? { model: this.currentModel } : {}),
			...(this.currentEffort ? { effort: this.currentEffort as Options["effort"] } : {}),
			...(this.threadId ? { resume: this.threadId } : {}),
			...(this.opts.env ? { env: { ...process.env, ...this.opts.env } } : {}),
		}
		if (this.opts.bridge) {
			options.mcpServers = {
				palot: {
					type: "stdio",
					command: this.opts.bridge.nodeBinary,
					args: [this.opts.bridge.proxyScriptPath],
					env: {
						...this.opts.bridge.proxyEnv,
						PALOT_BRIDGE_URL: this.opts.bridge.url,
						PALOT_BRIDGE_TOKEN: this.opts.bridge.token,
					},
				},
			}
		}
		return options
	}

	/** (Re)create the SDK query and start pumping its messages. */
	private ensureQuery(): void {
		if (this.q) return
		this.sawInit = false
		this.queue = new InputQueue()
		this.q = query({ prompt: this.queue, options: this.buildOptions() })
		this.loop = this.pump(this.q)
	}

	private async pump(q: Query): Promise<void> {
		try {
			for await (const message of q) {
				// Stop feeding the session once a newer query has taken over (the
				// old query may keep emitting after a stale-resume retry).
				if (this.q !== q) break
				this.handleMessage(message as unknown as Record<string, unknown>)
			}
			// Iterator ended (session closed by CLI or restart).
			if (this.q === q) this.q = null
			const pending = this.turn
			if (pending && this.q === null && !this.closed) {
				this.busy = false
				this.turn = null
				pending.resolve({
					message: pending.message,
					threadId: this.threadId,
					usage: pending.usage,
					notices: pending.notices,
				})
			}
		} catch (err) {
			// A newer query already took over this session (e.g. a stale-resume
			// retry). This is the old query winding down — it must not touch the
			// active turn or emit errors for work the new query now owns.
			if (this.q !== q) return
			this.q = null
			const message = err instanceof Error ? err.message : String(err)
			const pending = this.turn
			if (pending && this.tryRecoverStaleResume(message, pending)) return
			this.busy = false
			this.turn = null
			this.cancelPendingPermissions()
			this.cancelPendingQuestions()
			pending?.reject(err instanceof Error ? err : new Error(message))
			if (!this.closed && !pending) {
				this.onUpdate({ kind: "notice", text: `Claude session error: ${message}` })
			}
		}
	}

	/**
	 * A stale/expired resume id makes the SDK fail at startup with "No
	 * conversation found with session ID …", which would otherwise brick the
	 * thread — every future turn re-resumes the same dead id and fails again.
	 * Detect it (query errors before `system/init` with nothing streamed, or an
	 * explicit "no conversation found"), drop the resume anchor, and resolve the
	 * turn with an actionable notice. The next prompt opens a clean session, so
	 * the thread stays usable instead of going permanently read-only.
	 * Returns true when handled (the caller must stop failing the turn).
	 */
	private tryRecoverStaleResume(errorText: string, pending: PendingTurn): boolean {
		if (!this.threadId) return false
		const looksLikeStaleResume =
			(!this.sawInit && !pending.message) || /no conversation found|session id/i.test(errorText)
		if (!looksLikeStaleResume) return false
		// Clear the dead anchor and force a fresh query on the next send.
		this.threadId = null
		this.q = null
		this.busy = false
		this.turn = null
		this.cancelPendingPermissions()
		this.cancelPendingQuestions()
		this.onUpdate({
			kind: "notice",
			text: "This conversation's session expired. Send your message again to continue in a fresh session.",
		})
		pending.resolve({
			message: pending.message.replace(/^\s+/, ""),
			threadId: null,
			usage: pending.usage,
			notices: [...pending.notices, "Session expired — resend to continue."],
		})
		return true
	}

	async send(input: AgentTurnInput): Promise<AgentRunResult> {
		if (this.closed) throw new Error("Session is closed")
		if (this.busy) throw new Error("A turn is already running; steer or interrupt it first")

		// Effort is a session-level option: a change re-opens the query resuming
		// the same thread. Model changes apply in-session via setModel.
		if (input.reasoningEffort && input.reasoningEffort !== this.currentEffort) {
			this.currentEffort = input.reasoningEffort
			await this.restartQuery()
		}
		if (input.sandbox && permissionMode(input.sandbox) !== this.permissionMode) {
			this.permissionMode = permissionMode(input.sandbox)
			if (this.q) await this.q.setPermissionMode(this.permissionMode).catch(() => {})
		}
		this.ensureQuery()
		if (input.model !== undefined && input.model !== this.currentModel) {
			this.currentModel = input.model || undefined
			await this.q?.setModel(this.currentModel).catch(() => {})
		}

		const content: unknown[] = [{ type: "text", text: input.text }]
		for (const path of input.images ?? []) {
			content.push({
				type: "text",
				text: `\n(Attached image file: ${path} — read it with the Read tool.)`,
			})
		}

		const userMessage = {
			type: "user",
			message: { role: "user", content: content as never },
			parent_tool_use_id: null,
		} as SDKUserMessage
		this.busy = true
		const done = new Promise<AgentRunResult>((resolve, reject) => {
			this.turn = { resolve, reject, message: "", usage: null, notices: [] }
		})
		this.queue.push(userMessage)
		return done
	}

	async steer(text: string): Promise<void> {
		if (!this.busy) throw new Error("No turn is running")
		// Streaming input mode: a user message pushed mid-turn steers the agent.
		this.queue.push({
			type: "user",
			message: { role: "user", content: [{ type: "text", text }] as never },
			parent_tool_use_id: null,
		} as SDKUserMessage)
	}

	async interrupt(): Promise<void> {
		if (!this.q || !this.busy) return
		this.interrupted = true
		await this.q.interrupt().catch(() => {})
	}

	respondPermission(requestId: string, decision: AgentPermissionDecision): void {
		const pending = this.pendingPermissions.get(requestId)
		if (!pending) return
		this.pendingPermissions.delete(requestId)
		pending.resolve(decision)
		this.onUpdate({ kind: "permission-resolved", requestId, decision })
	}

	answerQuestion(requestId: string, answers: Record<string, string>): void {
		const pending = this.pendingQuestions.get(requestId)
		if (!pending) return
		this.pendingQuestions.delete(requestId)
		pending.resolve(answers)
		this.onUpdate({ kind: "question-resolved", requestId })
	}

	async close(): Promise<void> {
		this.closed = true
		this.cancelPendingPermissions()
		this.cancelPendingQuestions()
		this.queue.close()
		const q = this.q
		this.q = null
		if (q && this.busy) await q.interrupt().catch(() => {})
		this.turn?.reject(new Error("Session closed"))
		this.turn = null
	}

	private async restartQuery(): Promise<void> {
		if (!this.q) return
		this.queue.close()
		const q = this.q
		this.q = null
		// Ending the input stream lets the query wind down; the next turn
		// resumes the same session id.
		await this.loop?.catch(() => {})
		void q
	}

	private requestPermission(
		toolName: string,
		input: Record<string, unknown> | null,
	): Promise<AgentPermissionDecision | "deny"> {
		const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
		return new Promise((resolve) => {
			this.pendingPermissions.set(requestId, { resolve })
			this.onUpdate({
				kind: "permission",
				request: {
					requestId,
					action: "tool",
					name: toolName,
					detail: toolDetail(input),
					decisions: ["accept", "acceptForSession", "decline"],
				},
			})
		})
	}

	private cancelPendingPermissions(): void {
		for (const [requestId, pending] of this.pendingPermissions) {
			pending.resolve("deny")
			this.onUpdate({ kind: "permission-resolved", requestId, decision: null })
		}
		this.pendingPermissions.clear()
	}

	/** Surface a structured AskUserQuestion; resolves with the chosen answers. */
	private requestQuestion(input: Record<string, unknown> | null): Promise<Record<string, string>> {
		const rawQuestions = Array.isArray(input?.questions) ? input.questions : []
		const questions = rawQuestions.map((q) => {
			const record = asRecord(q)
			const options = Array.isArray(record?.options) ? record.options : []
			return {
				question: readString(record?.question),
				header: readString(record?.header) || undefined,
				multiSelect: record?.multiSelect === true,
				options: options.map((o) => {
					const opt = asRecord(o)
					return {
						label: readString(opt?.label),
						description: readString(opt?.description) || undefined,
					}
				}),
			}
		})
		const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
		return new Promise((resolve) => {
			this.pendingQuestions.set(requestId, { resolve })
			this.onUpdate({ kind: "question", request: { requestId, questions } })
		})
	}

	private cancelPendingQuestions(): void {
		for (const [requestId, pending] of this.pendingQuestions) {
			pending.resolve({})
			this.onUpdate({ kind: "question-resolved", requestId })
		}
		this.pendingQuestions.clear()
	}

	private handleMessage(message: Record<string, unknown>): void {
		// Subagent (Task tool) traffic — keep it out of the top-level answer.
		if (readString(message.parent_tool_use_id)) return
		switch (message.type) {
			case "system": {
				if (message.subtype === "init") {
					this.sawInit = true
					const sessionId = readString(message.session_id)
					if (sessionId) {
						this.threadId = sessionId
						this.onUpdate({ kind: "thread", threadId: sessionId })
					}
				}
				return
			}
			case "stream_event": {
				const event = asRecord(message.event)
				if (!event) return
				if (event.type === "content_block_start") {
					const block = asRecord(event.content_block)
					if (block?.type === "text") this.onUpdate({ kind: "message-delta", text: "\n\n" })
					if (block?.type === "thinking") this.onUpdate({ kind: "reasoning-delta", text: "\n\n" })
					return
				}
				if (event.type === "content_block_delta") {
					const delta = asRecord(event.delta)
					const text = readString(delta?.text)
					const thinking = readString(delta?.thinking)
					if (delta?.type === "text_delta" && text) {
						if (this.turn) this.turn.message += text
						this.onUpdate({ kind: "message-delta", text })
					} else if (delta?.type === "thinking_delta" && thinking) {
						this.onUpdate({ kind: "reasoning-delta", text: thinking })
					}
				}
				return
			}
			case "assistant": {
				const inner = asRecord(message.message)
				const content = Array.isArray(inner?.content) ? inner.content : []
				for (const block of content) {
					const item = asRecord(block)
					if (item?.type !== "tool_use") continue
					this.onUpdate({
						kind: "tool",
						id: readString(item.id) || undefined,
						name: readString(item.name) || "tool",
						detail: toolDetail(asRecord(item.input)),
						status: "running",
					})
				}
				return
			}
			case "user": {
				const inner = asRecord(message.message)
				const content = Array.isArray(inner?.content) ? inner.content : []
				for (const block of content) {
					const item = asRecord(block)
					if (item?.type !== "tool_result") continue
					const id = readString(item.tool_use_id)
					if (!id) continue
					const text = Array.isArray(item.content)
						? item.content
								.map((c) => readString(asRecord(c)?.text))
								.filter(Boolean)
								.join("\n")
						: readString(item.content)
					this.onUpdate({
						kind: "tool",
						id,
						name: "tool",
						status: item.is_error === true ? "error" : "completed",
						output: text.slice(0, TOOL_RESULT_MAX_CHARS) || undefined,
					})
				}
				return
			}
			case "result": {
				const pending = this.turn
				this.busy = false
				this.turn = null
				this.cancelPendingPermissions()
				this.cancelPendingQuestions()
				const usageRecord = asRecord(message.usage)
				const usage: AgentUsage | null = usageRecord
					? {
							inputTokens: readNumber(usageRecord.input_tokens),
							cachedInputTokens: readNumber(usageRecord.cache_read_input_tokens),
							outputTokens: readNumber(usageRecord.output_tokens),
							reasoningOutputTokens: readNumber(
								asRecord(usageRecord.output_tokens_details)?.thinking_tokens,
							),
						}
					: null
				if (usage) this.onUpdate({ kind: "usage", usage })
				const sessionId = readString(message.session_id)
				if (sessionId) this.threadId = sessionId
				if (!pending) return
				if (message.is_error === true) {
					if (this.interrupted) {
						// An interrupted turn ends with `error_during_execution`; the
						// query stays usable, so resolve with whatever streamed so far.
						this.interrupted = false
						pending.resolve({
							message: pending.message.replace(/^\s+/, ""),
							threadId: this.threadId,
							usage,
							notices: [...pending.notices, "Turn interrupted"],
						})
						return
					}
					const errText = `${readString(message.result)} ${readString(message.subtype)}`
					if (this.tryRecoverStaleResume(errText, pending)) return
					pending.reject(new Error(readString(message.result) || "Claude reported an error"))
					return
				}
				this.interrupted = false
				const text = readString(message.result) || pending.message.replace(/^\s+/, "")
				if (text) this.onUpdate({ kind: "message", text })
				pending.resolve({
					message: text,
					threadId: this.threadId,
					usage,
					notices: pending.notices,
				})
				return
			}
			default:
				return
		}
	}
}

export class ClaudeProvider implements AgentSessionProvider {
	readonly id = "claude"
	readonly displayName = "Claude Code"
	readonly binary = "claude"
	readonly capabilities = {
		imageInput: true,
		reasoningEffort: true,
		resume: true,
		permissions: true,
		interrupt: true,
		steering: true,
	}

	constructor(private readonly resolveBinary: () => Promise<string | null>) {}

	async listModels(): Promise<AgentModelInfo[]> {
		const binary = await this.resolveBinary().catch(() => null)
		if (!binary) return []
		return CLAUDE_MODEL_ALIASES
	}

	async openSession(
		opts: AgentSessionOptions,
		onUpdate: (update: AgentUpdate) => void,
	): Promise<AgentSession> {
		const binary = await this.resolveBinary().catch(() => null)
		return new ClaudeSession(opts, binary, onUpdate)
	}

	async dispose(): Promise<void> {}
}
