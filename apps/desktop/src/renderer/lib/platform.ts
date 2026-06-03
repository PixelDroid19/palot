/**
 * Host platform for renderer defaults (server labels, etc.).
 */

/** Returns Electron preload platform or a best-effort guess in browser dev mode. */
export function getRendererPlatform(): NodeJS.Platform {
	if (typeof window !== "undefined" && "palot" in window) {
		return window.palot.platform
	}
	if (typeof navigator !== "undefined") {
		const ua = navigator.userAgent.toLowerCase()
		if (ua.includes("mac")) return "darwin"
		if (ua.includes("win")) return "win32"
		if (ua.includes("linux")) return "linux"
	}
	return "linux"
}
