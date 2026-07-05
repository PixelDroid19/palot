import { net } from "electron"
import { createLogger } from "./logger"
import { getSettings } from "./settings-store"

const log = createLogger("webhooks")

export type WebhookTarget = "feishu" | "wechat" | "generic"

export interface WebhookEvent {
	type: "permission" | "question" | "completed" | "error"
	title: string
	body: string
	sessionId?: string
}

// ============================================================
// Payload builders
//
// Feishu (Lark) custom bot:  { msg_type: "text", content: { text } }
// WeChat Work group robot:   { msgtype: "text", text: { content } }
// Generic:                   { title, body, type, sessionId }
// ============================================================

function buildPayload(target: WebhookTarget, event: WebhookEvent): unknown {
	const text = `[Palot] ${event.title}\n${event.body}`
	switch (target) {
		case "feishu":
			return { msg_type: "text", content: { text } }
		case "wechat":
			return { msgtype: "text", text: { content: text } }
		case "generic":
			return {
				title: event.title,
				body: event.body,
				type: event.type,
				sessionId: event.sessionId,
				source: "palot",
			}
	}
}

function post(url: string, payload: unknown): Promise<{ success: boolean; error?: string }> {
	return new Promise((resolve) => {
		try {
			const request = net.request({ method: "POST", url })
			request.setHeader("Content-Type", "application/json")
			request.on("response", (response) => {
				const ok = response.statusCode >= 200 && response.statusCode < 300
				// Drain the response so the socket closes cleanly.
				response.on("data", () => {})
				response.on("end", () => {
					if (ok) resolve({ success: true })
					else resolve({ success: false, error: `HTTP ${response.statusCode}` })
				})
			})
			request.on("error", (err) => {
				resolve({ success: false, error: err.message })
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
		body: "Palot webhook integration is working.",
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
