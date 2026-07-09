import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import type { Session } from "../lib/types"
import {
	createCliSession,
	switchCliRuntime,
	switchSessionToManagedServer,
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

/** Process (agent-host) session → managed-server (OpenCode) with transcript handoff. */
export async function switchSessionIntoManagedServer(
	sessionId: string,
	createManagedSession: (directory: string, title?: string) => Promise<Session | undefined>,
): Promise<string | null> {
	return switchSessionToManagedServer(sessionId, createManagedSession)
}

/** @deprecated Use switchSessionIntoManagedServer */
export const switchCliSessionIntoProjectRuntime = switchSessionIntoManagedServer
/** @deprecated Use switchSessionIntoManagedServer */
export const switchCliSessionIntoManagedRuntime = switchSessionIntoManagedServer
