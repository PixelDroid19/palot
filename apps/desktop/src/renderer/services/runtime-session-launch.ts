import type { AgentRuntimeId, AgentSandbox } from "../../preload/api"
import type { SessionRuntimeId } from "../lib/session-runtimes"
import type { Session } from "../lib/types"
import { restoreCliRuntimeSessions } from "./runtime-cli-store"
import {
	runtimeSessionGateway,
	type RuntimeSessionCreateRequest,
	type RuntimeSessionCreateResult,
} from "./runtime-session-gateway"

export function restoreRuntimeSessions(): void {
	restoreCliRuntimeSessions()
}

export async function createOpenCodeSession(
	directory: string,
	title?: string,
): Promise<Session | undefined> {
	return runtimeSessionGateway.createOpenCodeSession(directory, title)
}

export function createCliRuntimeSession(args: {
	directory: string
	runtimeId: AgentRuntimeId
	sandbox: AgentSandbox
	model?: string
	effort?: string
}): string {
	return runtimeSessionGateway.createCliRuntimeSession(args)
}

export async function createRuntimeSession(
	args: RuntimeSessionCreateRequest,
): Promise<RuntimeSessionCreateResult | null> {
	return runtimeSessionGateway.createSession(args)
}

export async function switchRuntimeSession(
	sessionId: string,
	targetRuntime: SessionRuntimeId,
	fallbackDirectory?: string,
): Promise<string | null> {
	return runtimeSessionGateway.switchRuntimeSession(sessionId, targetRuntime, fallbackDirectory)
}
