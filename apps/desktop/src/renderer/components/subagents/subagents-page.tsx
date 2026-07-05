import { SubagentPanel } from "../settings/subagent-panel"

/**
 * Top-level workspace for delegating tasks to local coding-agent CLIs
 * (Codex, Claude Code, …). Palot is not tied to OpenCode: this surfaces the
 * multi-CLI subagent runner as a first-class page, reachable from the sidebar.
 */
export function SubagentsPage() {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-y-auto p-6">
			<div>
				<h1 className="text-2xl font-semibold">CLI Agents</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Delegate a task to any coding-agent CLI installed on this machine. Runs headless and
					streams the result back — no OpenCode session required.
				</p>
			</div>
			<SubagentPanel />
		</div>
	)
}
