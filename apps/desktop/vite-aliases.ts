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
	]
}

/** Allow Vite dev server to read sources outside `renderer/` root (shared, packages). */
export function desktopFsAllow(extraRoots: string[] = []) {
	return [DESKTOP_SRC, path.join(DESKTOP_ROOT, "../../packages"), ...extraRoots]
}