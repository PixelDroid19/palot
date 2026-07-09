import type { RuntimePromptOptions } from "../lib/runtime-session-config"
import { runtimeSessionGateway } from "./runtime-session-gateway"

export async function sendRuntimePrompt(
	directory: string,
	sessionId: string,
	text: string,
	options?: RuntimePromptOptions,
): Promise<void> {
	await runtimeSessionGateway.promptSession(directory, sessionId, text, options)
}
