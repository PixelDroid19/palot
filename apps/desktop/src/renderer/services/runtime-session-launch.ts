import { removeSessionAtom, setSessionBranchAtom, setSessionSetupPhaseAtom, setSessionWorktreeAtom, upsertSessionAtom } from "../atoms/sessions"
import { appStore } from "../atoms/store"
import type { AgentSandbox } from "../../preload/api"
import type { ProjectRuntimePromptOptions } from "../lib/runtime-session-config"
import type { SessionRuntimeId } from "../lib/session-runtimes"
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

export async function launchRuntimeSession(args: {
	currentBranch?: string
	directory: string
	files?: FileAttachment[]
	onFailure: (message: string) => void
	onNavigate: (sessionId: string) => void
	promptText: string
	runtimeId: SessionRuntimeId
	launch: {
		cli?: {
			sandbox: AgentSandbox
			model?: string
			effort?: string
		}
		project?: {
			worktreeMode: "local" | "worktree"
			promptOptions: ProjectRuntimePromptOptions
		}
	}
}): Promise<void> {
	if (args.launch.cli) {
		const result = await createRuntimeSession({
			kind: "cli",
			directory: args.directory,
			runtimeId: args.runtimeId,
			sandbox: args.launch.cli.sandbox,
			model: args.launch.cli.model,
			effort: args.launch.cli.effort,
		})
		const sessionId = result?.sessionId
		if (!sessionId) return
		await sendRuntimePrompt(args.directory, sessionId, args.promptText, {
			runtime: "cli",
			files: args.files,
		})
		args.onNavigate(sessionId)
		return
	}

	await launchProjectRuntimeSession({
		currentBranch: args.currentBranch,
		directory: args.directory,
		files: args.files,
		mode: args.launch.project?.worktreeMode ?? "local",
		onFailure: args.onFailure,
		onNavigate: args.onNavigate,
		promptOptions: args.launch.project?.promptOptions,
		promptText: args.promptText,
	})
}

export async function launchProjectRuntimeSession(args: {
	currentBranch?: string
	directory: string
	files?: FileAttachment[]
	mode: "local" | "worktree"
	onFailure: (message: string) => void
	onNavigate: (sessionId: string) => void
	promptOptions?: ProjectRuntimePromptOptions
	promptText: string
}): Promise<void> {
	if (args.mode === "worktree") {
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
				const session = (await createRuntimeSession({ directory: sdkDirectory }))?.session
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
					...(args.promptOptions ?? {}),
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

	const session = (await createRuntimeSession({ directory: args.directory }))?.session
	if (!session) return
	if (args.currentBranch) {
		appStore.set(setSessionBranchAtom, { sessionId: session.id, branch: args.currentBranch })
	}
	await sendRuntimePrompt(args.directory, session.id, args.promptText, {
		...(args.promptOptions ?? {}),
		files: args.files,
	})
	args.onNavigate(session.id)
}

export const launchManagedRuntimeSession = launchProjectRuntimeSession

export async function switchRuntimeSession(
	sessionId: string,
	targetRuntime: SessionRuntimeId,
	fallbackDirectory?: string,
): Promise<string | null> {
	return runtimeSessionGateway.switchRuntimeSession(sessionId, targetRuntime, fallbackDirectory)
}
