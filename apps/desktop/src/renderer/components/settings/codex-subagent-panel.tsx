import { Button } from "@palot/ui/components/button"
import { Input } from "@palot/ui/components/input"
import { Label } from "@palot/ui/components/label"
import { NativeSelect, NativeSelectOption } from "@palot/ui/components/native-select"
import { Textarea } from "@palot/ui/components/textarea"
import { BotIcon, Loader2Icon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CodexRunResult, CodexSandbox, CodexUpdate } from "../../../preload/api"
import { useTranslation } from "../../i18n/use-translation"
import { SettingsSection } from "./settings-section"

const isElectron = typeof window !== "undefined" && "palot" in window

type RunState =
	| { status: "idle" }
	| { status: "running"; runId: string }
	| { status: "done"; result: CodexRunResult }
	| { status: "error"; message: string }

/**
 * Delegate a task to a local Codex agent. Runs headless via the main process
 * and streams normalized updates back. Only shown when the Codex CLI is
 * detected. All copy flows through the i18n layer.
 */
export function CodexSubagentPanel() {
	const { t } = useTranslation()
	const [installed, setInstalled] = useState<boolean | null>(null)
	const [prompt, setPrompt] = useState("")
	const [cwd, setCwd] = useState("")
	const [sandbox, setSandbox] = useState<CodexSandbox>("read-only")
	const [run, setRun] = useState<RunState>({ status: "idle" })
	const [stream, setStream] = useState<string[]>([])
	const runIdRef = useRef<string | null>(null)

	useEffect(() => {
		if (!isElectron) return
		window.palot.agentClis.detect().then((clis) => {
			setInstalled(clis.some((c) => c.id === "codex" && c.installed))
		})
	}, [])

	// Subscribe once; forward only updates for the active run.
	useEffect(() => {
		if (!isElectron) return
		return window.palot.codexSubagent.onUpdate((runId, update: CodexUpdate) => {
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
			const result = await window.palot.codexSubagent.run(runId, {
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
	}, [prompt, cwd, sandbox])

	const cancel = useCallback(() => {
		if (run.status === "running") window.palot.codexSubagent.cancel(run.runId)
	}, [run])

	const running = run.status === "running"
	const usageLabel = useMemo(() => {
		if (run.status !== "done" || !run.result.usage) return null
		return t("codexSubagent.usage", {
			input: run.result.usage.inputTokens,
			output: run.result.usage.outputTokens,
		})
	}, [run, t])

	if (installed === false) {
		return (
			<SettingsSection title={t("codexSubagent.title")} description={t("codexSubagent.description")}>
				<p className="px-4 py-3 text-sm text-muted-foreground">
					{t("codexSubagent.notInstalled")}
				</p>
			</SettingsSection>
		)
	}

	return (
		<SettingsSection title={t("codexSubagent.title")} description={t("codexSubagent.description")}>
			<div className="flex flex-col gap-3 px-4 py-3">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="codex-prompt">{t("codexSubagent.promptLabel")}</Label>
					<Textarea
						id="codex-prompt"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder={t("codexSubagent.promptPlaceholder")}
						rows={3}
						disabled={running}
					/>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row">
					<div className="flex flex-1 flex-col gap-1.5">
						<Label htmlFor="codex-cwd">{t("codexSubagent.workingDirLabel")}</Label>
						<Input
							id="codex-cwd"
							value={cwd}
							onChange={(e) => setCwd(e.target.value)}
							placeholder={t("codexSubagent.workingDirPlaceholder")}
							disabled={running}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="codex-sandbox">{t("codexSubagent.sandboxLabel")}</Label>
						<NativeSelect
							id="codex-sandbox"
							value={sandbox}
							onChange={(e) => setSandbox(e.target.value as CodexSandbox)}
							disabled={running}
						>
							<NativeSelectOption value="read-only">
								{t("codexSubagent.sandbox.readOnly")}
							</NativeSelectOption>
							<NativeSelectOption value="workspace-write">
								{t("codexSubagent.sandbox.workspaceWrite")}
							</NativeSelectOption>
							<NativeSelectOption value="danger-full-access">
								{t("codexSubagent.sandbox.dangerFullAccess")}
							</NativeSelectOption>
						</NativeSelect>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{running ? (
						<Button variant="outline" size="sm" onClick={cancel}>
							{t("codexSubagent.cancel")}
						</Button>
					) : (
						<Button size="sm" onClick={start} disabled={!prompt.trim()}>
							<BotIcon aria-hidden="true" className="size-4" />
							{t("codexSubagent.run")}
						</Button>
					)}
					{running && (
						<span className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
							{t("codexSubagent.running")}
						</span>
					)}
				</div>
			</div>

			<div className="border-t border-border px-4 py-3">
				<div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{t("codexSubagent.result")}
				</div>
				{run.status === "error" ? (
					<p className="text-sm text-destructive">
						{t("codexSubagent.failed", { error: run.message })}
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
					<p className="text-sm text-muted-foreground">{t("codexSubagent.empty")}</p>
				)}
			</div>
		</SettingsSection>
	)
}
