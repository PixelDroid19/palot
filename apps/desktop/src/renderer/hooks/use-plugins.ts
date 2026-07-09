import { useCallback, useEffect, useRef, useState } from "react"
import type { Config } from "../lib/types"
import { getBaseClient } from "../services/connection-manager"

type PluginConfigEntry = NonNullable<Config["plugin"]>[number]

function getPluginName(plugin: PluginConfigEntry): string {
	return typeof plugin === "string" ? plugin : plugin[0]
}

function getPluginEntries(config: Config): PluginConfigEntry[] {
	return [...(config.plugin ?? [])]
}

function getPluginNames(config: Config): string[] {
	return getPluginEntries(config).map(getPluginName)
}

// ============================================================
// Plugin management
//
// OpenCode loads plugins from the `plugin` array in its config
// (npm package names or local file paths). This hook reads and
// mutates the global config's plugin list via the SDK.
// ============================================================

async function readConfig(): Promise<Config> {
	const client = getBaseClient()
	if (!client) throw new Error("Not connected to OpenCode server")
	const result = await client.config.get()
	return (result.data as Config) ?? {}
}

async function writeConfig(config: Config): Promise<void> {
	const client = getBaseClient()
	if (!client) throw new Error("Not connected to OpenCode server")
	await client.config.update({ config })
}

export function usePlugins() {
	const [plugins, setPlugins] = useState<string[]>([])
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const configRef = useRef<Config>({})

	const refresh = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const config = await readConfig()
			configRef.current = config
			setPlugins(getPluginNames(config))
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load plugins")
		} finally {
			setLoading(false)
		}
	}, [])

	const persist = useCallback(async (next: PluginConfigEntry[]) => {
		setSaving(true)
		setError(null)
		try {
			const config: Config = { ...configRef.current, plugin: next }
			await writeConfig(config)
			configRef.current = config
			setPlugins(getPluginNames(config))
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save plugins")
			// Re-read to reflect the true on-disk state after a failed write.
			await refresh()
		} finally {
			setSaving(false)
		}
	}, [refresh])

	const addPlugin = useCallback(
		async (name: string) => {
			const trimmed = name.trim()
			if (!trimmed) return
			if (plugins.includes(trimmed)) {
				setError(`"${trimmed}" is already installed`)
				return
			}
			await persist([...getPluginEntries(configRef.current), trimmed])
		},
		[plugins, persist],
	)

	const removePlugin = useCallback(
		async (name: string) => {
			await persist(getPluginEntries(configRef.current).filter((plugin) => getPluginName(plugin) !== name))
		},
		[persist],
	)

	useEffect(() => {
		refresh()
	}, [refresh])

	return { plugins, loading, saving, error, refresh, addPlugin, removePlugin }
}
