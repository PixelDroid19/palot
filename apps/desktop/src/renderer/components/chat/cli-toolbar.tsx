/**
 * Toolbar for CLI-backed sessions: model and reasoning-effort pickers driven
 * by the runtime's own catalog (agent-host descriptors), applied to the NEXT
 * turn via the session's CLI meta. Mid-session switching works because both
 * Codex and Claude accept model overrides when resuming a session.
 */
import { Select, SelectContent, SelectItem, SelectTrigger } from "@palot/ui/components/select"
import { cn } from "@palot/ui/lib/utils"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import type { AgentRuntimeDescriptor, AgentSandbox } from "../../../preload/api"
import { useTranslation } from "../../i18n/use-translation"
import { loadRuntimeDescriptors } from "../../lib/session-runtimes"
import { switchRuntimeSession } from "../../services/runtime-session-launch"
import {
	SearchableOptionSelect,
	type SearchableOptionSelectItem,
} from "./searchable-option-select"
import { SessionConfigToolbarRow } from "./session-config-toolbar-row"

const TOOLBAR_TRIGGER_CN =
	"h-7! gap-1 border-none bg-transparent! hover:bg-muted! px-2! py-0! text-xs shadow-none transition-colors"

interface ToolbarOption {
	value: string
	label: string
	muted?: boolean
}

function cliEffortOptions(
	t: ReturnType<typeof useTranslation>["t"],
	efforts: string[],
): ToolbarOption[] {
	return [
		{ value: "__default__", label: t("runtimePicker.effortDefault"), muted: true },
		...efforts.map((effort) => ({
			value: effort,
			label: t("runtimePicker.effortLevel", {
				level: effort.charAt(0).toUpperCase() + effort.slice(1),
			}),
		})),
	]
}

export function CliOptionSelect({
	"aria-label": ariaLabel,
	value,
	options,
	onValueChange,
}: {
	"aria-label": string
	value: string
	options: ToolbarOption[]
	onValueChange: (value: string) => void
}) {
	const active = options.find((option) => option.value === value) ?? options[0]
	if (!active) return null

	return (
		<Select
			value={active.value}
			onValueChange={(next) => {
				if (next != null) onValueChange(next)
			}}
		>
			<SelectTrigger aria-label={ariaLabel} className={TOOLBAR_TRIGGER_CN}>
				<span className={cn("truncate", active.muted && "text-muted-foreground")}>
					{active.label}
				</span>
			</SelectTrigger>
			<SelectContent side="top" align="start" alignItemWithTrigger={false}>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						<span className={cn(option.muted && "text-muted-foreground")}>{option.label}</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

export function CliModelSelect({
	models,
	value,
	onValueChange,
}: {
	models: AgentRuntimeDescriptor["models"]
	value: string
	onValueChange: (value: string) => void
}) {
	const items = useMemo<SearchableOptionSelectItem[]>(
		() =>
			models.map((model) => ({
				value: model.slug,
				label: model.label,
				group: "Models",
				description: model.slug === model.label ? undefined : model.slug,
				searchTerms: [model.slug, model.label],
			})),
		[models],
	)

	if (models.length === 0) return null

	return (
		<SearchableOptionSelect
			ariaLabel="Model"
			items={items}
			value={value}
			onValueChange={onValueChange}
			placeholder="Select model..."
			searchPlaceholder="Search models..."
			emptyLabel="No models found"
		/>
	)
}

export function CliPromptToolbar({
	models,
	modelValue,
	onModelChange,
	sandboxValue,
	onSandboxChange,
	efforts,
	effortValue,
	onEffortChange,
}: {
	models: AgentRuntimeDescriptor["models"]
	modelValue: string
	onModelChange: (value: string) => void
	sandboxValue: AgentSandbox
	onSandboxChange: (value: AgentSandbox) => void
	efforts: string[]
	effortValue: string
	onEffortChange: (value: string) => void
}) {
	const { t } = useTranslation()
	const hasModel = models.length > 0
	const hasEffort = efforts.length > 0

	return (
		<SessionConfigToolbarRow
			items={[
				hasModel && (
					<CliModelSelect models={models} value={modelValue} onValueChange={onModelChange} />
				),
				<CliOptionSelect
					aria-label={t("runtimePicker.sandbox")}
					value={sandboxValue}
					onValueChange={(value) => onSandboxChange(value as AgentSandbox)}
					options={[
						{ value: "plan", label: t("runtimePicker.sandboxPlan") },
						{ value: "read-only", label: t("runtimePicker.sandboxReadOnly") },
						{ value: "workspace-write", label: t("runtimePicker.sandboxWorkspaceWrite") },
						{ value: "danger-full-access", label: t("runtimePicker.sandboxFullAccess") },
					]}
				/>,
				hasEffort && (
					<CliOptionSelect
						aria-label={t("runtimePicker.effort")}
						value={effortValue || "__default__"}
						onValueChange={(value) => onEffortChange(value === "__default__" ? "" : value)}
						options={cliEffortOptions(t, efforts)}
					/>
				),
			]}
		/>
	)
}

/**
 * Runtime switcher available in EVERY chat (OpenCode or CLI-backed): one
 * conversation can move between OpenCode, Codex and Claude Code mid-session.
 * The transcript stays and the history is handed off to the new runtime, so
 * context survives the switch.
 */
export function SessionRuntimeSwitch({
	sessionId,
	current,
}: {
	sessionId: string
	current: string
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const params = useParams({ strict: false }) as { projectSlug?: string }
	const [runtimes, setRuntimes] = useState<AgentRuntimeDescriptor[]>([])
	useEffect(() => {
		loadRuntimeDescriptors().then((all) => setRuntimes(all.filter((d) => d.installed)))
	}, [])
	if (runtimes.length === 0) return null

	const switchTo = async (target: string) => {
		if (target === current) return
		const nextId = await switchRuntimeSession(sessionId, target)
		if (nextId && nextId !== sessionId && params.projectSlug) {
			navigate({
				to: "/project/$projectSlug/session/$sessionId",
				params: { projectSlug: params.projectSlug, sessionId: nextId },
			})
		}
	}

	return (
		<CliOptionSelect
			aria-label={t("runtimePicker.runtime")}
			value={current}
			onValueChange={(value) => void switchTo(value)}
			options={[
				{ value: "opencode", label: "OpenCode" },
				...runtimes.map((r) => ({ value: r.id, label: r.displayName })),
			]}
		/>
	)
}
