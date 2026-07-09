/**
 * OpenCode plugin list management via config.get / config.update.
 * Public API: listPlugins, addPlugin, removePlugin.
 */
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { getBaseClient } from "./connection-manager"

type PluginEntry = string | [string, { [key: string]: unknown }]

function pluginName(entry: PluginEntry): string {
	return typeof entry === "string" ? entry : entry[0]
}

async function readConfig(client: OpencodeClient): Promise<{ plugin?: PluginEntry[] }> {
	const result = await client.config.get()
	return (result.data as { plugin?: PluginEntry[] }) ?? {}
}

/** List configured plugin package names / paths. */
export async function listPlugins(): Promise<string[]> {
	const client = getBaseClient()
	if (!client) throw new Error("Not connected to managed runtime server")
	const config = await readConfig(client)
	return (config.plugin ?? []).map(pluginName)
}

/** Add a plugin npm package or local path. */
export async function addPlugin(name: string): Promise<string[]> {
	const trimmed = name.trim()
	if (!trimmed) throw new Error("Plugin name is required")
	const client = getBaseClient()
	if (!client) throw new Error("Not connected to managed runtime server")
	const config = await readConfig(client)
	const entries: PluginEntry[] = [...(config.plugin ?? [])]
	if (entries.some((e) => pluginName(e) === trimmed)) {
		throw new Error(`"${trimmed}" is already installed`)
	}
	entries.push(trimmed)
	await client.config.update({ config: { ...config, plugin: entries } })
	return entries.map(pluginName)
}

/** Remove a plugin by name. */
export async function removePlugin(name: string): Promise<string[]> {
	const client = getBaseClient()
	if (!client) throw new Error("Not connected to managed runtime server")
	const config = await readConfig(client)
	const entries = (config.plugin ?? []).filter((e) => pluginName(e) !== name)
	await client.config.update({ config: { ...config, plugin: entries } })
	return entries.map(pluginName)
}
