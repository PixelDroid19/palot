import type { FileAttachment } from "../lib/types"
import {
	cancelCliTurn,
	consumeProjectRuntimeHandoff,
	runCliTurn,
} from "./cli-chat"

export async function runCliRuntimeTurn(
	sessionId: string,
	text: string,
	files?: FileAttachment[],
): Promise<void> {
	await runCliTurn(sessionId, text, files)
}

export function interruptCliRuntimeTurn(sessionId: string): void {
	cancelCliTurn(sessionId)
}

export function consumeCliToProjectRuntimeHandoff(sessionId: string): string | null {
	return consumeProjectRuntimeHandoff(sessionId)
}

export const consumeCliToManagedRuntimeHandoff = consumeCliToProjectRuntimeHandoff
