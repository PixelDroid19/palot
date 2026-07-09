/**
 * Framework-free chat turn runner for Lit surfaces.
 * Uses `window.gcode.agentSession` (same IPC as React cli-chat path).
 */
import { sessionStore } from "./session-store"

export interface TurnHandlers {
	onAssistantDelta?: (text: string) => void
	onAssistantFinal?: (text: string) => void
	onPermission?: (request: {
		requestId: string
		toolName?: string
		description?: string
	}) => void
	onError?: (message: string) => void
	onStatus?: (status: "running" | "idle" | "failed") => void
}

function getBridge() {
	return (window as unknown as {
		gcode?: {
			agentSession?: {
				open: (
					sessionId: string,
					runtimeId: string,
					opts: {
						cwd: string
						sandbox?: string
						model?: string
						reasoningEffort?: string
					},
				) => Promise<{ threadId: string | null }>
				prompt: (
					sessionId: string,
					opts: { text: string; model?: string; sandbox?: string },
				) => Promise<{ message?: string; status?: string; error?: string }>
				onUpdate: (
					cb: (sessionId: string, update: Record<string, unknown>) => void,
				) => () => void
				respondPermission: (
					sessionId: string,
					requestId: string,
					decision: string,
				) => Promise<boolean>
			}
		}
	}).gcode?.agentSession
}

/**
 * Open (or resume) a process-runtime session and run one prompt turn.
 * Returns assistant text when complete.
 */
export async function runLitAgentTurn(
	sessionId: string,
	text: string,
	handlers: TurnHandlers = {},
): Promise<string> {
	const agent = getBridge()
	const meta = sessionStore.getMeta(sessionId)
	const runtimeId = meta?.runtimeId
	const cwd = meta?.cwd || sessionStore.list().find((s) => s.id === sessionId)?.directory || ""

	if (!agent) {
		const offline = `(offline) ${text}`
		handlers.onAssistantFinal?.(offline)
		return offline
	}
	if (!runtimeId || runtimeId === "local" || runtimeId === "unknown" || runtimeId === "opencode") {
		// managed-server / unknown: Lit shell cannot drive OpenCode SDK without React gateway yet
		const msg =
			runtimeId === "opencode"
				? "Open this session in the full workspace for OpenCode managed-server turns."
				: "Pick a Claude or Codex session (or create one) for live agent turns."
		handlers.onError?.(msg)
		throw new Error(msg)
	}

	handlers.onStatus?.("running")
	let assistant = ""
	const unsub = agent.onUpdate((sid, update) => {
		if (sid !== sessionId) return
		const kind = String(update.kind || update.type || "")
		if (kind === "text-delta" || kind === "message-delta") {
			const chunk = String(update.text || update.delta || "")
			if (chunk) {
				assistant += chunk
				handlers.onAssistantDelta?.(assistant)
			}
		}
		if (kind === "permission" && update.requestId) {
			handlers.onPermission?.({
				requestId: String(update.requestId),
				toolName: update.toolName ? String(update.toolName) : undefined,
				description: update.description ? String(update.description) : undefined,
			})
			// Auto-allow for unattended polish smoke; UI can override later
			void agent.respondPermission(sessionId, String(update.requestId), "allow-session")
		}
	})

	try {
		await agent.open(sessionId, runtimeId, {
			cwd,
			sandbox: meta?.sandbox || "workspace-write",
			model: meta?.model,
			reasoningEffort: meta?.effort,
		})
		const result = await agent.prompt(sessionId, {
			text,
			model: meta?.model,
			sandbox: meta?.sandbox || "workspace-write",
		})
		const finalText =
			(result?.message && String(result.message)) ||
			assistant ||
			(result?.error ? `Error: ${result.error}` : "")
		handlers.onAssistantFinal?.(finalText)
		handlers.onStatus?.("idle")
		return finalText
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		handlers.onError?.(message)
		handlers.onStatus?.("failed")
		throw err
	} finally {
		unsub()
	}
}
