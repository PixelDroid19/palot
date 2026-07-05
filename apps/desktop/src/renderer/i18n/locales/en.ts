/**
 * English base locale. This is the source of truth for translation keys — the
 * `TranslationKey` type is derived from its shape, so every other locale must
 * mirror it and new UI strings are added here first.
 *
 * Only strings for newly-built features live here for now; existing UI is not
 * migrated yet.
 */
export const en = {
	codexSubagent: {
		title: "Codex subagent",
		description:
			"Delegate a task to a local Codex agent. It runs headless and streams its result back here.",
		notInstalled: "Codex CLI is not installed. Install it to delegate tasks.",
		promptLabel: "Task",
		promptPlaceholder: "Describe the task for Codex to work on…",
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
		failed: "Codex subagent failed: {{error}}",
		empty: "No output yet. Enter a task and run the subagent.",
	},
} as const
