/**
 * Guardrails for the Lit shell's React-reference geometry.
 * Visual screenshots remain the authoritative parity evidence; these checks
 * stop accidental reintroduction of the prototype card layout.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const renderer = path.resolve(import.meta.dir, "../src/renderer")

function read(relative: string): string {
	return readFileSync(path.join(renderer, relative), "utf8")
}

describe("Lit app-frame parity contract", () => {
	test("uses the React reference frame dimensions and Cortex tokens", () => {
		const tokens = read("lit/styles/_tokens.scss")
		const appStyles = read("lit/components/gcode-app.scss")
		expect(tokens).toContain("--gcode-sidebar-width: 280px")
		expect(tokens).toContain("--gcode-titlebar-height: 46px")
		expect(tokens).toContain("--gcode-bg: #181818")
		expect(tokens).toContain("--gcode-sidebar: #0d0d0d")
		expect(appStyles).toContain(".appbar")
		expect(appStyles).toContain(".window-controls")
	})

	test("home retains the React prompt catalogue and bottom composer hierarchy", () => {
		const home = read("lit/components/gcode-home.ts")
		const styles = read("lit/components/gcode-home.scss")
		expect(home).toContain("Build what's next")
		expect(home).toContain("What should this session work on?")
		expect(home).toContain("No workspaces visible yet")
		expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))")
		expect(styles).toContain(".composer-area")
	})

	test("the Lit tree remains free of React runtime imports", () => {
		for (const relative of [
			"lit/components/gcode-app.ts",
			"lit/components/gcode-home.ts",
			"lit/components/gcode-sidebar.ts",
		]) {
			const source = read(relative)
			expect(source).not.toMatch(/from ["']react|from ["']jotai|@tanstack\/react/)
		}
	})

	test("settings owns its dedicated sidebar instead of nesting under sessions", () => {
		const app = read("lit/components/gcode-app.ts")
		const settings = read("lit/components/gcode-settings-panel.ts")
		expect(app).toContain('const settingsRoute = this.route.name === "settings"')
		expect(app).toContain("const showSidebar = !hideChrome && !settingsRoute")
		expect(settings).toContain('class="back" href="#/"')
		expect(settings).toContain('href=${`#/settings/${s}`}')
		expect(read("lit/components/gcode-settings-panel.scss")).toContain(
			"margin: 0 auto",
		)
	})

	test("settings preserves every React settings destination and setup recovery actions", () => {
		const settings = read("lit/components/gcode-settings-panel.ts")
		expect(settings).toContain('"worktrees"')
		expect(settings).toContain('"setup"')
		expect(settings).toContain("loadRuntimeSetupStatuses")
		expect(settings).toContain("restoreBackup")
		expect(settings).toContain("markOnboardingIncomplete")
	})

	test("session uses the shared app bar and a single bottom composer", () => {
		const app = read("lit/components/gcode-app.ts")
		const chat = read("lit/components/gcode-chat-panel.ts")
		const chatStyles = read("lit/components/gcode-chat-panel.scss")
		expect(app).toContain('class="appbar-session"')
		expect(app).toContain('get("fixture") === "chat"')
		expect(chat).not.toContain('class="topbar"')
		expect(chatStyles).toContain("max-width: 896px")
	})

	test("Lit route and session state cover the React project entry and live turn status", () => {
		const router = read("lit/router.ts")
		const sessions = read("lit/session-store.ts")
		const app = read("lit/components/gcode-app.ts")
		expect(router).toContain('name: "project"')
		expect(router).toContain('parts[0] === "project" && parts[1]')
		expect(sessions).toContain("updateStatus(sessionId")
		expect(app).toContain("sessionStore.updateStatus")
	})

	test("Lit sidebar uses the shared multi-runtime task catalogue", () => {
		const sidebar = read("lit/components/gcode-sidebar.ts")
		expect(sidebar).toContain("selectActiveSessions")
		expect(sidebar).toContain("selectRecentSessions")
		expect(sidebar).toContain("groupTasksByWorkspace")
		expect(sidebar).toContain('class="project"')
	})

	test("Lit session chrome owns the desktop terminal without React", () => {
		const app = read("lit/components/gcode-app.ts")
		const terminal = read("lit/components/gcode-terminal-panel.ts")
		expect(app).toContain("gcode-terminal-panel")
		expect(app).toContain("terminalOpen")
		expect(terminal).toContain("window.gcode.terminal.create")
		expect(terminal).toContain("@xterm/xterm")
		expect(terminal).not.toMatch(/from [\"']react/)
		expect(app).toContain('event.key.toLowerCase() !== "j"')
		expect(app).toContain("window.addEventListener(\"keydown\"")
	})

	test("Lit session chrome exposes descriptor-driven model, effort and sandbox controls", () => {
		const app = read("lit/components/gcode-app.ts")
		const controls = read("lit/components/gcode-session-controls.ts")
		const sessions = read("lit/session-store.ts")
		expect(app).toContain("gcode-session-controls")
		expect(controls).toContain("describeRuntimes")
		expect(controls).toContain("selectedModel?.efforts")
		expect(controls).toContain("switchLitRuntime")
		expect(controls).toContain("updateMeta")
		expect(sessions).toContain("updateMeta(")
	})

	test("Lit app bar keeps React-style inline session renaming", () => {
		const app = read("lit/components/gcode-app.ts")
		const sessions = read("lit/session-store.ts")
		expect(app).toContain("editingSessionTitle")
		expect(app).toContain("renameSession")
		expect(sessions).toContain("rename(sessionId")
	})

	test("automations mirrors the React inbox split instead of a flat page", () => {
		const automation = read("lit/components/gcode-automations.ts")
		const styles = read("lit/components/gcode-automations.scss")
		expect(automation).toContain('class="automation-shell"')
		expect(automation).toContain('class="inbox-panel"')
		expect(automation).toContain('class="detail-panel"')
		expect(styles).toContain("width: 35%")
		expect(styles).toContain(".detail-empty")
	})

	test("onboarding uses React-like progress and a centered step surface", () => {
		const onboarding = read("lit/components/gcode-onboarding.ts")
		const styles = read("lit/components/gcode-onboarding.scss")
		expect(onboarding).toContain('class="progress"')
		expect(onboarding).toContain('class="step-area"')
		expect(onboarding).toContain("Get Started")
		expect(styles).toContain(".dots")
		expect(styles).toContain(".step-content")
	})
})
