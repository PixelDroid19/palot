import { expect, test } from "@playwright/test"
import {
	MOCK_HOME,
	MOCK_PROJECT_SLUG,
	MOCK_SESSION_AUTH_FIX,
	MOCK_SESSION_DARK_MODE,
	MOCK_SESSION_DARK_MODE_PATH,
	mockPath,
	sessionUrlPattern,
} from "./fixtures"
import { projectFolder, sessionItem, TID } from "./selectors"

test.describe("Palot renderer (demo mode)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(MOCK_HOME)
		await expect(page.getByTestId(TID.appRoot)).toBeVisible({ timeout: 20_000 })
		await expect(page.getByTestId(TID.newChatView)).toBeVisible({ timeout: 20_000 })
	})

	test("home route shows new-chat shell", async ({ page }) => {
		await expect(page.getByTestId(TID.newChatView)).toBeVisible()
		await expect(page.getByTestId(TID.newChatPrompt)).toBeVisible()
		await expect(page.getByRole("textbox").first()).toBeEnabled()
	})

	test("sidebar exposes mock session rows", async ({ page }) => {
		await expect(sessionItem(page, MOCK_SESSION_DARK_MODE)).toBeVisible()
		await expect(sessionItem(page, MOCK_SESSION_AUTH_FIX)).toBeVisible()
		await expect(projectFolder(page, MOCK_PROJECT_SLUG)).toBeVisible()
	})

	test("direct navigation to mock session URL", async ({ page }) => {
		await page.goto(mockPath(MOCK_SESSION_DARK_MODE_PATH))
		await expect(page).toHaveURL(sessionUrlPattern(MOCK_SESSION_DARK_MODE))
		await expect(page.getByTestId(TID.sessionView)).toBeVisible({ timeout: 15_000 })
		await expect(page.getByTestId(TID.chatMessageList)).toBeVisible()
	})

	test("settings routes render by test id", async ({ page }) => {
		await page.goto(mockPath("/settings/general"))
		await expect(page.getByTestId(TID.settingsGeneral)).toBeVisible({ timeout: 15_000 })

		await page.goto(mockPath("/settings/servers"))
		await expect(page.getByTestId(TID.settingsServers)).toBeVisible({ timeout: 15_000 })
	})

	test("command palette opens and closes via keyboard", async ({ page }) => {
		const isMac = process.platform === "darwin"
		await page.keyboard.press(isMac ? "Meta+k" : "Control+k")
		const dialog = page.getByRole("dialog")
		await expect(dialog).toBeVisible()
		await expect(page.getByTestId(TID.commandPaletteInput)).toBeVisible()

		await page.keyboard.press("Escape")
		await expect(dialog).toBeHidden()
	})

	test("clicking session row navigates by session id", async ({ page }) => {
		await sessionItem(page, MOCK_SESSION_AUTH_FIX).click()
		await expect(page).toHaveURL(sessionUrlPattern(MOCK_SESSION_AUTH_FIX))
		await expect(page.getByTestId(TID.sessionView)).toBeVisible()
		await expect(page.getByTestId(TID.chatMessageList)).toBeVisible()
	})

	test("project folder row is visible and clickable", async ({ page }) => {
		const folder = projectFolder(page, MOCK_PROJECT_SLUG)
		await expect(folder).toBeVisible()
		await folder.click()
		await expect(folder).toBeVisible()
	})
})
