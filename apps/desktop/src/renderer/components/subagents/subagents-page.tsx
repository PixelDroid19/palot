import { Button } from "@palot/ui/components/button"
import { NativeSelect, NativeSelectOption } from "@palot/ui/components/native-select"
import { Textarea } from "@palot/ui/components/textarea"
import { Loader2Icon, PlusIcon, SendIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AgentRuntimeId, AgentSandbox, AgentUpdate } from "../../../preload/api"
import { useTranslation } from "../../i18n/use-translation"

const isElectron = typeof window !== "undefined" && "palot" in window

const RUNTIMES: { id: AgentRuntimeId; label: string }[] = [
	{ id: "codex", label: "Codex" },
	{ id: "claude", label: "Claude Code" },
]

interface Turn {
	role: "user" | "agent"
	text: string
	notices?: string[]
	usage?: string
	error?: boolean
}

/**
 * Multi-turn conversation with a coding-agent CLI (Codex, Claude Code, …).
 * Palot delegates each turn to the CLI headlessly and resumes the same session
 * so context carries across turns — Palot is not tied to OpenCode for this.
 */
export function SubagentsPage() {
	const { t } = useTranslation()
	const [installedIds, setInstalledIds] = useState<AgentRuntimeId[] | null>(null)
	const [runtimeId, setRuntimeId] = useState<AgentRuntimeId>("codex")
	const [sandbox, setSandbox] = useState<AgentSandbox>("read-only")
	const [cwd, setCwd] = useState("")
	const [turns, setTurns] = useState<Turn[]>([])
	const [input, setInput] = useState("")
	const [running, setRunning] = useState(false)
	const [streamed, setStreamed] = useState("")
	const threadRef = useRef<string | null>(null)
	const runIdRef = useRef<string | null>(null)
	const scrollRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isElectron) return
		window.palot.agentClis.detect().then((clis) => {
			const ids = RUNTIMES.map((r) => r.id).filter((id) =>
				clis.some((c) => c.id === id && c.installed),
			)
			setInstalledIds(ids)
			if (ids.length > 0) setRuntimeId((prev) => (ids.includes(prev) ? prev : ids[0]))
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
	}, [turns, streamed])

	const started = turns.length > 0 || running
	const availableRuntimes = useMemo(
		() => RUNTIMES.filter((r) => installedIds?.includes(r.id)),
		[installedIds],
	)
	const runtimeLabel = availableRuntimes.find((r) => r.id === runtimeId)?.label ?? "agent"

	const send = useCallback(async () => {
		const prompt = input.trim()
		if (!isElectron || !prompt || running) return
		const runId = crypto.randomUUID()
		runIdRef.current = runId
		setInput("")
		setStreamed("")
		setTurns((prev) => [...prev, { role: "user", text: prompt }])
		setRunning(true)
		try {
			const result = await window.palot.agentSubagent.run(runId, runtimeId, {
				prompt,
				cwd: cwd.trim() || ".",
				sandbox,
				resumeId: threadRef.current ?? undefined,
			})
			threadRef.current = result.threadId ?? threadRef.current
			setTurns((prev) => [
				...prev,
				{
					role: "agent",
					text: result.message || "(no output)",
					notices: result.notices,
					usage: result.usage
						? t("subagent.usage", {
								input: result.usage.inputTokens,
								output: result.usage.outputTokens,
							})
						: undefined,
				},
			])
		} catch (err) {
			setTurns((prev) => [
				...prev,
				{ role: "agent", text: err instanceof Error ? err.message : String(err), error: true },
			])
		} finally {
			setRunning(false)
			setStreamed("")
			runIdRef.current = null
		}
	}, [input, running, runtimeId, cwd, sandbox, t])

	const stop = useCallback(() => {
		if (runIdRef.current) window.palot.agentSubagent.cancel(runIdRef.current)
	}, [])

	const reset = useCallback(() => {
		threadRef.current = null
		setTurns([])
		setStreamed("")
		setInput("")
	}, [])

	if (installedIds !== null && availableRuntimes.length === 0) {
		return (
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
				<h1 className="text-2xl font-semibold">{t("subagentChat.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("subagentChat.noneInstalled")}</p>
			</div>
		)
	}

	return (
		<div className="mx-auto flex h-full w-full max-w-3xl flex-col p-6">
			{/* Header + session config */}
			<div className="flex flex-wrap items-end justify-between gap-3 pb-4">
				<div>
					<h1 className="text-2xl font-semibold">{t("subagentChat.title")}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{t("subagentChat.description")}</p>
				</div>
				{started && (
					<Button variant="outline" size="sm" onClick={reset} disabled={running}>
						<PlusIcon aria-hidden="true" className="size-4" />
						{t("subagentChat.newConversation")}
					</Button>
				)}
			</div>

			<div className="flex flex-wrap items-center gap-2 pb-3">
				<NativeSelect
					aria-label={t("subagent.agentLabel")}
					value={runtimeId}
					onChange={(e) => setRuntimeId(e.target.value as AgentRuntimeId)}
					disabled={started}
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
					onChange={(e) => setSandbox(e.target.value as AgentSandbox)}
					disabled={started}
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
					onChange={(e) => setCwd(e.target.value)}
					placeholder={t("subagent.workingDirPlaceholder")}
					disabled={started}
					className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs disabled:opacity-60"
				/>
			</div>

			{/* Transcript */}
			<div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-border p-4">
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
								className={turn.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}
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

			{/* Composer */}
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
						<Button onClick={send} disabled={!input.trim()}>
							<SendIcon aria-hidden="true" className="size-4" />
							{t("subagentChat.send")}
						</Button>
					)}
				</div>
				{threadRef.current && (
					<p className="mt-1.5 text-xs text-muted-foreground">{t("subagentChat.contextKept")}</p>
				)}
			</div>
		</div>
	)
}
