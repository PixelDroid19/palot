/**
 * i18n for Lit surfaces — en/es via shipped translate core.
 */
import { describe, expect, test } from "bun:test"
import { translate } from "../src/renderer/i18n"

describe("Lit shell i18n (shipped translate)", () => {
	test("en and es differ for litShell keys", () => {
		const en = translate("en", "litShell.settings")
		const es = translate("es", "litShell.settings")
		expect(en.length).toBeGreaterThan(0)
		expect(es.length).toBeGreaterThan(0)
		expect(en).not.toBe(es)
		expect(en).toBe("Settings")
		expect(es).toBe("Ajustes")
	})

	test("locale switch changes welcome body", () => {
		const en = translate("en", "litShell.welcomeBody")
		const es = translate("es", "litShell.welcomeBody")
		expect(en.toLowerCase()).not.toContain("elige una sesión")
		expect(es.toLowerCase()).toContain("sesión")
		expect(en).not.toBe(es)
	})

	test("interpolation works in both locales", () => {
		const en = translate("en", "litShell.sessionOpened", { id: "abc" })
		const es = translate("es", "litShell.sessionOpened", { id: "abc" })
		expect(en).toContain("abc")
		expect(es).toContain("abc")
		expect(en).not.toBe(es)
	})
})
