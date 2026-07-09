import { removeSessionAtom, setSessionBranchAtom, setSessionSetupPhaseAtom, setSessionWorktreeAtom, upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import type { AgentSandbox } from "../../preload/api"
import type { RuntimePromptOptions } from "../lib/runtime-session-config"
import { DEFAULT_SESSION_RUNTIME_ID, type SessionRuntimeId } from "../lib/session-runtimes"
import type { FileAttachment } from "../lib/types"
import { createUuidV7 } from "../../shared/uuid"
import { sendRuntimePrompt } from "./runtime-session-prompt"
import { restoreCliRuntimeSessions } from "./runtime-cli-store"
import {
	runtimeSessionGateway,
	type RuntimeSessionCreateRequest,
	type RuntimeSessionCreateResult,
} from "./runtime-session-gateway"
import { createWorktree, randomWorktreeName } from "./worktree-service"

export function restoreRuntimeSessions(): void {
	restoreCliRuntimeSessions()
}

export async function createRuntimeSession(
	args: RuntimeSessionCreateRequest,
): Promise<RuntimeSessionCreateResult | null> {
	return runtimeSessionGateway.createSession(args)
}

export async function createDefaultRuntimeSession(
	directory: string,
	title?: string,
): Promise<RuntimeSessionCreateResult | null> {
	return createRuntimeSession({
		directory,
		title,
		runtimeId: DEFAULT_SESSION_RUNTIME_ID,
	})
}

export async function launchRuntimeSession(args: {
	currentBranch?: string
	directory: string
	files?: FileAttachment[]
	onFailure: (message: string) => void
	onNavigate: (sessionId: string) => void
	promptText: string
	runtimeId: SessionRuntimeId
	launch: {
		create: {
			sandbox: AgentSandbox
			model?: string
			effort?: string
		}
		promptOptions?: RuntimePromptOptions
		worktreeMode?: "local" | "worktree"
	}
}): Promise<void> {
	if (args.launch.worktreeMode === "worktree") {
		const sessionSlug = randomWorktreeName()
		const stubId = createUuidV7()
		const now = Date.now()
		appStore.set(upsertSessionAtom, {
			session: {
				id: stubId,
				slug: sessionSlug,
				projectID: "",
				directory: args.directory,
				title: "Setting up worktree...",
				version: "",
				time: { created: now, updated: now },
			},
			directory: args.directory,
		})
		appStore.set(setSessionSetupPhaseAtom, {
			sessionId: stubId,
			setupPhase: "creating-worktree",
		})
		args.onNavigate(stubId)

		void (async () => {
			try {
				const result = await createWorktree(args.directory, args.directory, sessionSlug)
				const sdkDirectory = result.worktreeWorkspace
				appStore.set(setSessionSetupPhaseAtom, {
					sessionId: stubId,
					setupPhase: "starting-session",
				})
				const session = (
					await createRuntimeSession({
						directory: sdkDirectory,
						runtimeId: args.runtimeId,
						...args.launch.create,
					})
				)?.session
				if (!session) {
					throw new Error("Failed to create session in worktree")
				}

				appStore.set(upsertSessionAtom, {
					session,
					directory: args.directory,
				})
				appStore.set(setSessionWorktreeAtom, {
					sessionId: session.id,
					worktreePath: result.worktreeRoot,
					worktreeBranch: result.branchName,
				})
				appStore.set(setSessionBranchAtom, {
					sessionId: session.id,
					branch: result.branchName,
				})
				args.onNavigate(session.id)
				appStore.set(removeSessionAtom, stubId)

				await sendRuntimePrompt(sdkDirectory, session.id, args.promptText, {
					...(args.launch.promptOptions ?? {}),
					files: args.files,
				})
			} catch (err) {
				appStore.set(removeSessionAtom, stubId)
				args.onFailure(
					`Worktree setup failed: ${err instanceof Error ? err.message : "Unknown error"}`,
				)
			}
		})()
		return
	}

	const result = await createRuntimeSession({
		directory: args.directory,
		runtimeId: args.runtimeId,
		...args.launch.create,
	})
	if (!result) return
	const sessionId = result.session?.id ?? result.sessionId
	if (!sessionId) return
	if (args.currentBranch && result.session) {
		appStore.set(setSessionBranchAtom, {
			sessionId: result.session.id,
			branch: args.currentBranch,
		})
	}
	await sendRuntimePrompt(args.directory, sessionId, args.promptText, {
		...(args.launch.promptOptions ?? {}),
		files: args.files,
	})
	args.onNavigate(sessionId)
}

export async function switchRuntimeSession(
	sessionId: string,
	targetRuntime: SessionRuntimeId,
	fallbackDirectory?: string,
): Promise<string | null> {
	return runtimeSessionGateway.switchRuntimeSession(sessionId, targetRuntime, fallbackDirectory)
}
