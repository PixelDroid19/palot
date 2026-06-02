import { expect, test } from "@playwright/test"
import { PALOT_SERVER_URL } from "./fixtures"

test.describe("Palot server API", () => {
	test("GET /health returns ok", async ({ request }) => {
		const res = await request.get(`${PALOT_SERVER_URL}/health`)
		expect(res.ok()).toBe(true)
		const body = (await res.json()) as { status: string; timestamp: number }
		expect(body.status).toBe("ok")
		expect(typeof body.timestamp).toBe("number")
	})

	test("GET /api/servers lists server slot", async ({ request }) => {
		const res = await request.get(`${PALOT_SERVER_URL}/api/servers`)
		expect(res.ok()).toBe(true)
		const body = (await res.json()) as { servers: unknown[] }
		expect(Array.isArray(body.servers)).toBe(true)
	})

	test("GET /api/servers/opencode starts or returns OpenCode URL", async ({ request }) => {
		test.slow()
		const res = await request.get(`${PALOT_SERVER_URL}/api/servers/opencode`, {
			timeout: 60_000,
		})
		if (!res.ok()) {
			const err = (await res.json()) as { error?: string }
			test.skip(
				!!err.error,
				`OpenCode not available in this environment: ${err.error ?? res.status()}`,
			)
			return
		}
		const body = (await res.json()) as { url: string }
		expect(body.url).toMatch(/^https?:\/\//)

		const health = await request.get(`${body.url}/global/health`, { timeout: 15_000 })
		expect(health.ok()).toBe(true)
	})
})