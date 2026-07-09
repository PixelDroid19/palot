/**
 * Pure builders for outgoing webhook payloads. Kept free of Electron/host APIs
 * so the exact shapes each provider expects can be unit-tested — they are
 * external contracts, so a silent change would break delivery.
 */

export type WebhookTarget = "feishu" | "wechat" | "generic"

export interface WebhookEvent {
	type: "permission" | "question" | "completed" | "error"
	title: string
	body: string
	sessionId?: string
}

/**
 * Build the request body for a webhook target.
 *
 * - Feishu (Lark) custom bot:  `{ msg_type: "text", content: { text } }`
 * - WeChat Work group robot:   `{ msgtype: "text", text: { content } }`
 * - Generic:                   flat JSON with the event fields + `source`
 */
export function buildPayload(target: WebhookTarget, event: WebhookEvent): unknown {
	const text = `[GCode] ${event.title}\n${event.body}`
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
				source: "gcode",
			}
	}
}
