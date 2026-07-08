/**
 * Settings tab for environment setup, migration management, and re-running onboarding.
 */

import { Button } from "@palot/ui/components/button"
import { Spinner } from "@palot/ui/components/spinner"
import { useAtomValue, useSetAtom } from "jotai"
import {
	AlertCircleIcon,
	CheckCircle2Icon,
	RefreshCwIcon,
	RotateCcwIcon,
	UndoIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { onboardingStateAtom } from "../../atoms/onboarding"
import {
	loadRuntimeSetupStatuses,
	type RuntimeSetupStatus,
} from "../../services/runtime-setup-status"
import { SettingsRow } from "./settings-row"
import { SettingsSection } from "./settings-section"

const isElectron = typeof window !== "undefined" && "palot" in window

// ============================================================
// Provider display metadata
// ============================================================

const PROVIDER_LABELS: Record<string, string> = {
	"claude-code": "Claude Code",
	cursor: "Cursor",
	opencode: "OpenCode",
}

export function SetupSettings() {
	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-xl font-semibold">Setup</h2>
			</div>

			<RuntimeStatusSection />
			<MigrationSection />
			<OnboardingSection />
		</div>
	)
}

// ============================================================
// Runtime status
// ============================================================

function RuntimeStatusSection() {
	const [runtimes, setRuntimes] = useState<RuntimeSetupStatus[] | null>(null)
	const [loading, setLoading] = useState(false)

	const load = useCallback(async (force = false) => {
		if (!isElectron) return
		setLoading(true)
		try {
			setRuntimes(await loadRuntimeSetupStatuses(force))
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		load()
	}, [load])

	return (
		<SettingsSection
			title="Coding runtimes"
			description="Palot works with multiple coding runtimes. OpenCode is managed locally; other CLIs are detected on this machine and can be used in runtime flows."
		>
			<div className="flex items-center justify-end px-4 pt-3">
				<Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading} className="gap-1.5">
					<RefreshCwIcon aria-hidden="true" className="size-3" />
					Rescan
				</Button>
			</div>
			{(runtimes ?? []).map((runtime) => {
				return (
					<div key={runtime.id}>
						<SettingsRow
							label={runtime.displayName}
							description={runtime.description}
						>
							<div className="flex items-center gap-2">
								{loading && !runtimes ? (
									<Spinner className="size-3.5" />
								) : runtime.installed ? (
									<>
										{runtime.version && (
											<span className="text-sm text-muted-foreground">
												{/^\d+\.\d+/.test(runtime.version)
													? `v${runtime.version}`
													: runtime.version}
											</span>
										)}
										{runtime.compatible ? (
											<CheckCircle2Icon className="size-4 text-emerald-500" />
										) : (
											<AlertCircleIcon className="size-4 text-amber-500" />
										)}
									</>
								) : (
									<span className="text-sm text-muted-foreground">Not installed</span>
								)}
							</div>
						</SettingsRow>
						{runtime.warning && (
							<div className="px-4 py-2 text-xs text-amber-500">{runtime.warning}</div>
						)}
					</div>
				)
			})}
		</SettingsSection>
	)
}

// ============================================================
// Migration management
// ============================================================

function MigrationSection() {
	const onboardingState = useAtomValue(onboardingStateAtom)
	const [restoring, setRestoring] = useState(false)
	const [restoreResult, setRestoreResult] = useState<string | null>(null)

	const handleRestore = useCallback(async () => {
		if (!isElectron) return
		setRestoring(true)
		setRestoreResult(null)
		try {
			const result = await window.palot.onboarding.restoreBackup()
			if (result.success) {
				setRestoreResult(`Restored ${result.restored.length} file(s)`)
			} else {
				setRestoreResult(`Errors: ${result.errors.join(", ")}`)
			}
		} catch (err) {
			setRestoreResult(err instanceof Error ? err.message : "Restore failed")
		} finally {
			setRestoring(false)
		}
	}, [])

	const migratedFrom = onboardingState.migratedFrom ?? []

	if (!onboardingState.migrationPerformed || migratedFrom.length === 0) {
		return (
			<SettingsSection title="Configuration Migration">
				<SettingsRow label="Status" description="No migration has been performed">
					<span className="text-sm text-muted-foreground">N/A</span>
				</SettingsRow>
			</SettingsSection>
		)
	}

	const migratedLabels = migratedFrom.map((p) => PROVIDER_LABELS[p] ?? p).join(", ")

	return (
		<SettingsSection title="Configuration Migration">
			<SettingsRow label="Migrated from" description={migratedLabels}>
				<CheckCircle2Icon className="size-4 text-emerald-500" />
			</SettingsRow>
			<SettingsRow
				label="Last migrated"
				description={
					onboardingState.completedAt
						? new Date(onboardingState.completedAt).toLocaleString()
						: "Unknown"
				}
			>
				<span className="text-xs text-muted-foreground">
					{migratedFrom.length} provider{migratedFrom.length === 1 ? "" : "s"}
				</span>
			</SettingsRow>
			<SettingsRow
				label="Restore backup"
				description="Undo the migration and restore original files"
			>
				<div className="flex items-center gap-2">
					{restoreResult && <span className="text-xs text-muted-foreground">{restoreResult}</span>}
					<Button
						variant="outline"
						size="sm"
						onClick={handleRestore}
						disabled={restoring}
						className="gap-1.5"
					>
						{restoring ? (
							<Spinner className="size-3" />
						) : (
							<UndoIcon aria-hidden="true" className="size-3" />
						)}
						Restore
					</Button>
				</div>
			</SettingsRow>
		</SettingsSection>
	)
}

// ============================================================
// Re-run onboarding
// ============================================================

function OnboardingSection() {
	const setOnboardingState = useSetAtom(onboardingStateAtom)

	const handleRerun = useCallback(() => {
		setOnboardingState({
			completed: false,
			completedAt: null,
			skippedSteps: [],
			migrationPerformed: false,
			migratedFrom: [],
			managedRuntimeVersion: null,
			providersConnected: 0,
		})
		// Relaunch the app to show onboarding fresh
		if (isElectron) {
			window.palot.relaunch()
		}
	}, [setOnboardingState])

	return (
		<SettingsSection title="Onboarding">
			<SettingsRow
				label="Re-run setup"
				description="Reset and show the onboarding wizard again on next launch"
			>
				<Button variant="outline" size="sm" onClick={handleRerun} className="gap-1.5">
					<RotateCcwIcon aria-hidden="true" className="size-3" />
					Re-run Setup
				</Button>
			</SettingsRow>
		</SettingsSection>
	)
}
