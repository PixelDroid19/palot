/**
 * IPC Contracts package.
 * Single source of truth for channel names, payloads, responses, and validation.
 * Used to derive main/preload/renderer IPC wrappers.
 */

export const IPC_CHANNELS = {
	// Example narrow contracts (expand as roadmap progresses)
	GET_VERSION: "app:get-version",
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

// Placeholder request/response types
export type GetVersionRequest = Record<string, never>

export interface GetVersionResponse {
	version: string
}
