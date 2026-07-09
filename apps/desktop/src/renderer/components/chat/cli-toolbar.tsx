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
import type { AgentRuntimeDescriptor, SessionRuntimeDescriptor } from "../../../preload/api"
import { useTranslation } from "../../i18n/use-translation"
import { installedSessionRuntimeOptions, loadRuntimeDescriptors } from "../../lib/session-runtimes"
import { switchRuntimeSession } from "../../services/runtime-session-launch"
import {
	SearchableOptionSelect,
	type SearchableOptionSelectItem,
} from "./searchable-option-select"

const TOOLBAR_TRIGGER_CN =
	"h-7! gap-1 border-none bg-transparent! hover:bg-muted! px-2! py-0! text-xs shadow-none transition-colors"

interface ToolbarOption {
	value: string
	label: string
	muted?: boolean
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
	const [runtimes, setRuntimes] = useState<SessionRuntimeDescriptor[]>([])
	useEffect(() => {
		loadRuntimeDescriptors().then((all) => setRuntimes(all))
	}, [])
	if (runtimes.length === 0) return null
	const runtimeOptions = installedSessionRuntimeOptions(runtimes)

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
			options={runtimeOptions}
		/>
	)
}
