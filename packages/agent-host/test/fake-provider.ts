import type {
	AgentPermissionDecision,
	AgentRunResult,
	AgentSession,
	AgentSessionOptions,
	AgentSessionProvider,
	AgentTurnInput,
	AgentUpdate,
} from "../src/types"

export interface FakeBehavior {
	/** Compute the reply for a turn. */
	reply?: (input: AgentTurnInput, turnIndex: number) => string
	/** Ask for permission before answering; the reply reflects the decision. */
	askPermission?: boolean
	/** Delay before resolving a turn (lets tests interrupt). */
	delayMs?: number
}

export class FakeSession implements AgentSession {
	threadId: string | null = null
	busy = false
	turns: AgentTurnInput[] = []
	steered: string[] = []
	closedCount = 0
	lastDecision: AgentPermissionDecision | null = null
	private pendingPermission: ((d: AgentPermissionDecision) => void) | null = null
	private interruptFlag = false

	constructor(
		readonly opts: AgentSessionOptions,
		private readonly behavior: FakeBehavior,
		private readonly onUpdate: (update: AgentUpdate) => void,
	) {
		this.threadId = opts.resumeId ?? `fake-${Math.random().toString(36).slice(2, 8)}`
		onUpdate({ kind: "thread", threadId: this.threadId })
	}

	async send(input: AgentTurnInput): Promise<AgentRunResult> {
		if (this.busy) throw new Error("busy")
		this.busy = true
		this.turns.push(input)
		this.interruptFlag = false
		try {
			if (this.behavior.askPermission) {
				const decision = await new Promise<AgentPermissionDecision>((resolve) => {
					this.pendingPermission = resolve
					this.onUpdate({
						kind: "permission",
						request: {
							requestId: "req-1",
							action: "command",
							name: "shell",
							detail: "rm -rf /",
							decisions: ["accept", "acceptForSession", "decline"],
						},
					})
				})
				this.lastDecision = decision
			}
			if (this.behavior.delayMs) {
				await new Promise((r) => setTimeout(r, this.behavior.delayMs))
			}
			if (this.interruptFlag) {
				return { message: "(interrupted)", threadId: this.threadId, usage: null, notices: [] }
			}
			const text = this.behavior.reply?.(input, this.turns.length - 1) ?? `echo:${input.text}`
			this.onUpdate({ kind: "message", text })
			return { message: text, threadId: this.threadId, usage: null, notices: [] }
		} finally {
			this.busy = false
		}
	}

	async steer(text: string): Promise<void> {
		if (!this.busy) throw new Error("no turn running")
		this.steered.push(text)
	}

	async interrupt(): Promise<void> {
		this.interruptFlag = true
	}

	respondPermission(_requestId: string, decision: AgentPermissionDecision): void {
		this.pendingPermission?.(decision)
		this.pendingPermission = null
	}

	async close(): Promise<void> {
		this.closedCount++
	}
}

export class FakeProvider implements AgentSessionProvider {
	readonly displayName: string
	readonly binary = "sh"
	readonly capabilities = {
		imageInput: true,
		reasoningEffort: true,
		resume: true,
		permissions: true,
		interrupt: true,
		steering: true,
	}
	sessions: FakeSession[] = []

	constructor(
		readonly id: string,
		private readonly behavior: FakeBehavior = {},
	) {
		this.displayName = id
	}

	async listModels() {
		return [{ slug: "", label: "Default", efforts: ["low", "high"] }]
	}

	async openSession(opts: AgentSessionOptions, onUpdate: (update: AgentUpdate) => void) {
		const session = new FakeSession(opts, this.behavior, onUpdate)
		this.sessions.push(session)
		return session
	}

	async dispose(): Promise<void> {}
}
