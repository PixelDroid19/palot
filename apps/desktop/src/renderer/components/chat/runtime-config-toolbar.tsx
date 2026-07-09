/**
 * Single capability-driven runtime config toolbar.
 *
 * All runtimes (OpenCode, Codex, Claude, …) share the same visual slots:
 *   Profile/Agent · Model · Mode/Permission · Effort/Variant · (workspace via parent)
 *
 * Callers pass only the sections the active runtime's descriptor supports.
 * Missing capabilities omit the slot — never a broken empty selector.
 */
import type { AgentSandbox } from "../../../preload/api"
import type { SdkAgent } from "../../hooks/use-runtime-data"
import { useTranslation } from "../../i18n/use-translation"
import { CliOptionSelect } from "./cli-toolbar"
import { AgentSelector, VariantSelector } from "./prompt-toolbar"
import { RuntimeModelSelect, type RuntimeModelSelectItem } from "./runtime-model-select"
import {
	buildToolbarSectionsFromSlots,
	type RuntimeToolbarSections as PureRuntimeToolbarSections,
} from "./runtime-toolbar-sections"
import { SessionConfigToolbarRow } from "./session-config-toolbar-row"

export { buildToolbarSectionsFromSlots } from "./runtime-toolbar-sections"

export interface RuntimeToolbarAgentSection {
	agents: SdkAgent[]
	selectedAgent: string | null
	defaultAgent?: string
	onSelectAgent: (agentName: string) => void
	disabled?: boolean
}

export interface RuntimeToolbarProjectModelSection {
	items: RuntimeModelSelectItem[]
	value: string | null
	onValueChange: (value: string) => void
	disabled?: boolean
	emptyLabel?: string
}

export interface RuntimeToolbarVariantSection {
	variants: string[]
	selectedVariant: string | undefined
	onSelectVariant: (variant: string | undefined) => void
	disabled?: boolean
}

export interface RuntimeToolbarSandboxSection {
	value: AgentSandbox
	onValueChange: (value: AgentSandbox) => void
	disabled?: boolean
}

export interface RuntimeToolbarEffortSection {
	efforts: string[]
	value: string
	onValueChange: (value: string) => void
	disabled?: boolean
}

/**
 * Ordered slots shared by every runtime. Only include keys the descriptor
 * declares; the view skips undefined slots.
 */
export interface RuntimeToolbarSections {
	agent?: RuntimeToolbarAgentSection
	model?: RuntimeToolbarProjectModelSection
	variant?: RuntimeToolbarVariantSection
	sandbox?: RuntimeToolbarSandboxSection
	effort?: RuntimeToolbarEffortSection
}

export interface RuntimeConfigToolbarProps {
	sections: RuntimeToolbarSections
}

function effortOptions(
	t: ReturnType<typeof useTranslation>["t"],
	efforts: string[],
): { value: string; label: string; muted?: boolean }[] {
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

function RuntimeToolbarSectionsView({ sections }: { sections: RuntimeToolbarSections }) {
	const { t } = useTranslation()
	const normalized = buildToolbarSectionsFromSlots(
		sections as PureRuntimeToolbarSections<SdkAgent, AgentSandbox>,
	) as RuntimeToolbarSections
	const hasEffort = (normalized.effort?.efforts.length ?? 0) > 0
	const items = [
		normalized.agent && (
			<AgentSelector
				key="agent"
				agents={normalized.agent.agents}
				selectedAgent={normalized.agent.selectedAgent}
				defaultAgent={normalized.agent.defaultAgent}
				onSelectAgent={normalized.agent.onSelectAgent}
				disabled={normalized.agent.disabled}
			/>
		),
		normalized.model && (
			<RuntimeModelSelect
				key="model"
				items={normalized.model.items}
				value={normalized.model.value}
				onValueChange={normalized.model.onValueChange}
				disabled={normalized.model.disabled}
			/>
		),
		normalized.variant && (
			<VariantSelector
				key="variant"
				variants={normalized.variant.variants}
				selectedVariant={normalized.variant.selectedVariant}
				onSelectVariant={normalized.variant.onSelectVariant}
				disabled={normalized.variant.disabled}
			/>
		),
		normalized.sandbox && (
			<CliOptionSelect
				key="sandbox"
				aria-label={t("runtimePicker.sandbox")}
				value={normalized.sandbox.value}
				onValueChange={(value) => normalized.sandbox?.onValueChange(value as AgentSandbox)}
				options={[
					{ value: "plan", label: t("runtimePicker.sandboxPlan") },
					{ value: "read-only", label: t("runtimePicker.sandboxReadOnly") },
					{ value: "workspace-write", label: t("runtimePicker.sandboxWorkspaceWrite") },
					{ value: "danger-full-access", label: t("runtimePicker.sandboxFullAccess") },
				]}
			/>
		),
		hasEffort && normalized.effort && (
			<CliOptionSelect
				key="effort"
				aria-label={t("runtimePicker.effort")}
				value={normalized.effort.value || "__default__"}
				onValueChange={(value) =>
					normalized.effort?.onValueChange(value === "__default__" ? "" : value)
				}
				options={effortOptions(t, normalized.effort.efforts)}
			/>
		),
	]

	if (!items.some(Boolean)) return null

	return <SessionConfigToolbarRow items={items} />
}

export function RuntimeConfigToolbar(props: RuntimeConfigToolbarProps) {
	return <RuntimeToolbarSectionsView sections={props.sections} />
}

/**
 * @deprecated CliSessionToolbar is a thin alias of RuntimeConfigToolbar so
 * existing imports keep working. All runtimes share this chrome.
 */
export function CliSessionToolbar(props: RuntimeConfigToolbarProps) {
	return <RuntimeConfigToolbar {...props} />
}
