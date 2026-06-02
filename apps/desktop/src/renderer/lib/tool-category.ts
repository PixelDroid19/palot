/**
 * Tool category classification for chat tools and session metrics.
 * Shared by chat UI and metrics — not part of the chat feature public API.
 */

export type ToolCategory =
	| "explore"
	| "edit"
	| "run"
	| "delegate"
	| "plan"
	| "ask"
	| "fetch"
	| "other"

export const TOOL_CATEGORY_COLORS: Record<ToolCategory, string> = {
	explore: "border-l-muted-foreground/30",
	edit: "border-l-amber-500/60",
	run: "border-l-blue-500/60",
	delegate: "border-l-violet-500/60",
	plan: "border-l-emerald-500/60",
	ask: "border-l-cyan-500/60",
	fetch: "border-l-sky-500/60",
	other: "border-l-muted-foreground/20",
}

export function getToolCategory(tool: string): ToolCategory {
	switch (tool) {
		case "read":
		case "glob":
		case "grep":
		case "list":
			return "explore"
		case "edit":
		case "write":
		case "apply_patch":
			return "edit"
		case "bash":
			return "run"
		case "task":
			return "delegate"
		case "todowrite":
		case "todoread":
			return "plan"
		case "question":
			return "ask"
		case "webfetch":
			return "fetch"
		default:
			return "other"
	}
}