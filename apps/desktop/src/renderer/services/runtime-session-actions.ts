import type { AgentPermissionDecision } from "../../preload/api"
import type { QuestionAnswer, Session } from "../lib/types"
import {
	answerCliRuntimeQuestionRequest,
	respondCliRuntimePermissionRequest,
} from "./runtime-cli-store"
import { requireManagedRuntimeProjectClient } from "./managed-runtime-client"
import { runtimeSessionGateway } from "./runtime-session-gateway"

export async function abortRuntimeSession(directory: string, sessionId: string): Promise<void> {
	await runtimeSessionGateway.abortSession(directory, sessionId)
}

export async function renameRuntimeSession(
	directory: string,
	sessionId: string,
	title: string,
): Promise<void> {
	await runtimeSessionGateway.renameSession(directory, sessionId, title)
}

export async function deleteRuntimeSession(directory: string, sessionId: string): Promise<void> {
	await runtimeSessionGateway.deleteSession(directory, sessionId)
}

export async function respondRuntimePermission(
	directory: string,
	sessionId: string,
	permissionId: string,
	response: "once" | "always" | "reject",
): Promise<void> {
	const client = requireManagedRuntimeProjectClient(directory)
	await client.permission.respond({
		sessionID: sessionId,
		permissionID: permissionId,
		response,
	})
}

export async function replyRuntimeQuestion(
	directory: string,
	requestId: string,
	answers: QuestionAnswer[],
): Promise<void> {
	const client = requireManagedRuntimeProjectClient(directory)
	await client.question.reply({ requestID: requestId, answers })
}

export async function rejectRuntimeQuestion(
	directory: string,
	requestId: string,
): Promise<void> {
	const client = requireManagedRuntimeProjectClient(directory)
	await client.question.reject({ requestID: requestId })
}

export function respondRuntimePermissionRequest(
	sessionId: string,
	requestId: string,
	decision: AgentPermissionDecision,
): void {
	respondCliRuntimePermissionRequest(sessionId, requestId, decision)
}

export function answerRuntimeQuestionRequest(
	sessionId: string,
	requestId: string,
	answers: Record<string, string>,
): void {
	answerCliRuntimeQuestionRequest(sessionId, requestId, answers)
}

export async function revertRuntimeSession(
	directory: string,
	sessionId: string,
	messageId: string,
): Promise<void> {
	await runtimeSessionGateway.revertSession(directory, sessionId, messageId)
}

export async function unrevertRuntimeSession(
	directory: string,
	sessionId: string,
): Promise<void> {
	await runtimeSessionGateway.unrevertSession(directory, sessionId)
}

export async function executeRuntimeCommand(
	directory: string,
	sessionId: string,
	command: string,
	args: string,
): Promise<void> {
	await runtimeSessionGateway.executeCommand(directory, sessionId, command, args)
}

export async function summarizeRuntimeSession(
	directory: string,
	sessionId: string,
	model?: { providerID: string; modelID: string },
): Promise<void> {
	await runtimeSessionGateway.summarizeSession(directory, sessionId, model)
}

export async function deleteRuntimePart(
	directory: string,
	sessionId: string,
	messageId: string,
	partId: string,
): Promise<void> {
	await runtimeSessionGateway.deletePart(directory, sessionId, messageId, partId)
}

export async function forkRuntimeSession(
	directory: string,
	sessionId: string,
	messageId?: string,
): Promise<Session> {
	return runtimeSessionGateway.forkSession(directory, sessionId, messageId)
}
