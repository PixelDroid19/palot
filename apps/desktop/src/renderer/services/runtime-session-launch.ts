import type { SessionRuntimeId } from "../lib/session-runtimes"
import { restoreCliRuntimeSessions } from "./runtime-cli-store"
import {
	runtimeSessionGateway,
	type RuntimeSessionCreateRequest,
	type RuntimeSessionCreateResult,
} from "./runtime-session-gateway"

export function restoreRuntimeSessions(): void {
	restoreCliRuntimeSessions()
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
