/**
 * Minimal hash router for the Lit product shell.
 * Routes mirror the former React app surface.
 */
export type LitRoute =
	| { name: "home" }
	| { name: "project"; projectSlug: string }
	| { name: "session"; sessionId: string }
	| { name: "settings"; section: string }
	| { name: "automations" }
	| { name: "automation"; automationId: string }
	| { name: "onboarding" }
	| { name: "not-found" }

export function parseHash(hash: string = location.hash): LitRoute {
	const raw = (hash || "#/").replace(/^#/, "") || "/"
	const path = raw.startsWith("/") ? raw : `/${raw}`
	const parts = path.split("/").filter(Boolean)

	if (parts.length === 0) return { name: "home" }
	if (parts[0] === "onboarding") return { name: "onboarding" }
	if (parts[0] === "automations") {
		if (parts[1]) return { name: "automation", automationId: parts[1] }
		return { name: "automations" }
	}
	if (parts[0] === "settings") {
		return { name: "settings", section: parts[1] || "general" }
	}
	if (parts[0] === "session" && parts[1]) {
		return { name: "session", sessionId: parts[1] }
	}
	// The React tree renders NewChat for /project/$projectSlug and a shared
	// session view for /project/$projectSlug/session/$sessionId.
	if (parts[0] === "project" && parts[2] === "session" && parts[3]) {
		return { name: "session", sessionId: parts[3] }
	}
	if (parts[0] === "project" && parts[1]) {
		return { name: "project", projectSlug: parts[1] }
	}
	return { name: "not-found" }
}

export function navigate(to: string): void {
	const hash = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`
	if (location.hash === hash) {
		window.dispatchEvent(new HashChangeEvent("hashchange"))
		return
	}
	location.hash = hash
}

export function hrefForRoute(route: LitRoute): string {
	switch (route.name) {
		case "home":
			return "#/"
		case "project":
			return `#/project/${route.projectSlug}`
		case "session":
			return `#/session/${route.sessionId}`
		case "settings":
			return `#/settings/${route.section}`
		case "automations":
			return "#/automations"
		case "automation":
			return `#/automations/${route.automationId}`
		case "onboarding":
			return "#/onboarding"
		default:
			return "#/"
	}
}
