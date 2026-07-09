/**
 * OpenCode managed-server chat without React/Jotai.
 * Uses public runtime SDK helpers + backend server URL.
 */
import type { Session } from "../lib/types"
import { fetchRuntimeServerUrl } from "../services/backend"
import {
	connectToServer,
	getSessionMessages,
	listSessions,
} from "../services/project-runtime-sdk"
import type { LitChatMessage } from "./session-store"

export async function getManagedClient() {
	const { url } = await fetchRuntimeServerUrl()
	if (!url) throw new Error("Managed runtime server is not available")
	return connectToServer(url)
}

export async function listManagedSessions(_directory?: string): Promise<Session[]> {
	const client = await getManagedClient()
	const sessions = await listSessions(client)
	return sessions ?? []
}

export async function createManagedSession(title?: string): Promise<Session> {
	const client = await getManagedClient()
	const result = await client.session.create({ title })
	const session = result.data as Session | undefined
	if (!session?.id) throw new Error("Failed to create managed session")
	return session
}

export async function loadManagedMessages(sessionId: string): Promise<LitChatMessage[]> {
	const client = await getManagedClient()
	const data = await getSessionMessages(client, sessionId)
	const messages = (data as { data?: unknown } | unknown[]) ?? []
	const list = Array.isArray(messages)
		? messages
		: Array.isArray((messages as { data?: unknown[] }).data)
			? ((messages as { data: unknown[] }).data)
			: []
	const out: LitChatMessage[] = []
	for (const m of list as Array<{
		id?: string
		info?: { id?: string; role?: string }
		role?: string
		parts?: Array<{ type?: string; text?: string }>
	}>) {
		const id = m.id || m.info?.id || `m-${out.length}`
		const roleRaw = m.role || m.info?.role || "assistant"
		const role =
			roleRaw === "user" || roleRaw === "assistant" ? roleRaw : ("system" as const)
		const text = (m.parts || [])
			.filter((p) => p.type === "text" && p.text)
			.map((p) => p.text as string)
			.join("\n")
			.trim()
		if (text) out.push({ id, role, text })
	}
	return out
}

export async function promptManagedSession(
	sessionId: string,
	text: string,
	model?: { providerID: string; modelID: string },
): Promise<void> {
	const client = await getManagedClient()
	await client.session.promptAsync({
		sessionID: sessionId,
		parts: [{ type: "text", text }],
		model: model
			? { providerID: model.providerID, modelID: model.modelID }
			: undefined,
	})
}
