import { readSessionRuntimeState, sessionRuntimeCapabilities } from "../lib/runtime-session-config"
import type { Message, Part } from "../lib/types"
import { requireManagedRuntimeClient } from "./managed-runtime-client"

export interface RuntimeSessionMessageBundle {
	hasEarlier: boolean
	messages: Message[]
	parts: Record<string, Part[]>
}

function supportsServerHistory(sessionId: string): boolean {
	return sessionRuntimeCapabilities(readSessionRuntimeState(sessionId)).supportsServerHistory
}

function toBundle(
	raw: Array<{ info: Message; parts: Part[] }>,
	hasEarlier: boolean,
): RuntimeSessionMessageBundle {
	const messages = raw.map((message) => message.info)
	const parts: Record<string, Part[]> = {}
	for (const message of raw) {
		parts[message.info.id] = message.parts
	}
	return { hasEarlier, messages, parts }
}

export async function fetchRuntimeSessionMessages(args: {
	directory: string | null
	sessionId: string
	limit?: number
}): Promise<RuntimeSessionMessageBundle | null> {
	if (!supportsServerHistory(args.sessionId)) {
		return null
	}

	const client = requireManagedRuntimeClient(args.directory)
	const result = await client.session.messages({
		sessionID: args.sessionId,
		...(args.limit ? { limit: args.limit } : {}),
	})
	const raw = (result.data ?? []) as Array<{ info: Message; parts: Part[] }>
	return toBundle(raw, args.limit != null && raw.length >= args.limit)
}
