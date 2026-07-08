import type { AgentPermissionDecision } from "../../preload/api"
import { sessionFamily, upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import { readSessionRuntimeState } from "../lib/runtime-session-config"
import type { QuestionAnswer, Session } from "../lib/types"
import {
	answerCliRuntimeQuestionRequest,
	respondCliRuntimePermissionRequest,
} from "./runtime-cli-store"
import { getProjectClient } from "./connection-manager"
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

export async function respondOpenCodePermission(
	directory: string,
	sessionId: string,
	permissionId: string,
	response: "once" | "always" | "reject",
): Promise<void> {
	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	await client.permission.respond({
		sessionID: sessionId,
		permissionID: permissionId,
		response,
	})
}

export async function replyOpenCodeQuestion(
	directory: string,
	requestId: string,
	answers: QuestionAnswer[],
): Promise<void> {
	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	await client.question.reply({ requestID: requestId, answers })
}

export async function rejectOpenCodeQuestion(
	directory: string,
	requestId: string,
): Promise<void> {
	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	await client.question.reject({ requestID: requestId })
}

export function respondCliRuntimePermission(
	sessionId: string,
	requestId: string,
	decision: AgentPermissionDecision,
): void {
	respondCliRuntimePermissionRequest(sessionId, requestId, decision)
}

export function answerCliRuntimeQuestion(
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
	if (readSessionRuntimeState(sessionId).runtime === "cli") {
		throw new Error("Revert is not supported for CLI sessions")
	}

	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	const entry = appStore.get(sessionFamily(sessionId))
	if (entry?.status?.type === "busy") {
		await client.session.abort({ sessionID: sessionId })
	}
	await client.session.revert({ sessionID: sessionId, messageID: messageId })
}

export async function unrevertRuntimeSession(
	directory: string,
	sessionId: string,
): Promise<void> {
	if (readSessionRuntimeState(sessionId).runtime === "cli") {
		throw new Error("Undo is not supported for CLI sessions")
	}

	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	await client.session.unrevert({ sessionID: sessionId })
}

export async function executeRuntimeCommand(
	directory: string,
	sessionId: string,
	command: string,
	args: string,
): Promise<void> {
	if (readSessionRuntimeState(sessionId).runtime === "cli") {
		throw new Error("Slash commands are not supported for CLI sessions")
	}

	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	await client.session.command({
		sessionID: sessionId,
		command,
		arguments: args,
	})
}

export async function summarizeRuntimeSession(
	directory: string,
	sessionId: string,
	model?: { providerID: string; modelID: string },
): Promise<void> {
	if (readSessionRuntimeState(sessionId).runtime === "cli") {
		throw new Error("Summarize is not supported for CLI sessions")
	}

	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	await client.session.summarize({
		sessionID: sessionId,
		providerID: model?.providerID,
		modelID: model?.modelID,
	})
}

export async function deleteRuntimePart(
	directory: string,
	sessionId: string,
	messageId: string,
	partId: string,
): Promise<void> {
	if (readSessionRuntimeState(sessionId).runtime === "cli") {
		throw new Error("Deleting parts is not supported for CLI sessions")
	}

	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	await client.part.delete({ sessionID: sessionId, messageID: messageId, partID: partId })
}

export async function forkRuntimeSession(
	directory: string,
	sessionId: string,
	messageId?: string,
): Promise<Session> {
	if (readSessionRuntimeState(sessionId).runtime === "cli") {
		throw new Error("Fork is not supported for CLI sessions")
	}

	const client = getProjectClient(directory)
	if (!client) throw new Error("Not connected to OpenCode server")
	const result = await client.session.fork({
		sessionID: sessionId,
		messageID: messageId,
	})
	const session = result.data as Session
	if (session) {
		appStore.set(upsertSessionAtom, { session, directory })
	}
	return session
}
