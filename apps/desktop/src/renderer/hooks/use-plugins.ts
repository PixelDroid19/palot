import { useCallback, useEffect, useRef, useState } from "react"
import type { Config } from "../lib/types"
import { getBaseClient } from "../services/connection-manager"

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
			setPlugins([...(config.plugin ?? [])])
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load plugins")
		} finally {
			setLoading(false)
		}
	}, [])

	const persist = useCallback(async (next: string[]) => {
		setSaving(true)
		setError(null)
		try {
			const config: Config = { ...configRef.current, plugin: next }
			await writeConfig(config)
			configRef.current = config
			setPlugins(next)
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
			await persist([...plugins, trimmed])
		},
		[plugins, persist],
	)

	const removePlugin = useCallback(
		async (name: string) => {
			await persist(plugins.filter((p) => p !== name))
		},
		[plugins, persist],
	)

	useEffect(() => {
		refresh()
	}, [refresh])

	return { plugins, loading, saving, error, refresh, addPlugin, removePlugin }
}
