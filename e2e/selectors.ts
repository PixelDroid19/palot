/**
 * Playwright selectors — mirror apps/desktop/src/shared/test-ids.ts.
 * Keep in sync when adding new test ids.
 */

/** Mirror apps/desktop/src/shared/test-ids.ts */
export const SESSION_ID_ATTR = "data-session-id"
export const PROJECT_SLUG_ATTR = "data-project-slug"

export const TID = {
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

/**
 * Visible session row (responsive layout may duplicate nodes; pick first visible).
 */
export function sessionItem(page: import("@playwright/test").Page, sessionId: string) {
	return page
		.locator(`[data-testid="${TID.sessionItem}"][${SESSION_ID_ATTR}="${sessionId}"]`)
		.filter({ visible: true })
		.first()
}

export function projectFolder(page: import("@playwright/test").Page, projectSlug: string) {
	return page
		.locator(`[data-testid="${TID.projectFolder}"][${PROJECT_SLUG_ATTR}="${projectSlug}"]`)
		.filter({ visible: true })
		.first()
}
