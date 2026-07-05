import { Button } from "@palot/ui/components/button"
import { Input } from "@palot/ui/components/input"
import { Label } from "@palot/ui/components/label"
import { NativeSelect, NativeSelectOption } from "@palot/ui/components/native-select"
import { Textarea } from "@palot/ui/components/textarea"
import { BotIcon, Loader2Icon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
	AgentRunResult,
	AgentRuntimeId,
	AgentSandbox,
	AgentUpdate,
} from "../../../preload/api"
import { useTranslation } from "../../i18n/use-translation"
import { SettingsSection } from "./settings-section"

const isElectron = typeof window !== "undefined" && "palot" in window

// CLI ids that can be driven as subagents, and their display names. Kept in
// sync with the main-process agent registry.
const RUNTIMES: { id: AgentRuntimeId; label: string }[] = [
	{ id: "codex", label: "Codex" },
	{ id: "claude", label: "Claude Code" },
]

type RunState =
	| { status: "idle" }
	| { status: "running"; runId: string }
	| { status: "done"; result: AgentRunResult }
	| { status: "error"; message: string }

/**
 * Delegate a task to a local coding-agent CLI (Codex, Claude Code, …). Runs
 * headless via the main process and streams normalized updates back. The agent
 * picker only lists CLIs detected on this machine. All copy flows through i18n.
 */
export function SubagentPanel() {
	const { t } = useTranslation()
	const [installedIds, setInstalledIds] = useState<AgentRuntimeId[] | null>(null)
	const [runtimeId, setRuntimeId] = useState<AgentRuntimeId>("codex")
	const [prompt, setPrompt] = useState("")
	const [cwd, setCwd] = useState("")
	const [sandbox, setSandbox] = useState<AgentSandbox>("read-only")
	const [run, setRun] = useState<RunState>({ status: "idle" })
	const [stream, setStream] = useState<string[]>([])
	const runIdRef = useRef<string | null>(null)

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

	// Subscribe once; forward only updates for the active run.
	useEffect(() => {
		if (!isElectron) return
		return window.palot.agentSubagent.onUpdate((runId, update: AgentUpdate) => {
			if (runId !== runIdRef.current) return
			if (update.kind === "message" && update.text) {
				setStream((prev) => [...prev, update.text])
			} else if (update.kind === "notice" && update.text) {
				setStream((prev) => [...prev, `⚠ ${update.text}`])
			}
		})
	}, [])

	const start = useCallback(async () => {
		if (!isElectron || !prompt.trim()) return
		const runId = crypto.randomUUID()
		runIdRef.current = runId
		setStream([])
		setRun({ status: "running", runId })
		try {
			const result = await window.palot.agentSubagent.run(runId, runtimeId, {
				prompt: prompt.trim(),
				cwd: cwd.trim() || ".",
				sandbox,
			})
			setRun({ status: "done", result })
		} catch (err) {
			setRun({ status: "error", message: err instanceof Error ? err.message : String(err) })
		} finally {
			runIdRef.current = null
		}
	}, [prompt, cwd, sandbox, runtimeId])

	const cancel = useCallback(() => {
		if (run.status === "running") window.palot.agentSubagent.cancel(run.runId)
	}, [run])

	const running = run.status === "running"
	const availableRuntimes = useMemo(
		() => RUNTIMES.filter((r) => installedIds?.includes(r.id)),
		[installedIds],
	)
	const usageLabel = useMemo(() => {
		if (run.status !== "done" || !run.result.usage) return null
		return t("subagent.usage", {
			input: run.result.usage.inputTokens,
			output: run.result.usage.outputTokens,
		})
	}, [run, t])

	if (installedIds !== null && availableRuntimes.length === 0) {
		return (
			<SettingsSection title={t("subagent.title")} description={t("subagent.description")}>
				<p className="px-4 py-3 text-sm text-muted-foreground">{t("subagent.noneInstalled")}</p>
			</SettingsSection>
		)
	}

	return (
		<SettingsSection title={t("subagent.title")} description={t("subagent.description")}>
			<div className="flex flex-col gap-3 px-4 py-3">
				<div className="flex flex-col gap-3 sm:flex-row">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="subagent-runtime">{t("subagent.agentLabel")}</Label>
						<NativeSelect
							id="subagent-runtime"
							value={runtimeId}
							onChange={(e) => setRuntimeId(e.target.value as AgentRuntimeId)}
							disabled={running}
						>
							{availableRuntimes.map((r) => (
								<NativeSelectOption key={r.id} value={r.id}>
									{r.label}
								</NativeSelectOption>
							))}
						</NativeSelect>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="subagent-sandbox">{t("subagent.sandboxLabel")}</Label>
						<NativeSelect
							id="subagent-sandbox"
							value={sandbox}
							onChange={(e) => setSandbox(e.target.value as AgentSandbox)}
							disabled={running}
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
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="subagent-prompt">{t("subagent.promptLabel")}</Label>
					<Textarea
						id="subagent-prompt"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder={t("subagent.promptPlaceholder")}
						rows={3}
						disabled={running}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="subagent-cwd">{t("subagent.workingDirLabel")}</Label>
					<Input
						id="subagent-cwd"
						value={cwd}
						onChange={(e) => setCwd(e.target.value)}
						placeholder={t("subagent.workingDirPlaceholder")}
						disabled={running}
					/>
				</div>
				<div className="flex items-center gap-2">
					{running ? (
						<Button variant="outline" size="sm" onClick={cancel}>
							{t("subagent.cancel")}
						</Button>
					) : (
						<Button size="sm" onClick={start} disabled={!prompt.trim()}>
							<BotIcon aria-hidden="true" className="size-4" />
							{t("subagent.run")}
						</Button>
					)}
					{running && (
						<span className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
							{t("subagent.running")}
						</span>
					)}
				</div>
			</div>

			<div className="border-t border-border px-4 py-3">
				<div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("subagent.result")}
				</div>
				{run.status === "error" ? (
					<p className="text-sm text-destructive">
						{t("subagent.failed", { error: run.message })}
					</p>
				) : run.status === "done" ? (
					<div className="flex flex-col gap-1">
						<pre className="whitespace-pre-wrap font-mono text-sm">{run.result.message}</pre>
						{usageLabel && <span className="text-xs text-muted-foreground">{usageLabel}</span>}
					</div>
				) : stream.length > 0 ? (
					<pre className="whitespace-pre-wrap font-mono text-sm text-muted-foreground">
						{stream.join("\n")}
					</pre>
				) : (
					<p className="text-sm text-muted-foreground">{t("subagent.empty")}</p>
				)}
			</div>
		</SettingsSection>
	)
}
