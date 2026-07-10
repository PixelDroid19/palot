/** Onboarding environment check for local CLI runtimes. */
import { Button } from "@gcode/ui/components/button"
import { ArrowRightIcon, CheckCircle2Icon, RefreshCwIcon, XCircleIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

type CheckStatus = "pending" | "running" | "success" | "warning" | "error"

interface CheckItem {
	id: string
	label: string
	status: CheckStatus
	detail?: string
}

interface EnvironmentCheckStepProps {
	onComplete: (version: string | null) => void
	onSkip: () => void
}

/**
 * Check every registered CLI through the neutral detection bridge. OpenCode is
 * intentionally handled exactly like Codex and Claude: it is discovered as a
 * binary and later launched through agentSession/ACP, never through a server.
 */
export function EnvironmentCheckStep({ onComplete }: EnvironmentCheckStepProps) {
	const [checks, setChecks] = useState<CheckItem[]>([
		{ id: "locate", label: "Checking installed CLI runtimes", status: "pending" },
		{ id: "ready", label: "Checking CLI readiness", status: "pending" },
	])
	const [allDone, setAllDone] = useState(false)
	const hasRun = useRef(false)
	const isElectron = typeof window !== "undefined" && "gcode" in window

	const updateCheck = useCallback((id: string, update: Partial<CheckItem>) => {
		setChecks((current) => current.map((item) => (item.id === id ? { ...item, ...update } : item)))
	}, [])

	const runChecks = useCallback(async () => {
		if (!isElectron) return
		setAllDone(false)
		setChecks([
			{ id: "locate", label: "Checking installed CLI runtimes", status: "running" },
			{ id: "ready", label: "Checking CLI readiness", status: "pending" },
		])
		try {
			const detections = await window.gcode.agentClis.detect(true)
			const installed = detections.filter((d) => d.installed)
			const summary = installed
				.map((d) => `${d.displayName} ${d.version ?? "detected"}`)
				.join(", ")
			updateCheck("locate", {
				status: installed.length > 0 ? "success" : "warning",
				label: installed.length > 0 ? "CLI runtimes detected" : "No CLI runtime detected",
				detail: summary || "Install OpenCode, Codex, or Claude Code to start sessions.",
			})
			updateCheck("ready", {
				status: installed.length > 0 ? "success" : "warning",
				label: installed.length > 0 ? "CLI adapters ready" : "No adapter available yet",
				detail: "All runtimes use the shared agent-session process bridge.",
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : "CLI detection failed"
			updateCheck("locate", {
				status: "warning",
				label: "Could not detect CLI runtimes",
				detail: `${message}. You can retry later.`,
			})
			updateCheck("ready", { status: "warning", label: "Skipped" })
		} finally {
			setAllDone(true)
		}
	}, [isElectron, updateCheck])

	useEffect(() => {
		if (hasRun.current) return
		hasRun.current = true
		void runChecks()
	}, [runChecks])

	return (
		<div className="flex h-full flex-col items-center justify-center px-6">
			<div className="w-full max-w-lg space-y-6">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-foreground">Environment Check</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						GCode uses one shared local session host for OpenCode, Codex, Claude Code, and other CLI adapters.
					</p>
				</div>

				<div className="space-y-3">
					{checks.map((check) => (
						<div
							key={check.id}
							data-slot="onboarding-card"
							className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
						>
							<div className="mt-0.5 shrink-0">
								<CheckStatusIcon status={check.status} />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-medium text-foreground">{check.label}</p>
								{check.detail && <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>}
							</div>
						</div>
					))}
				</div>

				<div className="flex justify-center gap-3">
					{!allDone && (
						<Button size="sm" variant="outline" onClick={() => void runChecks()} className="gap-2">
							<RefreshCwIcon aria-hidden="true" className="size-3.5" />
							Re-check
						</Button>
					)}
					{allDone && (
						<Button size="default" onClick={() => onComplete(null)} className="gap-2">
							Continue
							<ArrowRightIcon aria-hidden="true" className="size-4" />
						</Button>
					)}
				</div>
			</div>
		</div>
	)
}

function CheckStatusIcon({ status }: { status: CheckStatus }) {
	if (status === "success") return <CheckCircle2Icon aria-hidden="true" className="size-5 text-emerald-500" />
	if (status === "warning") return <XCircleIcon aria-hidden="true" className="size-5 text-amber-500" />
	if (status === "error") return <XCircleIcon aria-hidden="true" className="size-5 text-destructive" />
	return <span className="block size-5 animate-pulse rounded-full bg-muted" aria-hidden="true" />
}
