import { Button } from "@gcode/ui/components/button"
import { Input } from "@gcode/ui/components/input"
import { Loader2Icon, PackageIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { usePlugins } from "../../hooks/use-plugins"
import { SettingsSection } from "./settings-section"

export function PluginsSettings() {
	const { plugins, loading, saving, error, refresh, addPlugin, removePlugin } = usePlugins()
	const [draft, setDraft] = useState("")

	const handleAdd = async () => {
		if (!draft.trim()) return
		await addPlugin(draft)
		setDraft("")
	}

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">Plugins</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage plugins for the project runtime. Add an npm package name (e.g.
						<code>opencode-plugin-x</code>) or a local file path.
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={refresh} disabled={loading || saving}>
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

			<SettingsSection
				title="Add a plugin"
				description="Changes are written to the global project runtime config and take effect after the server restarts."
			>
				<div className="flex items-center gap-2 px-4 py-3">
					<Input
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault()
								handleAdd()
							}
						}}
						placeholder="opencode-plugin-name or ./path/to/plugin.js"
						disabled={saving}
					/>
					<Button onClick={handleAdd} disabled={saving || !draft.trim()}>
						{saving ? (
							<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
						) : (
							<PlusIcon aria-hidden="true" className="size-4" />
						)}
						Add
					</Button>
				</div>
			</SettingsSection>

			<SettingsSection title="Installed">
				{loading && plugins.length === 0 ? (
					<div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
						<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
						Loading plugins…
					</div>
				) : plugins.length === 0 ? (
					<div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
						<PackageIcon aria-hidden="true" className="size-6 opacity-50" />
						No plugins installed yet.
					</div>
				) : (
					plugins.map((plugin) => (
						<div key={plugin} className="flex items-center justify-between gap-4 px-4 py-3">
							<div className="flex min-w-0 items-center gap-2">
								<PackageIcon
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground"
								/>
								<span className="truncate font-mono text-sm">{plugin}</span>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => removePlugin(plugin)}
								disabled={saving}
								aria-label={`Remove ${plugin}`}
							>
								<Trash2Icon aria-hidden="true" className="size-4 text-destructive" />
							</Button>
						</div>
					))
				)}
			</SettingsSection>
		</div>
	)
}
