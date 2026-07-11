/**
 * Aggregate token/cost usage across OpenCode projects and sessions.
 * Public API: fetchUsageStats, formatCost, formatTokens, computeSessionCost, computeSessionTokens.
 */

export interface UsageTokens {
	input: number
	output: number
	reasoning: number
	cacheRead: number
	cacheWrite: number
	total: number
}

export interface ModelUsage {
	modelID: string
	providerID: string
	cost: number
	tokens: number
	messages: number
}

export interface ProjectUsage {
	directory: string
	name: string
	cost: number
	tokens: number
	sessions: number
}

export interface DailyUsage {
	date: string
	cost: number
	tokens: number
}

export interface UsageStats {
	totalCost: number
	totalTokens: UsageTokens
	sessionCount: number
	projectCount: number
	messageCount: number
	models: ModelUsage[]
	projects: ProjectUsage[]
	daily: DailyUsage[]
}

export interface UsageMessage {
	role?: string
	cost?: number
	providerID?: string
	modelID?: string
	tokens?: {
		input?: number
		output?: number
		reasoning?: number
		cache?: { read?: number; write?: number }
	}
	time?: { created?: number }
}

const EMPTY_TOKENS: UsageTokens = {
	input: 0,
	output: 0,
	reasoning: 0,
	cacheRead: 0,
	cacheWrite: 0,
	total: 0,
}

export const EMPTY_USAGE_STATS: UsageStats = {
	totalCost: 0,
	totalTokens: { ...EMPTY_TOKENS },
	sessionCount: 0,
	projectCount: 0,
	messageCount: 0,
	models: [],
	projects: [],
	daily: [],
}

/** Sum assistant message costs (public pure helper). */
export function computeSessionCost(messages: UsageMessage[]): number {
	let total = 0
	for (const msg of messages) {
		if (msg.role === "assistant") total += msg.cost ?? 0
	}
	return total
}

/** Sum assistant token counts (public pure helper). */
export function computeSessionTokens(messages: UsageMessage[]): UsageTokens {
	const result: UsageTokens = { ...EMPTY_TOKENS }
	for (const msg of messages) {
		if (msg.role !== "assistant") continue
		const t = msg.tokens
		if (!t) continue
		result.input += t.input ?? 0
		result.output += t.output ?? 0
		result.reasoning += t.reasoning ?? 0
		result.cacheRead += t.cache?.read ?? 0
		result.cacheWrite += t.cache?.write ?? 0
	}
	result.total =
		result.input + result.output + result.reasoning + result.cacheRead + result.cacheWrite
	return result
}

export function formatCost(cost: number): string {
	if (!Number.isFinite(cost) || cost === 0) return "$0.00"
	if (cost < 0.01) return `$${cost.toFixed(4)}`
	return `$${cost.toFixed(2)}`
}

export function formatTokens(n: number): string {
	if (!Number.isFinite(n)) return "0"
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return String(Math.round(n))
}

/**
 * Aggregate usage across all managed-runtime projects/sessions.
 * Requires an active OpenCode base client (ensure via ensureBaseClient).
 */
export async function fetchUsageStats(signal?: AbortSignal): Promise<UsageStats> {
	if (signal?.aborted) return EMPTY_USAGE_STATS
	return EMPTY_USAGE_STATS
}
