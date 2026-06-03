/**
 * Re-exports for @palot/core/events if consumers prefer subpath import.
 * In practice most import types directly from @palot/events or via root.
 */
export type {
	AutomationRunInfo,
	AutomationRunStatus,
	Channel,
	DiffInfo,
	EventEnvelope,
	MessageInfo,
	MessagePartInfo,
	MessagePartType,
	MessageRole,
	PalotEvent,
	PermissionRequest,
	PermissionResponse,
	QuestionAnswer,
	QuestionRequest,
	SessionInfo,
	SessionStatus,
	// infos
	WorkspaceInfo,
} from "@palot/events"
export { ALL_CHANNELS, CHANNELS } from "@palot/events"
