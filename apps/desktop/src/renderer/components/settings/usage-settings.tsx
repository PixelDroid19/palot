import { Button } from "@palot/ui/components/button"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useUsageStats } from "../../hooks/use-usage-stats"
import { formatCost, formatTokens, shortModelName } from "../../lib/session-metrics"
import { SettingsSection } from "./settings-section"

// ============================================================
// Summary stat card
// ============================================================

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div className="rounded-lg border border-border p-4">
			<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
			{hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
		</div>
	)
}

// ============================================================
// Mini bar chart for daily cost
// ============================================================

function DailyChart({
	daily,
}: {
	daily: { date: string; cost: number; tokens: number }[]
}) {
	const recent = daily.slice(-30)
	if (recent.length === 0) return null
	const max = Math.max(...recent.map((d) => d.cost), 0.0001)

	return (
		<div className="rounded-lg border border-border p-4">
			<div className="mb-3 text-sm font-medium">Cost over time (last 30 days)</div>
			<div className="flex h-32 items-end gap-1">
				{recent.map((d) => (
					<div
						key={d.date}
						className="group relative flex-1 rounded-sm bg-primary/70 transition-colors hover:bg-primary"
						style={{ height: `${Math.max((d.cost / max) * 100, 2)}%` }}
						title={`${d.date}: ${formatCost(d.cost)} · ${formatTokens(d.tokens)} tokens`}
					/>
				))}
			</div>
			<div className="mt-2 flex justify-between text-xs text-muted-foreground">
				<span>{recent[0]?.date}</span>
				<span>{recent[recent.length - 1]?.date}</span>
			</div>
		</div>
	)
}

// ============================================================
// Breakdown table
// ============================================================

function BreakdownTable({
	rows,
}: {
	rows: { key: string; label: string; sub?: string; cost: number; tokens: number }[]
}) {
	if (rows.length === 0) {
		return <p className="px-4 py-3 text-sm text-muted-foreground">No usage recorded yet.</p>
	}
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
						<th className="px-4 py-2 font-medium">Name</th>
						<th className="px-4 py-2 text-right font-medium">Tokens</th>
						<th className="px-4 py-2 text-right font-medium">Cost</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.key} className="border-b border-border last:border-0">
							<td className="px-4 py-2">
								<div className="font-medium">{row.label}</div>
								{row.sub && <div className="text-xs text-muted-foreground">{row.sub}</div>}
							</td>
							<td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
								{formatTokens(row.tokens)}
							</td>
							<td className="px-4 py-2 text-right tabular-nums">{formatCost(row.cost)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

// ============================================================
// Page
// ============================================================

export function UsageSettings() {
	const { stats, loading, error, refresh } = useUsageStats()

	const cacheHitRate =
		stats.totalTokens.cacheRead + stats.totalTokens.input > 0
			? (stats.totalTokens.cacheRead /
					(stats.totalTokens.cacheRead + stats.totalTokens.input)) *
				100
			: 0

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">Usage</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Aggregated cost and token usage across all projects and sessions.
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
					{loading ? (
						<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
					) : (
						<RefreshCwIcon aria-hidden="true" className="size-4" />
					)}
					Refresh
				</Button>
			</div>

			{error && (
				<div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{error}
				</div>
			)}

			{loading && stats.sessionCount === 0 ? (
				<div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
					<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
					Computing usage across all sessions…
				</div>
			) : (
				<>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<StatCard label="Total cost" value={formatCost(stats.totalCost)} />
						<StatCard label="Total tokens" value={formatTokens(stats.totalTokens.total)} />
						<StatCard
							label="Sessions"
							value={String(stats.sessionCount)}
							hint={`${stats.projectCount} projects`}
						/>
						<StatCard
							label="Cache hit rate"
							value={`${Math.round(cacheHitRate)}%`}
							hint={`${formatTokens(stats.totalTokens.cacheRead)} cached`}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<StatCard label="Input" value={formatTokens(stats.totalTokens.input)} />
						<StatCard label="Output" value={formatTokens(stats.totalTokens.output)} />
						<StatCard label="Reasoning" value={formatTokens(stats.totalTokens.reasoning)} />
						<StatCard
							label="Cache write"
							value={formatTokens(stats.totalTokens.cacheWrite)}
						/>
					</div>

					<DailyChart daily={stats.daily} />

					<SettingsSection title="By model">
						<BreakdownTable
							rows={stats.models.map((m) => ({
								key: `${m.providerID}/${m.modelID}`,
								label: shortModelName(m.modelID),
								sub: `${m.providerID} · ${m.messages} messages`,
								cost: m.cost,
								tokens: m.tokens,
							}))}
						/>
					</SettingsSection>

					<SettingsSection title="By project">
						<BreakdownTable
							rows={stats.projects.map((p) => ({
								key: p.directory,
								label: p.name,
								sub: `${p.sessions} sessions`,
								cost: p.cost,
								tokens: p.tokens,
							}))}
						/>
					</SettingsSection>
				</>
			)}
		</div>
	)
}
