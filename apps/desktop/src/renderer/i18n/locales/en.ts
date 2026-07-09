/**
 * English base locale. This is the source of truth for translation keys — the
 * `TranslationKey` type is derived from its shape, so every other locale must
 * mirror it and new UI strings are added here first.
 *
 * Only strings for newly-built features live here for now; existing UI is not
 * migrated yet.
 */
export const en = {
	subagent: {
		title: "Agent subagent",
		description:
			"Delegate a task to a local coding-agent CLI. It runs headless and streams its result back here.",
		noneInstalled: "No supported agent CLI is installed. Install Codex or Claude Code to delegate tasks.",
		agentLabel: "Agent",
		promptLabel: "Task",
		promptPlaceholder: "Describe the task for the agent to work on…",
		workingDirLabel: "Working directory",
		workingDirPlaceholder: "/path/to/project",
		sandboxLabel: "Sandbox",
		sandbox: {
			readOnly: "Read-only",
			workspaceWrite: "Workspace write",
			dangerFullAccess: "Full access",
		},
		run: "Run subagent",
		running: "Running…",
		cancel: "Cancel",
		result: "Result",
		usage: "{{input}} in · {{output}} out tokens",
		failed: "Subagent failed: {{error}}",
		empty: "No output yet. Enter a task and run the subagent.",
	},
	runtimePicker: {
		runtime: "Session runtime",
		model: "Model",
		defaultModel: "Default model",
		effort: "Reasoning effort",
		effortDefault: "Default effort",
		effortLevel: "{{level}}",
		sandbox: "Sandbox",
		sandboxPlan: "Plan (read-only)",
		sandboxReadOnly: "Read-only",
		sandboxWorkspaceWrite: "Workspace write",
		sandboxFullAccess: "Full access (agent tools)",
		loginRequired: "{{name}} — login required",
	},
	cliApprovals: {
		title: "The agent wants to use {{name}}",
		allow: "Allow",
		allowSession: "Allow for session",
		deny: "Deny",
	},
	settings: {
		language: "Language",
		languageDescription: "Language for newly-built parts of the interface",
	},
	queuedMessage: {
		sendNow: "Send now",
		sending: "Sending…",
		cancel: "Cancel",
		cancelling: "Cancelling…",
		queued: "Queued",
	},
	subagentChat: {
		title: "Runtime agents",
		description:
			"Have a multi-turn conversation with any supported coding runtime (OpenCode, Codex, Claude Code, …). Palot keeps the session so context carries across turns.",
		noneInstalled: "No supported runtime is installed. Install OpenCode, Codex, or Claude Code to start.",
		you: "You",
		thinking: "Thinking…",
		send: "Send",
		stop: "Stop",
		newConversation: "New conversation",
		inputPlaceholder: "Message {{agent}}…",
		emptyState: "Start a conversation with {{agent}}. It runs headless and remembers this session across turns.",
		contextKept: "Session kept · context carries across turns",
	},
} as const
