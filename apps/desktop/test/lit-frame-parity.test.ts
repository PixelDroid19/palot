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
		expect(home).toContain('class="project-name"')
		expect(home).toContain("No workspaces visible yet.")
		expect(home).toContain('class="config-toolbar"')
		expect(home).toContain('class="status-bar"')
		expect(home).toContain('aria-label="Model"')
		expect(home).toContain('aria-label="Sandbox mode"')
		expect(home).toContain('aria-label="Reasoning effort"')
		expect(home).toContain('emitBubbled(this, "gcode-home-submit"')
		expect(home).not.toContain('class="start"')
		expect(home).not.toContain("workingDirLabel")
		expect(home).not.toContain("pickDirectory")
		expect(styles).not.toContain(".directory-control")
		expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))")
		expect(styles).toContain(".composer-area")
		expect(styles).toContain("box-sizing: border-box")
		expect(styles).toContain("width: min(896px, 100%)")
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
		expect(app).toContain('gcode-home-submit')
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
		expect(sidebar).toContain("selectTimelineTasks")
		expect(sidebar).toContain("filterTasksByQuery")
		expect(sidebar).toContain("groupTasksByWorkspace")
		expect(sidebar).toContain('aria-label="Search tasks"')
		expect(sidebar).toContain('role="tablist"')
		expect(sidebar).toContain('class="project"')
		expect(read("lit/components/gcode-sidebar.scss")).toContain(".catalog-controls")
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
		const composer = read("lit/components/gcode-composer.ts")
		const controls = read("lit/components/gcode-session-controls.ts")
		const sessions = read("lit/session-store.ts")
		expect(composer).toContain("gcode-session-controls")
		expect(composer).toContain('aria-label="Submit"')
		expect(read("lit/components/gcode-composer.scss")).toContain(".status-bar")
		expect(read("lit/components/gcode-composer.scss")).toContain("padding: 8px 16px 16px")
		expect(controls).toContain("describeRuntimes")
		expect(controls).toContain("selectedModel?.efforts")
		expect(controls).toContain("switchLitRuntime")
		expect(controls).toContain("updateMeta")
		expect(sessions).toContain("updateMeta(")
		expect(app).not.toContain("<gcode-session-controls")
	})

	test("Lit session composer keeps its toolbar usable at narrow widths", () => {
		const composerStyles = read("lit/components/gcode-composer.scss")
		const controlsStyles = read("lit/components/gcode-session-controls.scss")
		expect(composerStyles).toContain("overflow-x: auto")
		expect(composerStyles).toContain("flex: 0 0 32px")
		expect(controlsStyles).toContain("width: max-content")
	})

	test("Lit chat renders tool events through the shared tool-card chrome", () => {
		const chat = read("lit/components/gcode-chat-panel.ts")
		const styles = read("lit/components/gcode-chat-panel.scss")
		expect(chat).toContain('import "./gcode-tool-card"')
		expect(chat).toContain("<gcode-tool-card")
		expect(chat).toContain('slot="icon"')
		expect(chat).toContain("renderToolIcon")
		expect(chat).toContain('stroke="currentColor"')
		expect(chat).toContain("card-title=${t.name}")
		expect(chat).toContain('t.status === "failed" ? "error" : t.status')
		expect(styles).not.toContain(".tool-card")
	})

	test("Lit permission requests use the shared CLI approval surface", () => {
		const chat = read("lit/components/gcode-chat-panel.ts")
		expect(chat).toContain('import "./gcode-cli-approval"')
		expect(chat).toContain("<gcode-cli-approval")
		expect(chat).toContain("gcode-permission-decision")
		expect(chat).not.toContain('data-testid="permission-gate"')
	})

	test("Lit app bar keeps React-style inline session renaming", () => {
		const app = read("lit/components/gcode-app.ts")
		const sessions = read("lit/session-store.ts")
		expect(app).toContain("editingSessionTitle")
		expect(app).toContain("renameSession")
		expect(sessions).toContain("rename(sessionId")
	})

	test("Lit session app bar mirrors the React breadcrumb and close affordance", () => {
		const app = read("lit/components/gcode-app.ts")
		const styles = read("lit/components/gcode-app.scss")
		expect(app).toContain('class="appbar-project"')
		expect(app).toContain('class="appbar-actions"')
		expect(app).toContain('class="appbar-close"')
		expect(app).toContain('navigate("/")')
		expect(styles).toContain(".appbar-project")
		expect(styles).toContain(".appbar-actions")
		expect(styles).toContain(".appbar-close")
	})

	test("Lit shell owns the command palette and its session navigation", () => {
		const app = read("lit/components/gcode-app.ts")
		const palette = read("lit/components/gcode-command-palette.ts")
		expect(app).toContain("gcode-command-palette")
		expect(app).toContain("paletteOpen")
		expect(palette).toContain("Search sessions and actions")
		expect(palette).toContain("this.select(`/session/${session.id}`)")
		expect(palette).not.toMatch(/from [\"']react/)
	})

	test("automations mirrors the React inbox split instead of a flat page", () => {
		const automation = read("lit/components/gcode-automations.ts")
		const styles = read("lit/components/gcode-automations.scss")
		expect(automation).toContain('class="automation-shell"')
		expect(automation).toContain('class="inbox-panel"')
		expect(automation).toContain('class="detail-panel"')
		expect(styles).toContain("width: 35%")
		expect(styles).toContain(".detail-empty")
		expect(automation).toContain("selectedRunId")
		expect(automation).toContain("renderRunDetail")
		expect(automation).toContain("navigate(`/session/${run.sessionId}`)")
		expect(automation).toContain('class="create-backdrop"')
		expect(automation).toContain('role="dialog"')
		expect(styles).toContain(".create-dialog")
	})

	test("onboarding uses React-like progress and a centered step surface", () => {
		const onboarding = read("lit/components/gcode-onboarding.ts")
		const styles = read("lit/components/gcode-onboarding.scss")
		expect(onboarding).toContain("Your native workspace for multiple coding runtimes.")
		expect(onboarding).toContain("GCode unifies OpenCode, Codex, Claude Code")
		expect(onboarding).toContain('class="progress"')
		expect(onboarding).toContain('class="step-area"')
		expect(onboarding).toContain("Get Started")
		expect(styles).toContain(".dots")
		expect(styles).toContain(".step-content")
	})
})
