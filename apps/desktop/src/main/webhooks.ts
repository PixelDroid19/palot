import { net } from "electron"
import { createLogger } from "./logger"
import { getSettings } from "./settings-store"
import { buildPayload, type WebhookEvent, type WebhookTarget } from "./webhook-payloads"

export type { WebhookEvent, WebhookTarget } from "./webhook-payloads"

const log = createLogger("webhooks")

/** Abort a webhook POST if the endpoint hasn't responded in this many ms. */
const WEBHOOK_TIMEOUT_MS = 10_000

function post(url: string, payload: unknown): Promise<{ success: boolean; error?: string }> {
	return new Promise((resolve) => {
		try {
			const request = net.request({ method: "POST", url })
			request.setHeader("Content-Type", "application/json")

			// Resolve exactly once, and guard against a hung endpoint leaving the
			// request (and its timer) pending forever.
			let settled = false
			const finish = (result: { success: boolean; error?: string }) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				resolve(result)
			}
			const timer = setTimeout(() => {
				request.abort()
				finish({ success: false, error: `Timed out after ${WEBHOOK_TIMEOUT_MS}ms` })
			}, WEBHOOK_TIMEOUT_MS)

			request.on("response", (response) => {
				const ok = response.statusCode >= 200 && response.statusCode < 300
				// Drain the response so the socket closes cleanly.
				response.on("data", () => {})
				response.on("end", () => {
					if (ok) finish({ success: true })
					else finish({ success: false, error: `HTTP ${response.statusCode}` })
				})
			})
			request.on("error", (err) => {
				finish({ success: false, error: err.message })
			})
			request.write(JSON.stringify(payload))
			request.end()
		} catch (err) {
			resolve({ success: false, error: err instanceof Error ? err.message : "Unknown error" })
		}
	})
}

function urlFor(target: WebhookTarget): string {
	const w = getSettings().webhooks
	if (target === "feishu") return w.feishuUrl
	if (target === "wechat") return w.wechatUrl
	return w.genericUrl
}

/** Send a test message to a configured webhook target. */
export async function testWebhook(
	target: WebhookTarget,
): Promise<{ success: boolean; error?: string }> {
	const url = urlFor(target)
	if (!url) return { success: false, error: "No webhook URL configured" }
	const result = await post(url, buildPayload(target, {
		type: "completed",
		title: "Test notification",
		body: "GCode webhook integration is working.",
	}))
	log.info("Webhook test", { target, success: result.success })
	return result
}

/**
 * Forward an agent event to every configured & enabled webhook target.
 * Fire-and-forget: failures are logged, never thrown.
 */
export function sendWebhookNotification(event: WebhookEvent): void {
	const w = getSettings().webhooks
	if (!w.enabled) return

	const eventEnabled =
		(event.type === "completed" && w.events.completion) ||
		(event.type === "permission" && w.events.permissions) ||
		(event.type === "question" && w.events.questions) ||
		(event.type === "error" && w.events.errors)
	if (!eventEnabled) return

	const targets: WebhookTarget[] = ["feishu", "wechat", "generic"]
	for (const target of targets) {
		const url = urlFor(target)
		if (!url) continue
		post(url, buildPayload(target, event)).then((result) => {
			if (!result.success) {
				log.warn("Webhook delivery failed", { target, error: result.error })
			}
		})
	}
}
