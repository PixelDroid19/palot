import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import { upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import type { Session } from "../lib/types"
import {
	createCliSession,
	switchCliRuntime,
	switchCliSessionToOpenCode,
} from "./cli-chat"
import { getProjectClient } from "./connection-manager"

export async function createOpenCodeSession(
	directory: string,
	title?: string,
): Promise<Session | undefined> {
	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	const result = await client.session.create({ title })
	const session = result.data as Session | undefined
	if (session) {
		appStore.set(upsertSessionAtom, { session, directory })
	}
	return session
}

export function createCliRuntimeSession(args: {
	directory: string
	runtimeId: AgentRuntimeId
	sandbox: AgentSandbox
	model?: string
	effort?: string
}): string {
	return createCliSession(args)
}

export async function switchRuntimeSession(
	sessionId: string,
	targetRuntime: string,
	fallbackDirectory?: string,
): Promise<string | null> {
	if (targetRuntime === "opencode") {
		return switchCliSessionToOpenCode(sessionId, createOpenCodeSession)
	}

	await switchCliRuntime(sessionId, targetRuntime, fallbackDirectory)
	return sessionId
}
