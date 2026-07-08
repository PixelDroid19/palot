import { useCallback, useEffect, useRef, useState } from "react"
import { computeSessionCost, computeSessionTokens } from "../lib/session-metrics"
import type { Message } from "../lib/types"
import { getBaseClient, getProjectClient } from "../services/connection-manager"
import { listProjects, listSessions } from "../services/project-runtime"

// ============================================================
// Types
// ============================================================

/** SDK session.messages() returns entries shaped as { info, parts }. */
interface MessageEntry {
	info: Message
	parts: unknown[]
}

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

/** Cost per calendar day (YYYY-MM-DD), sorted ascending. */
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

const EMPTY_TOKENS: UsageTokens = {
	input: 0,
	output: 0,
	reasoning: 0,
	cacheRead: 0,
	cacheWrite: 0,
	total: 0,
}

const EMPTY_STATS: UsageStats = {
	totalCost: 0,
	totalTokens: { ...EMPTY_TOKENS },
	sessionCount: 0,
	projectCount: 0,
	messageCount: 0,
	models: [],
	projects: [],
	daily: [],
}

// ============================================================
// Concurrency-limited map
// ============================================================

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
	const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
	await Promise.all(workers)
	return results
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

// ============================================================
// Aggregation
// ============================================================

async function aggregate(signal: AbortSignal): Promise<UsageStats> {
	const baseClient = getBaseClient()
	if (!baseClient) throw new Error("Not connected to OpenCode server")

	const projects = await listProjects(baseClient)
	if (signal.aborted) return EMPTY_STATS

	const totalTokens: UsageTokens = { ...EMPTY_TOKENS }
	const modelMap = new Map<string, ModelUsage>()
	const dailyMap = new Map<string, DailyUsage>()
	const projectUsage: ProjectUsage[] = []

	let totalCost = 0
	let sessionCount = 0
	let messageCount = 0

	for (const project of projects) {
		if (signal.aborted) break
		const client = getProjectClient(project.worktree) ?? baseClient
		let sessions: Awaited<ReturnType<typeof listSessions>> = []
		try {
			sessions = await listSessions(client, { limit: 1000 })
		} catch {
			continue
		}
		if (signal.aborted) break

		let projectCost = 0
		let projectTokens = 0

		const perSession = await mapPool(
			sessions,
			6,
			async (session) => {
				try {
					const result = await client.session.messages({ sessionID: session.id })
					const entries = (result.data as unknown as MessageEntry[]) ?? []
					return entries.map((e) => e.info)
				} catch {
					return [] as Message[]
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

				const key = `${msg.providerID}/${msg.modelID}`
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
						modelID: msg.modelID,
						providerID: msg.providerID,
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

// ============================================================
// Hook
// ============================================================

export function useUsageStats() {
	const [stats, setStats] = useState<UsageStats>(EMPTY_STATS)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const abortRef = useRef<AbortController | null>(null)

	const refresh = useCallback(async () => {
		abortRef.current?.abort()
		const abort = new AbortController()
		abortRef.current = abort

		setLoading(true)
		setError(null)
		try {
			const result = await aggregate(abort.signal)
			if (abort.signal.aborted) return
			setStats(result)
		} catch (err) {
			if (abort.signal.aborted) return
			setError(err instanceof Error ? err.message : "Failed to compute usage statistics")
		} finally {
			if (!abort.signal.aborted) setLoading(false)
		}
	}, [])

	useEffect(() => {
		refresh()
		return () => abortRef.current?.abort()
	}, [refresh])

	return { stats, loading, error, refresh }
}
