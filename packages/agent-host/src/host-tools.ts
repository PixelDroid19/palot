/**
 * Host-owned tool plane — tools GCode provides to every harness (CLIs, custom
 * agents), independent of OpenCode/Codex/Claude adapter code.
 *
 * Product categories (automation, system, browser, agents, context) register
 * here once; MCP/bridge only lists and dispatches by name.
 */

export type HostToolCategory =
	| "agents"
	| "context"
	| "automation"
	| "system"
	| "browser"
	| "subagents"
	| "custom"

/** Built-in subagent roles (general-purpose + explore). Host-mediated. */
export type HostSubagentRoleId = "general-purpose" | "explore"

export interface HostSubagentRole {
	id: HostSubagentRoleId
	displayName: string
	description: string
	/** Isolation policy for the delegated run. */
	sandbox: "read-only" | "workspace-write" | "danger-full-access"
	/** When true, role is read-only research (Explore). */
	readOnly: boolean
}

/**
 * Product subagent catalog — not owned by any CLI brand.
 * Primary agents list+invoke these via the host bridge.
 */
export const HOST_SUBAGENT_ROLES: readonly HostSubagentRole[] = [
	{
		id: "general-purpose",
		displayName: "General purpose",
		description:
			"Isolated context for broad work: implement a slice, organize files, run verification, report back. Can read and write under host policy.",
		sandbox: "workspace-write",
		readOnly: false,
	},
	{
		id: "explore",
		displayName: "Explore",
		description:
			"Read-only codebase research: search, map call chains, gather evidence. Does not create or modify files.",
		sandbox: "read-only",
		readOnly: true,
	},
] as const

export function listHostSubagentRoles(): readonly HostSubagentRole[] {
	return HOST_SUBAGENT_ROLES
}

export function getHostSubagentRole(id: string): HostSubagentRole | undefined {
	return HOST_SUBAGENT_ROLES.find((r) => r.id === id)
}

/** JSON Schema fragment for MCP tool input (object only). */
export type HostToolInputSchema = {
	type: "object"
	properties?: Record<string, unknown>
	required?: string[]
	additionalProperties?: boolean
}

export interface HostToolContext {
	/** Working directory hint from the calling agent (optional). */
	cwd?: string
	/** Runtime id of the calling agent when known. */
	callerRuntimeId?: string
}

export interface HostToolDefinition {
	name: string
	description: string
	category: HostToolCategory
	inputSchema: HostToolInputSchema
	/**
	 * Execute the tool. Return text for MCP content. Fail closed with throw
	 * (bridged as isError) — never silently substitute another tool.
	 */
	handler: (args: Record<string, unknown>, ctx: HostToolContext) => Promise<string>
}

/** Public shape without the handler (safe for tools/list over the wire). */
export interface HostToolDescriptor {
	name: string
	description: string
	category: HostToolCategory
	inputSchema: HostToolInputSchema
}

export class HostToolRegistry {
	private readonly tools = new Map<string, HostToolDefinition>()

	register(tool: HostToolDefinition): void {
		this.tools.set(tool.name, tool)
	}

	unregister(name: string): boolean {
		return this.tools.delete(name)
	}

	has(name: string): boolean {
		return this.tools.has(name)
	}

	list(): HostToolDescriptor[] {
		return [...this.tools.values()].map(({ name, description, category, inputSchema }) => ({
			name,
			description,
			category,
			inputSchema,
		}))
	}

	/** MCP tools/list shape (name, description, inputSchema only). */
	listForMcp(): Array<{ name: string; description: string; inputSchema: HostToolInputSchema }> {
		return this.list().map(({ name, description, inputSchema }) => ({
			name,
			description,
			inputSchema,
		}))
	}

	async call(
		name: string,
		args: Record<string, unknown> = {},
		ctx: HostToolContext = {},
	): Promise<string> {
		const tool = this.tools.get(name)
		if (!tool) {
			throw new Error(`Unknown host tool: ${name}`)
		}
		return tool.handler(args, ctx)
	}

	clear(): void {
		this.tools.clear()
	}
}

/**
 * Built-in host tools that need an AgentHost (agents + context).
 * Automation / system / browser are registered by the embedder or
 * {@link registerDefaultPlatformTools}.
 */
export function registerCoreAgentTools(
	registry: HostToolRegistry,
	deps: {
		listAgents: () => { id: string; displayName: string }[]
		delegate: (args: {
			runtimeId: string
			prompt: string
			cwd: string
			sandbox?: "read-only" | "workspace-write" | "danger-full-access"
			model?: string
		}) => Promise<{ message: string; notices: string[] }>
		contextGet: (key: string) => string | undefined
		contextSet: (key: string, value: string, author?: string) => void
		contextList: () => string[]
	},
): void {
	registry.register({
		name: "gcode_list_agents",
		description:
			"List the other AI agents available on this machine that you can delegate tasks to.",
		category: "agents",
		inputSchema: { type: "object", properties: {}, additionalProperties: false },
		async handler() {
			return JSON.stringify(deps.listAgents())
		},
	})

	registry.register({
		name: "gcode_delegate",
		description:
			"Delegate a task to another AI agent and return its answer. Use gcode_list_agents to see valid agent ids.",
		category: "agents",
		inputSchema: {
			type: "object",
			properties: {
				agent: { type: "string", description: "Target agent id" },
				prompt: { type: "string", description: "The task for the target agent" },
				cwd: { type: "string", description: "Working directory (defaults to current)" },
			},
			required: ["agent", "prompt"],
		},
		async handler(args, ctx) {
			const agent = String(args.agent ?? "")
			const prompt = String(args.prompt ?? "")
			const cwd = String(args.cwd ?? ctx.cwd ?? process.cwd())
			if (!agent || !prompt) throw new Error("agent and prompt are required")
			const result = await deps.delegate({
				runtimeId: agent,
				prompt,
				cwd,
			})
			return result.message || "(no output)"
		},
	})

	registry.register({
		name: "gcode_context_get",
		description: "Read a value from the shared context store that agents use to collaborate.",
		category: "context",
		inputSchema: {
			type: "object",
			properties: { key: { type: "string" } },
			required: ["key"],
		},
		async handler(args) {
			const key = String(args.key ?? "")
			const value = deps.contextGet(key)
			return value ?? "(not set)"
		},
	})

	registry.register({
		name: "gcode_context_set",
		description: "Write a value to the shared context store so other agents can read it.",
		category: "context",
		inputSchema: {
			type: "object",
			properties: { key: { type: "string" }, value: { type: "string" } },
			required: ["key", "value"],
		},
		async handler(args) {
			deps.contextSet(String(args.key ?? ""), String(args.value ?? ""), "agent")
			return "ok"
		},
	})

	registry.register({
		name: "gcode_context_list",
		description: "List all keys in the shared context store.",
		category: "context",
		inputSchema: { type: "object", properties: {}, additionalProperties: false },
		async handler() {
			return JSON.stringify(deps.contextList())
		},
	})
}

/**
 * Host-mediated subagents (general-purpose + explore).
 * Roles are product-owned; execution reuses {@link AgentHost.delegate} with
 * role sandbox isolation. No CLI brand tool list.
 */
export function registerSubagentTools(
	registry: HostToolRegistry,
	deps: {
		/** Prefer a process runtime for isolation; fail closed if none. */
		resolveWorkerRuntimeId: () => string | null
		delegate: (args: {
			runtimeId: string
			prompt: string
			cwd: string
			sandbox?: "read-only" | "workspace-write" | "danger-full-access"
		}) => Promise<{ message: string; notices: string[] }>
	},
): void {
	registry.register({
		name: "gcode_list_subagents",
		description:
			"List host subagent roles (general-purpose, explore). Use gcode_run_subagent to invoke one with isolated context.",
		category: "subagents",
		inputSchema: { type: "object", properties: {}, additionalProperties: false },
		async handler() {
			return JSON.stringify(
				HOST_SUBAGENT_ROLES.map((r) => ({
					id: r.id,
					displayName: r.displayName,
					description: r.description,
					readOnly: r.readOnly,
					sandbox: r.sandbox,
				})),
			)
		},
	})

	registry.register({
		name: "gcode_run_subagent",
		description:
			"Run a host subagent role with isolated context and return its summary. Roles: general-purpose (write-capable under policy), explore (read-only research).",
		category: "subagents",
		inputSchema: {
			type: "object",
			properties: {
				role: {
					type: "string",
					description: "Subagent role id: general-purpose | explore",
				},
				prompt: { type: "string", description: "Task for the subagent" },
				cwd: { type: "string", description: "Working directory" },
			},
			required: ["role", "prompt"],
		},
		async handler(args, ctx) {
			const roleId = String(args.role ?? "").trim()
			const prompt = String(args.prompt ?? "").trim()
			const cwd = String(args.cwd ?? ctx.cwd ?? process.cwd())
			if (!roleId || !prompt) throw new Error("role and prompt are required")
			const role = getHostSubagentRole(roleId)
			if (!role) {
				throw new Error(
					`Unknown subagent role: ${roleId}. Use gcode_list_subagents for valid roles.`,
				)
			}
			const runtimeId = deps.resolveWorkerRuntimeId()
			if (!runtimeId) {
				throw new Error(
					"No worker runtime available for subagents. Install Codex or Claude Code, or register a harness.",
				)
			}
			const rolePreamble = role.readOnly
				? "[Explore subagent — read-only. Do not create, modify, or delete files. Search and report evidence only.]\n\n"
				: "[General-purpose subagent — complete the task in this isolated context and summarize results.]\n\n"
			const result = await deps.delegate({
				runtimeId,
				prompt: `${rolePreamble}${prompt}`,
				cwd,
				sandbox: role.sandbox,
			})
			return result.message || "(no output)"
		},
	})
}

/**
 * Platform tools every desktop host should offer harnesses (product surface).
 * Handlers are injectable so desktop can wire real automation/browser backends;
 * defaults are safe, real-dispatch stubs (no brand-specific code).
 */
export function registerDefaultPlatformTools(
	registry: HostToolRegistry,
	backends?: {
		/** List automation ids/names available on this host. */
		listAutomations?: () => Promise<Array<{ id: string; name: string; status?: string }>>
		/** Trigger an automation run by id. */
		runAutomation?: (id: string) => Promise<{ ok: boolean; message: string }>
		/** Run a host-approved shell command (implementer enforces policy). */
		runSystemCommand?: (
			command: string,
			cwd?: string,
		) => Promise<{ exitCode: number; stdout: string; stderr: string }>
		/** Open a URL in the system browser / host browser surface. */
		openBrowser?: (url: string) => Promise<{ ok: boolean; message: string }>
	},
): void {
	const listAutomations =
		backends?.listAutomations ??
		(async () => [] as Array<{ id: string; name: string; status?: string }>)
	const runAutomation =
		backends?.runAutomation ??
		(async (id: string) => ({
			ok: false,
			message: `No automation backend registered (requested id: ${id})`,
		}))
	const runSystemCommand =
		backends?.runSystemCommand ??
		(async (command: string) => ({
			exitCode: 1,
			stdout: "",
			stderr: `No system backend registered (command: ${command})`,
		}))
	const openBrowser =
		backends?.openBrowser ??
		(async (url: string) => ({
			ok: false,
			message: `No browser backend registered (url: ${url})`,
		}))

	registry.register({
		name: "gcode_automation_list",
		description:
			"List automations (scheduled agent jobs) available on this GCode host. Host-owned — works regardless of which coding CLI is active.",
		category: "automation",
		inputSchema: { type: "object", properties: {}, additionalProperties: false },
		async handler() {
			const items = await listAutomations()
			return JSON.stringify(items)
		},
	})

	registry.register({
		name: "gcode_automation_run",
		description:
			"Run a GCode automation by id now (unattended agent job). Fail closed if the automation or backend is missing.",
		category: "automation",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string", description: "Automation id" },
			},
			required: ["id"],
		},
		async handler(args) {
			const id = String(args.id ?? "").trim()
			if (!id) throw new Error("id is required")
			const result = await runAutomation(id)
			if (!result.ok) throw new Error(result.message)
			return result.message
		},
	})

	registry.register({
		name: "gcode_system_run",
		description:
			"Run a host-mediated shell command on the local machine (policy enforced by the host). Prefer this over inventing shell access outside GCode.",
		category: "system",
		inputSchema: {
			type: "object",
			properties: {
				command: { type: "string", description: "Shell command to run" },
				cwd: { type: "string", description: "Working directory" },
			},
			required: ["command"],
		},
		async handler(args, ctx) {
			const command = String(args.command ?? "").trim()
			if (!command) throw new Error("command is required")
			const cwd = typeof args.cwd === "string" ? args.cwd : ctx.cwd
			const result = await runSystemCommand(command, cwd)
			return JSON.stringify(result)
		},
	})

	registry.register({
		name: "gcode_browser_open",
		description:
			"Open a URL in the system browser (or host browser surface). Host-owned tool available to every harness.",
		category: "browser",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string", description: "http(s) URL to open" },
			},
			required: ["url"],
		},
		async handler(args) {
			const url = String(args.url ?? "").trim()
			if (!url) throw new Error("url is required")
			if (!/^https?:\/\//i.test(url)) {
				throw new Error("url must start with http:// or https://")
			}
			const result = await openBrowser(url)
			if (!result.ok) throw new Error(result.message)
			return result.message
		},
	})
}
