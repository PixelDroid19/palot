import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import type { Session } from "../lib/types"
import {
	createCliSession,
	switchCliRuntime,
	switchCliSessionToManagedRuntime,
} from "./cli-chat"

export function createCliRuntimeSessionState(args: {
	directory: string
	runtimeId: AgentRuntimeId
	sandbox: AgentSandbox
	model?: string
	effort?: string
}): string {
	return createCliSession(args)
}

export async function switchCliRuntimeSession(
	sessionId: string,
	runtimeId: AgentRuntimeId,
	fallbackCwd?: string,
): Promise<void> {
	await switchCliRuntime(sessionId, runtimeId, fallbackCwd)
}

export async function switchCliSessionIntoProjectRuntime(
	sessionId: string,
	createProjectSession: (directory: string, title?: string) => Promise<Session | undefined>,
): Promise<string | null> {
	return switchCliSessionToManagedRuntime(sessionId, createProjectSession)
}

export const switchCliSessionIntoManagedRuntime = switchCliSessionIntoProjectRuntime
