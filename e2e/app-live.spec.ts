import { expect, test } from "@playwright/test"
import { MOCK_HOME, MOCK_SESSION_DARK_MODE } from "./fixtures"
import { sessionItem, TID } from "./selectors"

test.describe("Palot renderer (live discovery)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/")
	})

	test("shows main shell after discovery", async ({ page }) => {
		test.slow()
		await expect(page.getByTestId(TID.newChatView)).toBeVisible({ timeout: 90_000 })
		await expect(page.getByTestId(TID.appRoot)).toBeVisible()
	})

	test("live mode does not register mock fixture session ids", async ({ page }) => {
		test.slow()
		await expect(page.getByTestId(TID.newChatView)).toBeVisible({ timeout: 90_000 })
		await expect(sessionItem(page, MOCK_SESSION_DARK_MODE)).toHaveCount(0)
	})
})

test.describe("Palot renderer (demo vs live)", () => {
	test("mock query enables fixture session rows", async ({ page }) => {
		await page.goto(MOCK_HOME)
		await expect(page.getByTestId(TID.appRoot)).toBeVisible({ timeout: 20_000 })
		await expect(sessionItem(page, MOCK_SESSION_DARK_MODE)).toBeVisible()
	})
})
