import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import { upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import { isCliRuntime, type SessionRuntimeId } from "../lib/session-runtimes"
import type { Session } from "../lib/types"
import {
	createCliRuntimeSessionState,
	switchCliRuntimeSession,
	switchCliSessionIntoOpenCode,
} from "./runtime-cli-session"
import { restoreCliRuntimeSessions } from "./runtime-cli-store"
import { getProjectClient } from "./connection-manager"

export function restoreRuntimeSessions(): void {
	restoreCliRuntimeSessions()
}

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
	return createCliRuntimeSessionState(args)
}

export async function switchRuntimeSession(
	sessionId: string,
	targetRuntime: SessionRuntimeId,
	fallbackDirectory?: string,
): Promise<string | null> {
	if (!isCliRuntime(targetRuntime)) {
		return switchCliSessionIntoOpenCode(sessionId, createOpenCodeSession)
	}

	await switchCliRuntimeSession(sessionId, targetRuntime, fallbackDirectory)
	return sessionId
}
