import type { AgentRuntimeDescriptor } from "../../preload/api"

type RuntimeModel = AgentRuntimeDescriptor["models"][number]

const PREFERRED_MODEL_ORDER: Partial<Record<string, readonly string[]>> = {
	codex: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"],
	claude: ["sonnet", "opus", "haiku", "fable"],
}

export function availableRuntimeModels(
	descriptor: Pick<AgentRuntimeDescriptor, "models"> | null | undefined,
): RuntimeModel[] {
	return (descriptor?.models ?? []).filter((model) => model.slug.trim().length > 0)
}

export function getRuntimeModelEfforts(
	descriptor: Pick<AgentRuntimeDescriptor, "id" | "models"> | null | undefined,
	modelSlug: string | null | undefined,
): string[] {
	const resolved = resolveRuntimeModel(descriptor, modelSlug)
	if (!resolved) return []
	return availableRuntimeModels(descriptor).find((model) => model.slug === resolved)?.efforts ?? []
}

export function resolveRuntimeModel(
	descriptor: Pick<AgentRuntimeDescriptor, "id" | "models"> | null | undefined,
	selectedModel: string | null | undefined,
): string | undefined {
	const models = availableRuntimeModels(descriptor)
	if (!models.length) return undefined

	const trimmed = selectedModel?.trim()
	if (trimmed && models.some((model) => model.slug === trimmed)) {
		return trimmed
	}

	for (const slug of PREFERRED_MODEL_ORDER[descriptor?.id ?? ""] ?? []) {
		if (models.some((model) => model.slug === slug)) {
			return slug
		}
	}

	return models[0]?.slug
}

export function resolveRuntimeEffort(
	descriptor: Pick<AgentRuntimeDescriptor, "id" | "models"> | null | undefined,
	modelSlug: string | null | undefined,
	selectedEffort: string | null | undefined,
): string | undefined {
	const trimmed = selectedEffort?.trim()
	if (!trimmed) return undefined
	const efforts = getRuntimeModelEfforts(descriptor, modelSlug)
	return efforts.includes(trimmed) ? trimmed : undefined
}
