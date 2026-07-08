import type { AgentPermissionDecision } from "../../preload/api"
import {
	answerCliQuestion,
	forgetCliSession,
	persistCliSession,
	restoreCliSessions,
	respondCliPermission,
} from "./cli-chat"

export function persistCliRuntimeSession(sessionId: string): void {
	persistCliSession(sessionId)
}

export function restoreCliRuntimeSessions(): void {
	restoreCliSessions()
}

export async function forgetCliRuntimeSession(sessionId: string): Promise<void> {
	await forgetCliSession(sessionId)
}

export function respondCliRuntimePermissionRequest(
	sessionId: string,
	requestId: string,
	decision: AgentPermissionDecision,
): void {
	respondCliPermission(sessionId, requestId, decision)
}

export function answerCliRuntimeQuestionRequest(
	sessionId: string,
	requestId: string,
	answers: Record<string, string>,
): void {
	answerCliQuestion(sessionId, requestId, answers)
}
