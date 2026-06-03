/**
 * @palot/agent-adapter-opencode
 *
 * Full implementation of the OpenCode provider adapter.
 * - Imports ONLY types from "@opencode-ai/sdk/v2/client"
 * - Uses client.global.event() exclusively for connection /global/event
 * - mapOpenCodeEventToPalot is pure and explicitly handles session/message/part/perm/q/tool/diff/error/...
 * - dispatch("session.prompt") always supplies resolved model to promptAsync
 * - No SDK types are exported or leak to callers.
 * - Adapter is pure: host supplies fetch/auth via connect input for proxying needs.
 *
 * See roadmap/core-agent-platform.md and AGENTS.md .
 */

// Re-export the interface + inputs from core for convenience (single import site)
export type {
	AgentProviderAdapter,
	GetSessionInput,
	ListSessionsInput,
	ProviderConnection,
	ProviderConnectionInput,
} from "@palot/core"
export { OpenCodeAgentAdapter } from "./adapter"
export type { FetchFn } from "./client"
export {
	mapOpenCodeEventToPalot,
	mapOpenCodeMessage,
	mapOpenCodePart,
	mapOpenCodePermission,
	mapOpenCodeQuestion,
	mapOpenCodeSession,
	mapOpenCodeStatus,
	mapPalotResponseToReply,
	mapPermissionReplyToResponse,
} from "./event-mapper"
