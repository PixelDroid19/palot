/**
 * Shared Vite resolve aliases for the desktop app.
 * Keep in sync with tsconfig.json paths (@desktop/shared, @desktop/preload).
 */

import path from "node:path"
import { fileURLToPath } from "node:url"

const DESKTOP_ROOT = path.dirname(fileURLToPath(import.meta.url))
export const DESKTOP_SRC = path.join(DESKTOP_ROOT, "src")
export const DESKTOP_SHARED_ENTRY = path.join(DESKTOP_SRC, "shared/index.ts")
export const DESKTOP_PRELOAD_ENTRY = path.join(DESKTOP_SRC, "preload/public-api.ts")

export interface DesktopAliasOptions {
	rendererRoot: string
	palotUiRoot: string
}

/** Vite `resolve.alias` entries (array form — required for reliable resolution). */
export function createDesktopAliases(options: DesktopAliasOptions) {
	const { rendererRoot } = options
	return [
		{ find: "@desktop/shared", replacement: DESKTOP_SHARED_ENTRY },
		{ find: "@desktop/preload", replacement: DESKTOP_PRELOAD_ENTRY },
		{ find: "@/features/automations", replacement: path.join(rendererRoot, "features/automations/index.ts") },
		{ find: "@/features/settings", replacement: path.join(rendererRoot, "features/settings/index.ts") },
		{ find: "@/features/onboarding", replacement: path.join(rendererRoot, "features/onboarding/index.ts") },
		{ find: "@/features/chat", replacement: path.join(rendererRoot, "features/chat/index.ts") },
		{ find: "@/components/public", replacement: path.join(rendererRoot, "components/public.ts") },
		{ find: "@/services", replacement: path.join(rendererRoot, "services") },
		{ find: "@/hooks", replacement: path.join(rendererRoot, "hooks") },
		{ find: "@/atoms", replacement: path.join(rendererRoot, "atoms") },
		{ find: "@/lib", replacement: path.join(rendererRoot, "lib") },
		{ find: "@", replacement: rendererRoot },
		{ find: "@palot/ui", replacement: options.palotUiRoot },
		// Platform packages (core pure, events bus, ipc contracts, adapters for mapping only, harness for tests, lit portable, tokens shared).
		// Wired per foundational monorepo integration + roadmap (Subagent-D closeout). Use only in renderer (or shared if pure); main process aliases limited to prevent misuse.
		{ find: "@palot/tokens", replacement: path.join(DESKTOP_ROOT, "../../packages/tokens/src/index.ts") },
		{ find: "@palot/lit-styles", replacement: path.join(DESKTOP_ROOT, "../../packages/lit-styles/src/index.ts") },
		{ find: "@palot/lit-components", replacement: path.join(DESKTOP_ROOT, "../../packages/lit-components/src/index.ts") },
		{ find: "@palot/events", replacement: path.join(DESKTOP_ROOT, "../../packages/events/src/index.ts") },
		{ find: "@palot/core", replacement: path.join(DESKTOP_ROOT, "../../packages/core/src/index.ts") },
		{ find: "@palot/agent-adapter-opencode", replacement: path.join(DESKTOP_ROOT, "../../packages/agent-adapter-opencode/src/index.ts") },
		{ find: "@palot/agent-harness", replacement: path.join(DESKTOP_ROOT, "../../packages/agent-harness/src/index.ts") },
		{ find: "@palot/ipc-contracts", replacement: path.join(DESKTOP_ROOT, "../../packages/ipc-contracts/src/index.ts") },
		// Subpath support for core exports (commands, sessions, view-models etc) and events if used directly.
		{ find: "@palot/core/commands", replacement: path.join(DESKTOP_ROOT, "../../packages/core/src/commands/index.ts") },
		{ find: "@palot/core/sessions", replacement: path.join(DESKTOP_ROOT, "../../packages/core/src/sessions/index.ts") },
		{ find: "@palot/core/view-models", replacement: path.join(DESKTOP_ROOT, "../../packages/core/src/view-models/index.ts") },
		{ find: "@palot/core/use-cases", replacement: path.join(DESKTOP_ROOT, "../../packages/core/src/use-cases/index.ts") },
		{ find: "@palot/core/events", replacement: path.join(DESKTOP_ROOT, "../../packages/core/src/events/index.ts") },
		{ find: "@palot/core/state", replacement: path.join(DESKTOP_ROOT, "../../packages/core/src/state.ts") },
	]
}

/** Allow Vite dev server to read sources outside `renderer/` root (shared, packages). */
export function desktopFsAllow(extraRoots: string[] = []) {
	return [DESKTOP_SRC, path.join(DESKTOP_ROOT, "../../packages"), ...extraRoots]
}