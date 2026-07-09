/**
 * Aggregate token/cost usage across OpenCode projects and sessions.
 * Public API: fetchUsageStats, formatCost, formatTokens, computeSessionCost, computeSessionTokens.
 */
import { getBaseClient, getProjectClient } from "./connection-manager"
import { listRuntimeProjects, listSessions } from "./project-runtime-sdk"

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

function toDateKey(epochMs: number): string {
	const d = new Date(epochMs)
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, "0")
	const day = String(d.getDate()).padStart(2, "0")
	return `${y}-${m}-${day}`
}

function projectName(worktree: string): string {
	const parts = worktree.replace(/\/+$/, "").split("/")
	return parts[parts.length - 1] || worktree
}

async function mapPool<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
	signal?: AbortSignal,
): Promise<R[]> {
	const results: R[] = new Array(items.length)
	let cursor = 0
	async function worker() {
		while (cursor < items.length) {
			if (signal?.aborted) return
			const index = cursor++
			results[index] = await fn(items[index])
		}
	}
	const workers = Array.from({ length: Math.min(limit, items.length || 1) }, () => worker())
	await Promise.all(workers)
	return results
}

/**
 * Aggregate usage across all managed-runtime projects/sessions.
 * Requires an active OpenCode base client (ensure via ensureBaseClient).
 */
export async function fetchUsageStats(signal?: AbortSignal): Promise<UsageStats> {
	const baseClient = getBaseClient()
	if (!baseClient) throw new Error("Not connected to managed runtime server")

	const projects = await listRuntimeProjects(baseClient)
	if (signal?.aborted) return EMPTY_USAGE_STATS

	const totalTokens: UsageTokens = { ...EMPTY_TOKENS }
	const modelMap = new Map<string, ModelUsage>()
	const dailyMap = new Map<string, DailyUsage>()
	const projectUsage: ProjectUsage[] = []

	let totalCost = 0
	let sessionCount = 0
	let messageCount = 0

	for (const project of projects) {
		if (signal?.aborted) break
		const client = getProjectClient(project.worktree) ?? baseClient
		let sessions: Awaited<ReturnType<typeof listSessions>> = []
		try {
			sessions = await listSessions(client, { limit: 1000 })
		} catch {
			continue
		}
		if (signal?.aborted) break

		let projectCost = 0
		let projectTokens = 0

		const perSession = await mapPool(
			sessions,
			6,
			async (session) => {
				try {
					const result = await client.session.messages({ sessionID: session.id })
					const entries = (result.data as Array<{ info?: UsageMessage }> | undefined) ?? []
					return entries.map((e) => e.info ?? (e as UsageMessage))
				} catch {
					return [] as UsageMessage[]
				}
			},
			signal,
		)

		for (const messages of perSession) {
			const cost = computeSessionCost(messages)
			const tokens = computeSessionTokens(messages)

			totalCost += cost
			projectCost += cost
			projectTokens += tokens.total
			totalTokens.input += tokens.input
			totalTokens.output += tokens.output
			totalTokens.reasoning += tokens.reasoning
			totalTokens.cacheRead += tokens.cacheRead
			totalTokens.cacheWrite += tokens.cacheWrite

			for (const msg of messages) {
				if (msg.role !== "assistant") continue
				messageCount++
				const key = `${msg.providerID || "?"}/${msg.modelID || "?"}`
				const t = msg.tokens
				const msgTokens = t
					? (t.input ?? 0) +
						(t.output ?? 0) +
						(t.reasoning ?? 0) +
						(t.cache?.read ?? 0) +
						(t.cache?.write ?? 0)
					: 0
				const existing = modelMap.get(key)
				if (existing) {
					existing.cost += msg.cost ?? 0
					existing.tokens += msgTokens
					existing.messages++
				} else {
					modelMap.set(key, {
						modelID: msg.modelID || "unknown",
						providerID: msg.providerID || "unknown",
						cost: msg.cost ?? 0,
						tokens: msgTokens,
						messages: 1,
					})
				}

				const created = msg.time?.created
				if (typeof created === "number") {
					const dateKey = toDateKey(created)
					const day = dailyMap.get(dateKey)
					if (day) {
						day.cost += msg.cost ?? 0
						day.tokens += msgTokens
					} else {
						dailyMap.set(dateKey, {
							date: dateKey,
							cost: msg.cost ?? 0,
							tokens: msgTokens,
						})
					}
				}
			}
		}

		sessionCount += sessions.length
		if (sessions.length > 0) {
			totalTokens.total += projectTokens
			projectUsage.push({
				directory: project.worktree,
				name: projectName(project.worktree),
				cost: projectCost,
				tokens: projectTokens,
				sessions: sessions.length,
			})
		}
	}

	return {
		totalCost,
		totalTokens,
		sessionCount,
		projectCount: projects.length,
		messageCount,
		models: [...modelMap.values()].sort((a, b) => b.cost - a.cost),
		projects: projectUsage.sort((a, b) => b.cost - a.cost),
		daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
	}
}
