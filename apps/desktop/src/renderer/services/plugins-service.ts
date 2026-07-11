/**
 * OpenCode plugin list management via config.get / config.update.
 * Public API: listPlugins, addPlugin, removePlugin.
 */
const MANAGED_RUNTIME_UNAVAILABLE =
	"Plugin management requires the retired OpenCode HTTP runtime. Use the agent-session CLI runtime."

/** List configured plugin package names / paths. */
export async function listPlugins(): Promise<string[]> {
	throw new Error(MANAGED_RUNTIME_UNAVAILABLE)
}

/** Add a plugin npm package or local path. */
export async function addPlugin(name: string): Promise<string[]> {
	const trimmed = name.trim()
	if (!trimmed) throw new Error("Plugin name is required")
	throw new Error(MANAGED_RUNTIME_UNAVAILABLE)
}

/** Remove a plugin by name. */
export async function removePlugin(name: string): Promise<string[]> {
	if (!name.trim()) throw new Error("Plugin name is required")
	throw new Error(MANAGED_RUNTIME_UNAVAILABLE)
}
