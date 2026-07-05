import { Button } from "@palot/ui/components/button"
import { NativeSelect, NativeSelectOption } from "@palot/ui/components/native-select"
import { Textarea } from "@palot/ui/components/textarea"
import { useSearch } from "@tanstack/react-router"
import { useAtom } from "jotai"
import { Loader2Icon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AgentRuntimeId, AgentSandbox, AgentUpdate } from "../../../preload/api"
import {
	type CliConversation,
	cliConversationsAtom,
	type CliTurn,
	deriveTitle,
} from "../../atoms/cli-conversations"
import { useTranslation } from "../../i18n/use-translation"

const isElectron = typeof window !== "undefined" && "palot" in window

const RUNTIMES: { id: AgentRuntimeId; label: string }[] = [
	{ id: "codex", label: "Codex" },
	{ id: "claude", label: "Claude Code" },
]

const now = () => (typeof Date !== "undefined" ? Date.now() : 0)

/**
 * Multi-turn, persistent conversations with coding-agent CLIs (Codex, Claude
 * Code, …). Conversations survive reloads and resume the CLI's own session so
 * context carries across turns. Palot is not tied to OpenCode for this.
 */
export function SubagentsPage() {
	const { t } = useTranslation()
	const search = useSearch({ strict: false }) as {
		runtime?: string
		prompt?: string
		cwd?: string
	}
	const [conversations, setConversations] = useAtom(cliConversationsAtom)
	const [installedIds, setInstalledIds] = useState<AgentRuntimeId[] | null>(null)
	const [activeId, setActiveId] = useState<string | null>(null)
	// Config for a not-yet-created conversation.
	const [draftRuntime, setDraftRuntime] = useState<AgentRuntimeId>("codex")
	const [draftSandbox, setDraftSandbox] = useState<AgentSandbox>("read-only")
	const [draftCwd, setDraftCwd] = useState(() => search.cwd ?? "")
	const [input, setInput] = useState("")
	const [running, setRunning] = useState(false)
	const [streamed, setStreamed] = useState("")
	const runIdRef = useRef<string | null>(null)
	const activeIdRef = useRef<string | null>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const autoSentRef = useRef(false)

	const active = useMemo(
		() => conversations.find((c) => c.id === activeId) ?? null,
		[conversations, activeId],
	)
	// Displayed session settings come from the active conversation (locked) or the draft.
	const runtimeId = active?.runtimeId ?? draftRuntime
	const sandbox = active?.sandbox ?? draftSandbox
	const cwd = active?.cwd ?? draftCwd
	const turns = active?.turns ?? []
	const started = turns.length > 0 || running

	useEffect(() => {
		activeIdRef.current = activeId
	}, [activeId])

	useEffect(() => {
		if (!isElectron) return
		window.palot.agentClis.detect().then((clis) => {
			const ids = RUNTIMES.map((r) => r.id).filter((id) =>
				clis.some((c) => c.id === id && c.installed),
			)
			setInstalledIds(ids)
			if (ids.length > 0) setDraftRuntime((prev) => (ids.includes(prev) ? prev : ids[0]))
		})
	}, [])

	useEffect(() => {
		if (!isElectron) return
		return window.palot.agentSubagent.onUpdate((runId, update: AgentUpdate) => {
			if (runId !== runIdRef.current) return
			if (update.kind === "message" && update.text) {
				setStreamed((prev) => (prev ? `${prev}\n${update.text}` : update.text))
			}
		})
	}, [])

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on transcript growth
	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
	}, [turns.length, streamed])

	const availableRuntimes = useMemo(
		() => RUNTIMES.filter((r) => installedIds?.includes(r.id)),
		[installedIds],
	)
	const runtimeLabel = RUNTIMES.find((r) => r.id === runtimeId)?.label ?? "agent"

	const patchConversation = useCallback(
		(id: string, updater: (c: CliConversation) => CliConversation) => {
			setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)))
		},
		[setConversations],
	)

	const send = useCallback(
		async (explicit?: string, runtimeOverride?: AgentRuntimeId) => {
			const prompt = (explicit ?? input).trim()
			if (!isElectron || !prompt || running) return

			// Resolve (or create) the conversation this turn belongs to.
			let convId = activeIdRef.current
			let resumeId: string | null = null
			let runtime = runtimeOverride ?? runtimeId
			if (convId) {
				const conv = conversations.find((c) => c.id === convId)
				resumeId = conv?.threadId ?? null
				runtime = conv?.runtimeId ?? runtime
			} else {
				convId = crypto.randomUUID()
				const conv: CliConversation = {
					id: convId,
					runtimeId: runtime,
					cwd: (draftCwd.trim() || "."),
					sandbox: draftSandbox,
					threadId: null,
					turns: [],
					title: deriveTitle(prompt),
					updatedAt: now(),
				}
				setConversations((prev) => [conv, ...prev])
				setActiveId(convId)
				activeIdRef.current = convId
			}
			const cwdForRun = conversations.find((c) => c.id === convId)?.cwd ?? draftCwd.trim() ?? "."

			const runId = crypto.randomUUID()
			runIdRef.current = runId
			setInput("")
			setStreamed("")
			patchConversation(convId, (c) => ({
				...c,
				turns: [...c.turns, { role: "user", text: prompt }],
				updatedAt: now(),
			}))
			setRunning(true)
			try {
				const result = await window.palot.agentSubagent.run(runId, runtime, {
					prompt,
					cwd: cwdForRun || ".",
					sandbox: draftSandbox,
					resumeId: resumeId ?? undefined,
				})
				const agentTurn: CliTurn = {
					role: "agent",
					text: result.message || "(no output)",
					notices: result.notices,
					usage: result.usage
						? t("subagent.usage", {
								input: result.usage.inputTokens,
								output: result.usage.outputTokens,
							})
						: undefined,
				}
				patchConversation(convId, (c) => ({
					...c,
					threadId: result.threadId ?? c.threadId,
					turns: [...c.turns, agentTurn],
					updatedAt: now(),
				}))
			} catch (err) {
				patchConversation(convId, (c) => ({
					...c,
					turns: [
						...c.turns,
						{ role: "agent", text: err instanceof Error ? err.message : String(err), error: true },
					],
					updatedAt: now(),
				}))
			} finally {
				setRunning(false)
				setStreamed("")
				runIdRef.current = null
			}
		},
		[
			input,
			running,
			runtimeId,
			draftCwd,
			draftSandbox,
			conversations,
			patchConversation,
			setConversations,
			t,
		],
	)

	const stop = useCallback(() => {
		if (runIdRef.current) window.palot.agentSubagent.cancel(runIdRef.current)
	}, [])

	const newConversation = useCallback(() => {
		setActiveId(null)
		activeIdRef.current = null
		setInput("")
		setStreamed("")
	}, [])

	const deleteConversation = useCallback(
		(id: string) => {
			setConversations((prev) => prev.filter((c) => c.id !== id))
			if (activeIdRef.current === id) newConversation()
		},
		[setConversations, newConversation],
	)

	// Entry from New Session: preselect runtime and send the initial prompt once.
	// biome-ignore lint/correctness/useExhaustiveDependencies: run once when detection + params are ready
	useEffect(() => {
		if (installedIds === null || autoSentRef.current) return
		if (!search.prompt) return
		const requested = search.runtime as AgentRuntimeId | undefined
		const target = requested && installedIds.includes(requested) ? requested : undefined
		if (target) setDraftRuntime(target)
		if (search.cwd) setDraftCwd(search.cwd)
		if (installedIds.length > 0) {
			autoSentRef.current = true
			setActiveId(null)
			activeIdRef.current = null
			send(search.prompt, target)
		}
	}, [installedIds, search.runtime, search.prompt, search.cwd])

	if (installedIds !== null && availableRuntimes.length === 0) {
		return (
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
				<h1 className="text-2xl font-semibold">{t("subagentChat.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("subagentChat.noneInstalled")}</p>
			</div>
		)
	}

	return (
		<div className="mx-auto flex h-full w-full max-w-5xl gap-4 p-6">
			{/* Conversation list */}
			<aside className="hidden w-56 shrink-0 flex-col gap-2 sm:flex">
				<Button variant="outline" size="sm" onClick={newConversation} className="justify-start">
					<PlusIcon aria-hidden="true" className="size-4" />
					{t("subagentChat.newConversation")}
				</Button>
				<div className="flex-1 space-y-1 overflow-y-auto">
					{conversations.map((c) => (
						<div
							key={c.id}
							className={`group flex items-center gap-1 rounded-md px-2 py-1.5 ${
								c.id === activeId ? "bg-muted" : "hover:bg-muted/60"
							}`}
						>
							<button
								type="button"
								onClick={() => setActiveId(c.id)}
								className="flex min-w-0 flex-1 flex-col text-left"
							>
								<span className="truncate text-sm">{c.title}</span>
								<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
									{RUNTIMES.find((r) => r.id === c.runtimeId)?.label ?? c.runtimeId}
								</span>
							</button>
							<button
								type="button"
								onClick={() => deleteConversation(c.id)}
								aria-label={`Delete ${c.title}`}
								className="opacity-0 transition-opacity group-hover:opacity-100"
							>
								<Trash2Icon aria-hidden="true" className="size-3.5 text-muted-foreground hover:text-destructive" />
							</button>
						</div>
					))}
				</div>
			</aside>

			{/* Conversation */}
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="pb-4">
					<h1 className="text-2xl font-semibold">{t("subagentChat.title")}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{t("subagentChat.description")}</p>
				</div>

				<div className="flex flex-wrap items-center gap-2 pb-3">
					<NativeSelect
						aria-label={t("subagent.agentLabel")}
						value={runtimeId}
						onChange={(e) => setDraftRuntime(e.target.value as AgentRuntimeId)}
						disabled={started || !!active}
						size="sm"
					>
						{availableRuntimes.map((r) => (
							<NativeSelectOption key={r.id} value={r.id}>
								{r.label}
							</NativeSelectOption>
						))}
					</NativeSelect>
					<NativeSelect
						aria-label={t("subagent.sandboxLabel")}
						value={sandbox}
						onChange={(e) => setDraftSandbox(e.target.value as AgentSandbox)}
						disabled={started || !!active}
						size="sm"
					>
						<NativeSelectOption value="read-only">
							{t("subagent.sandbox.readOnly")}
						</NativeSelectOption>
						<NativeSelectOption value="workspace-write">
							{t("subagent.sandbox.workspaceWrite")}
						</NativeSelectOption>
						<NativeSelectOption value="danger-full-access">
							{t("subagent.sandbox.dangerFullAccess")}
						</NativeSelectOption>
					</NativeSelect>
					<input
						aria-label={t("subagent.workingDirLabel")}
						value={cwd}
						onChange={(e) => setDraftCwd(e.target.value)}
						placeholder={t("subagent.workingDirPlaceholder")}
						disabled={started || !!active}
						className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs disabled:opacity-60"
					/>
				</div>

				<div
					ref={scrollRef}
					className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-border p-4"
				>
					{turns.length === 0 && !running ? (
						<p className="py-10 text-center text-sm text-muted-foreground">
							{t("subagentChat.emptyState", { agent: runtimeLabel })}
						</p>
					) : (
						<>
							{turns.map((turn, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: transcript is append-only
									key={i}
									className={
										turn.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"
									}
								>
									<span className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
										{turn.role === "user" ? t("subagentChat.you") : runtimeLabel}
									</span>
									<div
										className={`max-w-[90%] rounded-lg px-3 py-2 ${
											turn.role === "user"
												? "bg-primary/10"
												: turn.error
													? "bg-destructive/10"
													: "bg-muted"
										}`}
									>
										<pre
											className={`whitespace-pre-wrap font-mono text-sm ${turn.error ? "text-destructive" : ""}`}
										>
											{turn.text}
										</pre>
										{turn.usage && (
											<span className="mt-1 block text-xs text-muted-foreground">{turn.usage}</span>
										)}
									</div>
								</div>
							))}
							{running && (
								<div className="flex flex-col items-start">
									<span className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
										<Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
										{runtimeLabel} · {t("subagentChat.thinking")}
									</span>
									{streamed && (
										<div className="max-w-[90%] rounded-lg bg-muted px-3 py-2">
											<pre className="whitespace-pre-wrap font-mono text-sm text-muted-foreground">
												{streamed}
											</pre>
										</div>
									)}
								</div>
							)}
						</>
					)}
				</div>

				<div className="pt-3">
					<div className="flex items-end gap-2">
						<Textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault()
									send()
								}
							}}
							placeholder={t("subagentChat.inputPlaceholder", { agent: runtimeLabel })}
							rows={2}
							disabled={running}
							className="flex-1"
						/>
						{running ? (
							<Button variant="outline" onClick={stop}>
								{t("subagentChat.stop")}
							</Button>
						) : (
							<Button onClick={() => send()} disabled={!input.trim()}>
								<SendIcon aria-hidden="true" className="size-4" />
								{t("subagentChat.send")}
							</Button>
						)}
					</div>
					{active?.threadId && (
						<p className="mt-1.5 text-xs text-muted-foreground">{t("subagentChat.contextKept")}</p>
					)}
				</div>
			</div>
		</div>
	)
}
