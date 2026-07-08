import type { AgentRuntimeDescriptor, AgentSandbox } from "../../../preload/api"
import type { ModelRef, ProvidersData, SdkAgent } from "../../hooks/use-project-runtime-data"
import { useTranslation } from "../../i18n/use-translation"
import { CliModelSelect, CliOptionSelect } from "./cli-toolbar"
import { AgentSelector, ModelSelector, VariantSelector } from "./prompt-toolbar"
import { SessionConfigToolbarRow } from "./session-config-toolbar-row"

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

export interface RuntimeToolbarAgentSection {
	agents: SdkAgent[]
	selectedAgent: string | null
	defaultAgent?: string
	onSelectAgent: (agentName: string) => void
	disabled?: boolean
}

export interface RuntimeToolbarProjectModelSection {
	providers: ProvidersData | null
	effectiveModel: ModelRef | null
	hasOverride: boolean
	onSelectModel: (model: ModelRef | null) => void
	recentModels?: ModelRef[]
	disabled?: boolean
}

export interface RuntimeToolbarVariantSection {
	variants: string[]
	selectedVariant: string | undefined
	onSelectVariant: (variant: string | undefined) => void
	disabled?: boolean
}

export interface RuntimeToolbarCliModelSection {
	models: AgentRuntimeDescriptor["models"]
	value: string
	onValueChange: (value: string) => void
}

export interface RuntimeToolbarSandboxSection {
	value: AgentSandbox
	onValueChange: (value: AgentSandbox) => void
}

export interface RuntimeToolbarEffortSection {
	efforts: string[]
	value: string
	onValueChange: (value: string) => void
}

export interface RuntimeToolbarSections {
	agent?: RuntimeToolbarAgentSection
	projectModel?: RuntimeToolbarProjectModelSection
	variant?: RuntimeToolbarVariantSection
	cliModel?: RuntimeToolbarCliModelSection
	sandbox?: RuntimeToolbarSandboxSection
	effort?: RuntimeToolbarEffortSection
}

export interface RuntimeConfigToolbarProps {
	sections: RuntimeToolbarSections
}

function RuntimeToolbarSectionsView({ sections }: { sections: RuntimeToolbarSections }) {
	const { t } = useTranslation()
	const hasEffort = (sections.effort?.efforts.length ?? 0) > 0
	const items = [
		sections.agent && (
			<AgentSelector
				agents={sections.agent.agents}
				selectedAgent={sections.agent.selectedAgent}
				defaultAgent={sections.agent.defaultAgent}
				onSelectAgent={sections.agent.onSelectAgent}
				disabled={sections.agent.disabled}
			/>
		),
		sections.projectModel && (
			<ModelSelector
				providers={sections.projectModel.providers}
				effectiveModel={sections.projectModel.effectiveModel}
				hasOverride={sections.projectModel.hasOverride}
				onSelectModel={sections.projectModel.onSelectModel}
				recentModels={sections.projectModel.recentModels}
				disabled={sections.projectModel.disabled}
			/>
		),
		sections.cliModel && (
			<CliModelSelect
				models={sections.cliModel.models}
				value={sections.cliModel.value}
				onValueChange={sections.cliModel.onValueChange}
			/>
		),
		sections.variant && (
			<VariantSelector
				variants={sections.variant.variants}
				selectedVariant={sections.variant.selectedVariant}
				onSelectVariant={sections.variant.onSelectVariant}
				disabled={sections.variant.disabled}
			/>
		),
		sections.sandbox && (
			<CliOptionSelect
				aria-label={t("runtimePicker.sandbox")}
				value={sections.sandbox.value}
				onValueChange={(value) => sections.sandbox?.onValueChange(value as AgentSandbox)}
				options={[
					{ value: "plan", label: t("runtimePicker.sandboxPlan") },
					{ value: "read-only", label: t("runtimePicker.sandboxReadOnly") },
					{ value: "workspace-write", label: t("runtimePicker.sandboxWorkspaceWrite") },
					{ value: "danger-full-access", label: t("runtimePicker.sandboxFullAccess") },
				]}
			/>
		),
		hasEffort && sections.effort && (
			<CliOptionSelect
				aria-label={t("runtimePicker.effort")}
				value={sections.effort.value || "__default__"}
				onValueChange={(value) =>
					sections.effort?.onValueChange(value === "__default__" ? "" : value)
				}
				options={cliEffortOptions(t, sections.effort.efforts)}
			/>
		),
	]

	if (!items.some(Boolean)) return null

	return (
		<SessionConfigToolbarRow items={items} />
	)
}

export function RuntimeConfigToolbar(props: RuntimeConfigToolbarProps) {
	return <RuntimeToolbarSectionsView sections={props.sections} />
}
