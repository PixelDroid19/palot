/**
 * Pure tool category mapping (framework-free).
 * Used by Lit tool chrome and React callers.
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

/** Status wire values for tool chrome. */
export type ToolCardStatus = "running" | "error" | "completed" | "pending" | ""

export function isToolCardRunning(status: string | null | undefined): boolean {
	return status === "running" || status === "pending"
}

export function isToolCardError(status: string | null | undefined): boolean {
	return status === "error"
}
