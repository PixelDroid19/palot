/**
 * Stable selectors for Playwright E2E and integration tests.
 *
 * Use these constants in components (`data-testid`) and in `e2e/` specs.
 * Do not assert on user-visible copy in E2E — prefer test ids, roles, and URLs.
 */

export const TEST_IDS = {
	appRoot: "app-root",
	sidebar: "sidebar",
	newChatView: "new-chat-view",
	newChatPrompt: "new-chat-prompt",
	sessionView: "session-view",
	sessionItem: "session-item",
	projectFolder: "project-folder",
	commandPalette: "command-palette",
	commandPaletteInput: "command-palette-input",
	settingsGeneral: "settings-general",
	settingsServers: "settings-servers",
	startupOverlay: "startup-overlay",
	chatMessageList: "chat-message-list",
} as const

/** HTML attribute for session rows (value = OpenCode session id). */
export const SESSION_ID_ATTR = "data-session-id"

/** HTML attribute for project folder rows (value = project slug). */
export const PROJECT_SLUG_ATTR = "data-project-slug"