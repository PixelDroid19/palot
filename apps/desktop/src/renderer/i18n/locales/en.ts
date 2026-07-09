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
		sandbox: "Execution mode",
		sandboxPlan: "Plan mode",
		sandboxReadOnly: "Confirm before changes",
		sandboxWorkspaceWrite: "Auto edit",
		sandboxFullAccess: "Full access",
		loginRequired: "{{name}} — login required",
	},
	taskCatalog: {
		view: "Task view",
		workspace: "Workspace",
		timeline: "Timeline",
		searchPlaceholder: "Search tasks…",
		activeNow: "Active Now",
		recent: "Recent",
	},
	cliApprovals: {
		title: "The agent wants to use {{name}}",
		allow: "Allow",
		allowSession: "Allow for session",
		deny: "Deny",
	},
	settings: {
		language: "Language",
		languageDescription: "Interface language (English or Spanish)",
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
			"Have a multi-turn conversation with any supported coding runtime (OpenCode, Codex, Claude Code, …). GCode keeps the session so context carries across turns.",
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

	litShell: {
		newSession: "New session",
		newSessionTitle: "New session",
		settings: "Settings",
		back: "Back",
		emptySessions: "No sessions yet. Start one to chat with OpenCode, Codex, or Claude.",
		welcomeTitle: "What should we build?",
		welcomeBody: "Pick a session or start a new one. Dense multi-agent workspace — runtimes, tools, and approvals in one place.",
		composerHint: "Enter to send · Shift+Enter for newline",
		systemReady: "GCode Lit shell ready. Sessions and tools use the host bridge when Electron is available.",
		sessionOpened: "Opened session {{id}}",
		offlineReply: "Received: {{text}}\n\n(Connect a runtime session for live agent turns.)",
		turnFailed: "Turn failed: {{error}}",
	},

	litOnboarding: {
		welcomeTitle: "Welcome to GCode",
		welcomeBody: "A multi-agent desktop for OpenCode, Claude Code, and Codex.",
		runtimesTitle: "Install runtimes",
		runtimesBody: "Install the CLIs you use. GCode detects them and opens sessions in your project folders.",
		readyTitle: "You're ready",
		readyBody: "Create a session, pick a runtime, and start building.",
		stepWelcome: "Welcome",
		stepRuntimes: "Runtimes",
		stepReady: "Ready",
		next: "Continue",
		finish: "Start using GCode",
	},
	litAutomations: {
		title: "Automations",
		empty: "No automations yet.",
		runNow: "Run now",
	},
	litSettings: {
		general: "General",
		server: "Server",
		about: "About",
		serverUrl: "Managed runtime URL",
		aboutBody: "GCode multi-agent desktop — Lit UI, host tool plane, en/es.",
	},
} as const
