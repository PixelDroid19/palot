import {
	PromptInput,
	PromptInputFooter,
	PromptInputProvider,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputController,
} from "@palot/ui/components/ai-elements/prompt-input"
import { type MentionOption, MentionPopover, type MentionPopoverHandle } from "./chat/mention-popover"
import {
	createAgentMention,
	createFileMention,
	insertMentionIntoText,
} from "./chat/prompt-mentions"
import { Popover, PopoverContent, PopoverTrigger } from "@palot/ui/components/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@palot/ui/components/tooltip"
import { useNavigate, useParams } from "@tanstack/react-router"
import {
	BookMarkedIcon,
	ChevronDownIcon,
	CodeIcon,
	FileTextIcon,
	GitForkIcon,
	GitPullRequestIcon,
	MonitorIcon,
} from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useAgents, useProjectList } from "../hooks/use-agents"
import { NEW_CHAT_DRAFT_KEY, useDraftActions, useDraftSnapshot } from "../hooks/use-draft"
import type { ModelRef } from "../hooks/use-runtime-data"
import {
	getModelInputCapabilities,
	getModelVariants,
	resolveEffectiveModel,
	useRuntimeSessionData,
} from "../hooks/use-runtime-data"
import type { AgentSandbox, SessionRuntimeDescriptor } from "../../preload/api"
import type { FileAttachment } from "../lib/types"
import { useTranslation } from "../i18n/use-translation"
import {
	persistRuntimeSelection,
	runtimeIdCapabilities,
	useRuntimePreference,
} from "../lib/runtime-session-config"
import {
	resolveDefaultSessionRuntimeId,
	installedProcessRuntimeDescriptors,
	installedSessionRuntimeOptions,
	loadRuntimeDescriptors,
	runtimeTransportForId,
	type SessionRuntimeId,
} from "../lib/session-runtimes"
import {
	availableRuntimeModels,
	getRuntimeModelEfforts,
	resolveRuntimeEffort,
	resolveRuntimeModel,
} from "../lib/runtime-model-selection"
import { launchRuntimeSession } from "../services/runtime-session-launch"
import { useSetAppBarContent } from "./app-bar-context"
import { BranchPicker } from "./branch-picker"
import { RuntimeOptionSelect } from "./chat/runtime-option-select"
import { PromptAttachmentPreview } from "./chat/prompt-attachments"
import { StatusBar } from "./chat/prompt-toolbar"
import {
	buildProcessNewChatRuntimeConfig,
	buildConfigurableRuntimeNewChatRuntimeConfig,
	type NewChatRuntimeConfig,
} from "./chat/runtime-config-state"
import { RuntimeConfigToolbar } from "./chat/runtime-config-toolbar"
import { PalotWordmark } from "./palot-wordmark"

// ============================================================
// Worktree mode toggle
// ============================================================

function WorktreeToggle({
	mode,
	onModeChange,
}: {
	mode: "local" | "worktree"
	onModeChange: (mode: "local" | "worktree") => void
}) {
	return (
		<div className="flex items-center rounded-md border border-border/40">
			<Tooltip>
				<TooltipTrigger
					render={
						<button
							type="button"
							onClick={() => onModeChange("local")}
							className={`flex items-center gap-1 rounded-l-md px-1.5 py-0.5 text-[11px] transition-colors ${
								mode === "local"
									? "bg-muted/80 text-foreground"
									: "text-muted-foreground/60 hover:text-muted-foreground"
							}`}
						/>
					}
				>
					<MonitorIcon className="size-3" />
					<span>Local</span>
				</TooltipTrigger>
				<TooltipContent side="top">Run in your current working directory</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger
					render={
						<button
							type="button"
							onClick={() => onModeChange("worktree")}
							className={`flex items-center gap-1 rounded-r-md px-1.5 py-0.5 text-[11px] transition-colors ${
								mode === "worktree"
									? "bg-muted/80 text-foreground"
									: "text-muted-foreground/60 hover:text-muted-foreground"
							}`}
						/>
					}
				>
					<GitForkIcon className="size-3" />
					<span>Worktree</span>
				</TooltipTrigger>
				<TooltipContent side="top">
					Run in an isolated git worktree (your working copy stays untouched)
				</TooltipContent>
			</Tooltip>
		</div>
	)
}

// ============================================================
// Mention support helpers (mirrors the shared chat composer pattern)
// ============================================================

/**
 * Exposes the PromptInputProvider's text controller to outside components
 * via a ref — needed to insert mention text without going through React state.
 */
function MentionBridge({
	controllerRef,
}: {
	controllerRef: React.RefObject<{ setText: (text: string) => void; getText: () => string } | null>
}) {
	const controller = usePromptInputController()
	useEffect(() => {
		if (controllerRef && "current" in controllerRef) {
			;(controllerRef as React.MutableRefObject<typeof controllerRef.current>).current = {
				setText: (text: string) => controller.textInput.setInput(text),
				getText: () => controller.textInput.value,
			}
		}
		return () => {
			if (controllerRef && "current" in controllerRef) {
				;(controllerRef as React.MutableRefObject<typeof controllerRef.current>).current = null
			}
		}
	}, [controller, controllerRef])
	return null
}

/**
 * Detects `@` trigger patterns in the prompt textarea and notifies the parent
 * so the MentionPopover can open/close and filter results.
 */
function MentionTrigger({
	onMentionChange,
}: {
	onMentionChange: (open: boolean, query: string) => void
}) {
	const controller = usePromptInputController()
	const inputText = controller.textInput.value
	useEffect(() => {
		const textarea = document.querySelector<HTMLTextAreaElement>("textarea[data-prompt-input]")
		const cursorPos = textarea?.selectionStart ?? inputText.length
		const textBeforeCursor = inputText.slice(0, cursorPos)
		const atMatch = textBeforeCursor.match(/@(\S*)$/)
		if (atMatch) {
			onMentionChange(true, atMatch[1])
			return
		}
		onMentionChange(false, "")
	}, [inputText, onMentionChange])
	return null
}

const SUGGESTIONS = [
	{
		icon: CodeIcon,
		text: "Build a new feature based on the existing patterns in this repo.",
	},
	{
		icon: FileTextIcon,
		text: "Summarize the architecture and key design decisions.",
	},
	{
		icon: GitPullRequestIcon,
		text: "Review recent changes and suggest improvements.",
	},
	{
		icon: BookMarkedIcon,
		text: "Generate a knowledge base: explore the whole codebase and write or update AGENTS.md with the architecture, key modules, conventions, build/test commands, and gotchas a new contributor needs.",
	},
]

/**
 * Syncs PromptInputProvider text to persisted drafts (debounced).
 * Must be rendered inside a <PromptInputProvider>.
 */
function DraftSync({ setDraft }: { setDraft: (text: string) => void }) {
	const controller = usePromptInputController()
	const value = controller.textInput.value
	const isFirstRender = useRef(true)

	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false
			return
		}
		setDraft(value)
	}, [value, setDraft])

	return null
}

/** Per-runtime CLI defaults (model/effort/sandbox), remembered across sessions. */
interface CliRuntimePrefs {
	model: string
	effort: string
	sandbox: AgentSandbox
}

const CLI_PREFS_KEY = "palot:cliRuntimePrefs"

function loadCliPrefs(runtimeId: string): CliRuntimePrefs | null {
	try {
		const all = JSON.parse(localStorage.getItem(CLI_PREFS_KEY) || "{}")
		return all[runtimeId] ?? null
	} catch {
		return null
	}
}

function saveCliPrefs(runtimeId: string, prefs: CliRuntimePrefs): void {
	try {
		const all = JSON.parse(localStorage.getItem(CLI_PREFS_KEY) || "{}")
		all[runtimeId] = prefs
		localStorage.setItem(CLI_PREFS_KEY, JSON.stringify(all))
	} catch {
		// Non-fatal: preferences are a convenience, not required state.
	}
}

export function NewChat() {
	const { projectSlug } = useParams({ strict: false })
	const projects = useProjectList()
	const navigate = useNavigate()

	// Inject app name into the AppBar
	const setAppBarContent = useSetAppBarContent()
	useLayoutEffect(() => {
		setAppBarContent(
			<PalotWordmark className="h-[11px] w-auto shrink-0 text-muted-foreground/70" />,
		)
		return () => setAppBarContent(null)
	}, [setAppBarContent])

	const [selectedDirectory, setSelectedDirectory] = useState<string>("")
	const [launching, setLaunching] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [worktreeMode, setWorktreeMode] = useState<"local" | "worktree">("local")

	const { t } = useTranslation()

	// Session runtime is a first-class user choice, remembered across launches.
	const [sessionRuntime, setSessionRuntimeState] = useState<SessionRuntimeId>(
		() =>
			(localStorage.getItem("palot:lastSessionRuntime") as SessionRuntimeId) ||
			resolveDefaultSessionRuntimeId(),
	)
	const runtimeCapabilities = useMemo(() => runtimeIdCapabilities(sessionRuntime), [sessionRuntime])
	const setSessionRuntime = (id: SessionRuntimeId) => {
		setSessionRuntimeState(id)
		localStorage.setItem("palot:lastSessionRuntime", id)
	}
	const initialPrefs = loadCliPrefs(sessionRuntime)
	const [cliModel, setCliModel] = useState<string>(initialPrefs?.model ?? "")
	const [cliEffort, setCliEffort] = useState<string>(initialPrefs?.effort ?? "")
	const [cliSandbox, setCliSandbox] = useState<AgentSandbox>(initialPrefs?.sandbox ?? "read-only")
	// Persist process-adapter defaults per runtime so the picker restores them next time.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed by runtime
	useEffect(() => {
		if (runtimeTransportForId(sessionRuntime) === "agent-host") {
			saveCliPrefs(sessionRuntime, { model: cliModel, effort: cliEffort, sandbox: cliSandbox })
		}
	}, [cliModel, cliEffort, cliSandbox, sessionRuntime])
	// Runtime descriptors from the host: install state, capabilities, model catalogs.
	const [installedRuntimes, setInstalledRuntimes] = useState<SessionRuntimeDescriptor[]>([])
	// Auth state per process runtime so the picker can flag unauthenticated installs.
	const [runtimeAuth, setRuntimeAuth] = useState<Record<string, string>>({})
	useEffect(() => {
		loadRuntimeDescriptors().then((all) => {
			const installed = all.filter((d) => d.installed)
			setInstalledRuntimes(installed)
			const processInstalled = installedProcessRuntimeDescriptors(all)
			// The remembered process runtime may have been uninstalled since last use.
			setSessionRuntimeState((current) =>
				runtimeTransportForId(current) === "agent-host" &&
				!processInstalled.some((d) => d.id === current)
					? resolveDefaultSessionRuntimeId(all)
					: current,
			)
		})
		if ("palot" in window) {
			window.palot.agentClis
				.detect()
				.then((detections) => {
					const auth: Record<string, string> = {}
					for (const d of detections) auth[d.id] = d.auth
					setRuntimeAuth(auth)
				})
				.catch(() => {})
		}
	}, [])
	/** Active process-adapter descriptor when transport is agent-host. */
	const activeProcessRuntime =
		runtimeTransportForId(sessionRuntime) === "agent-host"
			? installedRuntimes.find((d) => d.id === sessionRuntime)
			: undefined
	const processModels = useMemo(
		() => availableRuntimeModels(activeProcessRuntime),
		[activeProcessRuntime],
	)
	const resolvedProcessModel = useMemo(
		() => resolveRuntimeModel(activeProcessRuntime, cliModel),
		[activeProcessRuntime, cliModel],
	)
	const processEfforts = useMemo(
		() => getRuntimeModelEfforts(activeProcessRuntime, resolvedProcessModel),
		[activeProcessRuntime, resolvedProcessModel],
	)
	const resolvedProcessEffort = useMemo(
		() => resolveRuntimeEffort(activeProcessRuntime, resolvedProcessModel, cliEffort),
		[activeProcessRuntime, resolvedProcessModel, cliEffort],
	)
	useEffect(() => {
		if (!activeProcessRuntime) return
		const nextModel = resolveRuntimeModel(activeProcessRuntime, cliModel) ?? ""
		if (nextModel !== cliModel) {
			setCliModel(nextModel)
		}
		const nextEffort = resolveRuntimeEffort(activeProcessRuntime, nextModel, cliEffort) ?? ""
		if (nextEffort !== cliEffort) {
			setCliEffort(nextEffort)
		}
	}, [activeProcessRuntime, cliEffort, cliModel])


	// Draft persistence — survives page reloads.
	// Non-reactive snapshot: the draft is only used for PromptInputProvider's
	// initialInput (consumed once on mount), so reactive tracking is unnecessary.
	const draft = useDraftSnapshot(NEW_CHAT_DRAFT_KEY)
	const { setDraft, clearDraft } = useDraftActions(NEW_CHAT_DRAFT_KEY)
	const [projectPickerOpen, setProjectPickerOpen] = useState(false)

	// Toolbar state
	const [selectedModel, setSelectedModel] = useState<ModelRef | null>(null)
	const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
	const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined)

	// Mention popover state
	const [mentionOpen, setMentionOpen] = useState(false)
	const [mentionQuery, setMentionQuery] = useState("")
	const controllerRef = useRef<{ setText: (text: string) => void; getText: () => string } | null>(
		null,
	)
	const mentionPopoverRef = useRef<MentionPopoverHandle>(null)

	// Seed selectedModel, selectedVariant, and selectedAgent from the persisted
	// per-project preferences on first mount / project switch.
	// This puts the model at step 1 (user override) in resolveEffectiveModel, so it
	// wins over config.model and global recent list — matching the user's expectation
	// that the model they last used in this project sticks.
	const runtimePreference = useRuntimePreference(selectedDirectory)
	const prevDirectoryRef = useRef<string>("")
	useEffect(() => {
		if (!selectedDirectory || selectedDirectory === prevDirectoryRef.current) return
		prevDirectoryRef.current = selectedDirectory
		const stored = runtimePreference
		if (stored?.providerID && stored?.modelID) {
			setSelectedModel(stored)
			setSelectedVariant(stored.variant)
		} else {
			setSelectedModel(null)
			setSelectedVariant(undefined)
		}
		// Restore the per-project agent preference (null = use config default)
		setSelectedAgent(stored?.agent ?? null)
	}, [selectedDirectory, runtimePreference])

	const selectedProject = useMemo(
		() => projects.find((p) => p.directory === selectedDirectory),
		[projects, selectedDirectory],
	)

	const runtimeConfigDirectory = runtimeCapabilities.supportsRuntimeConfiguration
		? (selectedDirectory || null)
		: null
	const runtimeData = useRuntimeSessionData({
		configDirectory: runtimeConfigDirectory,
		workspaceDirectory: selectedDirectory || null,
	})
	const { data: providers } = runtimeData.providers
	const { data: config } = runtimeData.config
	const { data: vcs, reload: reloadVcs } = runtimeData.vcs
	const { agents: runtimeAgents } = runtimeData.agents
	const { recentModels, addRecent: addRecentModel } = runtimeData.modelState

	// Handle model selection — set local state + persist to model.json.
	// Reset variant when the model changes: the new model may have different
	// (or no) variants, so carrying over a stale variant would be incorrect.
	const handleModelSelect = useCallback(
		(model: ModelRef | null) => {
			setSelectedModel(model)
			setSelectedVariant(undefined)
			if (model) addRecentModel(model)
		},
		[addRecentModel],
	)

	// Count active sessions on the selected directory (for branch switch warnings)
	const allAgents = useAgents()
	const activeSessionCount = useMemo(() => {
		if (!selectedDirectory) return 0
		return allAgents.filter(
			(a) =>
				a.directory === selectedDirectory && (a.status === "running" || a.status === "waiting"),
		).length
	}, [allAgents, selectedDirectory])

	// Callback when branch is switched via the BranchPicker — forces VCS reload
	const handleBranchChanged = useCallback(
		(_branch: string) => {
			// VCS hook polls every 30s, but we want immediate UI update.
			// The SSE vcs.branch.updated event will also fire eventually.
			reloadVcs()
		},
		[reloadVcs],
	)

	// Insert a selected mention into the prompt textarea
	const handleMentionSelect = useCallback((option: MentionOption) => {
		setMentionOpen(false)
		const ctrl = controllerRef.current
		if (!ctrl) return
		const currentText = ctrl.getText()
		const textarea = document.querySelector<HTMLTextAreaElement>("textarea[data-prompt-input]")
		const cursorPos = textarea?.selectionStart ?? currentText.length
		const mention =
			option.type === "file" ? createFileMention(option.path) : createAgentMention(option.name)
		const { text: newText, cursorPosition: newCursor } = insertMentionIntoText(
			currentText,
			cursorPos,
			mention,
		)
		ctrl.setText(newText)
		requestAnimationFrame(() => {
			const ta = document.querySelector<HTMLTextAreaElement>("textarea[data-prompt-input]")
			if (ta) {
				ta.focus()
				ta.setSelectionRange(newCursor, newCursor)
			}
		})
	}, [])

	// Delegate keyboard events to the mention popover when it's open
	const handleTextareaKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (mentionPopoverRef.current?.handleKeyDown(e)) return
		},
		[],
	)

	// Resolve active agent for model resolution
	const activeRuntimeAgent = useMemo(() => {
		const agentName = selectedAgent ?? config?.defaultAgent
		return runtimeAgents?.find((a) => a.name === agentName) ?? null
	}, [selectedAgent, config?.defaultAgent, runtimeAgents])

	// Resolve effective model — selectedModel is seeded from the persisted project model
	// on mount/project switch (above), so it already wins at step 1 of the resolution chain.
	const effectiveModel = useMemo(
		() =>
			resolveEffectiveModel(
				selectedModel,
				activeRuntimeAgent,
				config?.model,
				providers?.defaults ?? {},
				providers?.providers ?? [],
				recentModels,
			),
		[selectedModel, activeRuntimeAgent, config?.model, providers, recentModels],
	)

	// Validate variant against the effective model's available variants.
	// Clears the variant if the current model doesn't support it (e.g. restored
	// from per-project preference but the model was changed, or provider updated).
	useEffect(() => {
		if (!selectedVariant || !effectiveModel || !providers) return
		const available = getModelVariants(
			effectiveModel.providerID,
			effectiveModel.modelID,
			providers.providers,
		)
		if (!available.includes(selectedVariant)) {
			setSelectedVariant(undefined)
		}
	}, [selectedVariant, effectiveModel, providers])

	// Model input capabilities (for attachment warnings)
	const modelCapabilities = useMemo(
		() => getModelInputCapabilities(effectiveModel, providers?.providers ?? []),
		[effectiveModel, providers],
	)

	const runtimeConfig = useMemo<NewChatRuntimeConfig | null>(() => {
		// Capability-driven: process adapters use catalog models/sandbox/effort;
		// managed-server adapters use agents/providers/variants.
		if (
			runtimeTransportForId(sessionRuntime) === "agent-host" &&
			activeProcessRuntime
		) {
			return buildProcessNewChatRuntimeConfig({
				runtimeId: activeProcessRuntime.id,
				models: processModels,
				modelValue: resolvedProcessModel ?? "",
				onModelChange: (value: string) => {
					setCliModel(value)
					setCliEffort("")
				},
				sandboxValue: cliSandbox,
				onSandboxChange: setCliSandbox,
				efforts: processEfforts,
				effortValue: cliEffort,
				onEffortChange: setCliEffort,
				model: resolvedProcessModel,
				effort: resolvedProcessEffort,
				sandbox: cliSandbox,
			})
		}

		if (runtimeCapabilities.supportsRuntimeConfiguration) {
			return buildConfigurableRuntimeNewChatRuntimeConfig({
				agents: runtimeAgents ?? [],
				selectedAgent,
				defaultAgent: config?.defaultAgent,
				onSelectAgent: setSelectedAgent,
				providers,
				effectiveModel,
				hasModelOverride: !!selectedModel,
				onSelectModel: handleModelSelect,
				recentModels,
				selectedVariant,
				onSelectVariant: setSelectedVariant,
				worktreeMode,
			})
		}

		return null
	}, [
		activeProcessRuntime,
		cliEffort,
		cliSandbox,
		config?.defaultAgent,
		effectiveModel,
		handleModelSelect,
		processEfforts,
		processModels,
		runtimeAgents,
		providers,
		recentModels,
		resolvedProcessEffort,
		resolvedProcessModel,
		selectedAgent,
		selectedModel,
		selectedVariant,
		sessionRuntime,
		runtimeCapabilities.supportsRuntimeConfiguration,
		worktreeMode,
	])

	useEffect(() => {
		if (projects.length === 0) return

		if (projectSlug) {
			const match = projects.find((p) => p.slug === projectSlug)
			if (match) {
				setSelectedDirectory(match.directory)
				return
			}
		}

		setSelectedDirectory(projects[0].directory)
	}, [projectSlug, projects])

	// ---
	// Launch helpers
	// ---

	/** Persist the model + variant + agent for this project so new sessions remember it. */
	const persistRuntimePreference = useCallback(() => {
		if (!effectiveModel || !selectedDirectory) return
		persistRuntimeSelection({
			kind: "configurable-runtime",
			directory: selectedDirectory,
			model: {
				...effectiveModel,
				variant: selectedVariant,
				agent: selectedAgent ?? undefined,
			},
		})
	}, [effectiveModel, selectedDirectory, selectedVariant, selectedAgent])

	/** Navigate to the chat view for a given session. */
	const navigateToSession = useCallback(
		(sessionId: string) => {
			const project = projects.find((p) => p.directory === selectedDirectory)
			navigate({
				to: "/project/$projectSlug/session/$sessionId",
				params: {
					projectSlug: project?.slug ?? "unknown",
					sessionId,
				},
			})
		},
		[projects, selectedDirectory, navigate],
	)

	const handleLaunch = useCallback(
		async (promptText: string, files?: FileAttachment[]) => {
			if (!selectedDirectory || !promptText || !runtimeConfig) return
			setLaunching(true)
			setError(null)
			try {
				clearDraft()
				if (runtimeCapabilities.supportsRuntimeConfiguration) {
					persistRuntimePreference()
				}
				await launchRuntimeSession({
					currentBranch: vcs?.branch ?? "",
					directory: selectedDirectory,
					files,
					onFailure: (message) => {
						setError(message)
						navigate({ to: "/" })
					},
					onNavigate: navigateToSession,
					promptText,
					runtimeId: runtimeConfig.runtimeId,
					launch: runtimeConfig.launch,
				})
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to create session")
			} finally {
				setLaunching(false)
			}
		},
		[
			clearDraft,
			navigate,
			navigateToSession,
			persistRuntimePreference,
			runtimeConfig,
			selectedDirectory,
			vcs,
		],
	)
	const hasToolbar = runtimeConfig !== null

	return (
		<div className="relative flex h-full flex-col">
			{/* Hero area — vertically centered */}
			<div className="flex flex-1 flex-col items-center justify-center px-0 sm:px-6">
				<div className="w-full max-w-4xl space-y-8">
					{/* Wordmark */}
					<div className="flex justify-center">
						<PalotWordmark className="h-4 w-auto text-foreground" />
					</div>

					{/* "Build what's next" + project name */}
					<div className="text-center">
						<h1 className="text-2xl font-semibold text-foreground">Build what's next</h1>
						{projects.length > 1 ? (
							<Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
								<PopoverTrigger
									render={
										<button
											type="button"
											className="mt-1 inline-flex items-center gap-1 text-xl text-muted-foreground transition-colors hover:text-foreground"
										/>
									}
								>
									{selectedProject?.name ?? "select project"}
									<ChevronDownIcon className="size-4" />
								</PopoverTrigger>
								<PopoverContent className="w-64 p-1" align="center">
									{projects.map((p) => (
										<button
											key={p.directory}
											type="button"
											onClick={() => {
												setSelectedDirectory(p.directory)
												setProjectPickerOpen(false)
											}}
											className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
												p.directory === selectedDirectory
													? "bg-muted text-foreground"
													: "text-muted-foreground"
											}`}
										>
											<span className="truncate font-medium">{p.name}</span>
											<span className="ml-auto text-xs text-muted-foreground/60">
												{p.agentCount}
											</span>
										</button>
									))}
								</PopoverContent>
							</Popover>
						) : (
							<p className="mt-1 text-xl text-muted-foreground">{selectedProject?.name ?? ""}</p>
						)}
					</div>

					{/* Suggestion cards — 3 column grid */}
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						{SUGGESTIONS.map((suggestion) => {
							const Icon = suggestion.icon
							return (
								<button
									key={suggestion.text}
									type="button"
									onClick={() => handleLaunch(suggestion.text)}
									disabled={launching || !selectedDirectory}
									className="group/card flex flex-col gap-3 rounded-xl border border-border/50 bg-background/40 backdrop-blur-sm p-4 text-left transition-colors hover:border-muted-foreground/30 hover:bg-background/60 disabled:opacity-50"
								>
									<Icon className="size-5 text-muted-foreground transition-colors group-hover/card:text-foreground" />
									<p className="text-sm leading-snug text-muted-foreground transition-colors group-hover/card:text-foreground">
										{suggestion.text}
									</p>
								</button>
							)
						})}
					</div>
				</div>
			</div>

			{/* Bottom-pinned input section */}
			<div className="shrink-0 px-0 pb-0 pt-0 sm:px-6 sm:pb-5 sm:pt-3">
				<div className="mx-auto w-full max-w-4xl">
					{/* Input card */}
					<PromptInputProvider key={NEW_CHAT_DRAFT_KEY} initialInput={draft}>
						<DraftSync setDraft={setDraft} />
						<MentionBridge controllerRef={controllerRef} />
						<MentionTrigger
							onMentionChange={(open, query) => {
								setMentionOpen(open)
								setMentionQuery(query)
							}}
						/>
						<div className="relative">
							<MentionPopover
								ref={mentionPopoverRef}
								query={mentionQuery}
								open={mentionOpen}
								directory={selectedDirectory || null}
								agents={runtimeAgents ?? []}
								onSelect={handleMentionSelect}
								onClose={() => setMentionOpen(false)}
							/>
						<PromptInput
							className="rounded-xl"
							accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
							multiple
							maxFileSize={10 * 1024 * 1024}
							onSubmit={(message) => {
								if (message.text.trim())
									handleLaunch(
										message.text.trim(),
										message.files.length > 0 ? message.files : undefined,
									)
							}}
						>
							<PromptAttachmentPreview
								supportsImages={modelCapabilities?.image}
								supportsPdf={modelCapabilities?.pdf}
							/>
							<PromptInputTextarea
								placeholder="What should this session work on?"
								autoFocus
								disabled={launching || !selectedDirectory || projects.length === 0}
								className="min-h-[80px]"
								onKeyDown={handleTextareaKeyDown}
							/>

							{/* Toolbar inside the card — driven by the active runtime config */}
							{hasToolbar && (
								<PromptInputFooter>
									<PromptInputTools>
										{runtimeConfig && <RuntimeConfigToolbar {...runtimeConfig.toolbarProps} />}
									</PromptInputTools>
								</PromptInputFooter>
							)}
						</PromptInput>
						</div>
					</PromptInputProvider>

					{/* Status bar — outside the card */}
					{runtimeConfig && (
						<StatusBar
							vcs={vcs ?? null}
							isConnected={true}
							branchSlot={
								selectedDirectory ? (
									<BranchPicker
										directory={selectedDirectory}
										currentBranch={vcs?.branch}
										onBranchChanged={handleBranchChanged}
										activeSessionCount={activeSessionCount}
									/>
								) : undefined
							}
							extraSlot={
								<div className="flex items-center gap-2">
									{installedRuntimes.length > 0 && (
										<RuntimeOptionSelect
											aria-label={t("runtimePicker.runtime")}
											value={sessionRuntime}
											onValueChange={(value) => {
												const next = value as SessionRuntimeId
												setSessionRuntime(next)
												// Restore this runtime's remembered defaults (if any).
												const prefs = loadCliPrefs(next)
												setCliModel(prefs?.model ?? "")
												setCliEffort(prefs?.effort ?? "")
												setCliSandbox(prefs?.sandbox ?? "read-only")
											}}
											options={installedSessionRuntimeOptions(installedRuntimes).map(
												(option) => ({
													value: option.value,
													label:
														runtimeTransportForId(option.value) === "agent-host" &&
														runtimeAuth[option.value] === "unauthenticated"
															? t("runtimePicker.loginRequired", { name: option.label })
															: option.label,
												}),
											)}
										/>
									)}
									{vcs &&
										runtimeCapabilities.supportsWorktreeLaunch &&
										runtimeConfig?.launch.worktreeMode && (
											<WorktreeToggle mode={worktreeMode} onModeChange={setWorktreeMode} />
										)}
								</div>
							}
						/>
					)}

					{/* Error */}
					{error && (
						<div className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">
							{error}
						</div>
					)}

					{/* No projects warning — composer still allows picking a runtime once a folder is open */}
					{projects.length === 0 && (
						<p className="mt-2 text-center text-xs text-muted-foreground">
							No workspaces visible yet. Add a project folder, or restore hidden projects from
							the sidebar — Claude, Codex, and OpenCode share the same workspace list.
						</p>
					)}
				</div>
			</div>
		</div>
	)
}
