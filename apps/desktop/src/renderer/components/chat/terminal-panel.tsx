/**
 * Embedded terminal panel — a real shell (PTY in the main process) rendered
 * with xterm.js, opened in the chat's working directory. Gives every session
 * an in-app terminal already `cd`'d into the project, instead of copying an
 * `opencode attach` command to paste elsewhere.
 */
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { useEffect, useRef } from "react"

const isElectron = typeof window !== "undefined" && "palot" in window

/** Terminal theme tuned to the app's dark surface. */
const THEME = {
	background: "#00000000",
	foreground: "#e4e4e7",
	cursor: "#e4e4e7",
	selectionBackground: "#3f3f46",
	black: "#18181b",
	brightBlack: "#52525b",
}

export function TerminalPanel({ sessionId, cwd }: { sessionId: string; cwd: string }) {
	const containerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isElectron || !containerRef.current) return
		// One PTY per session, keyed so re-mounting the panel reattaches rather
		// than spawning a second shell.
		const id = `term-${sessionId}`
		const term = new Terminal({
			fontFamily:
				'"Geist Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
			fontSize: 12,
			cursorBlink: true,
			allowTransparency: true,
			theme: THEME,
			scrollback: 5000,
		})
		const fit = new FitAddon()
		term.loadAddon(fit)
		term.open(containerRef.current)
		fit.fit()

		const size = { cols: term.cols, rows: term.rows }
		window.palot.terminal.create(id, cwd, size)

		// PTY output → terminal.
		const offData = window.palot.terminal.onData((tid, data) => {
			if (tid === id) term.write(data)
		})
		const offExit = window.palot.terminal.onExit((tid) => {
			if (tid === id) term.write("\r\n\x1b[90m[process exited — reopen the terminal to start again]\x1b[0m\r\n")
		})
		// Keystrokes → PTY.
		const inputDisposable = term.onData((data) => window.palot.terminal.input(id, data))

		// Keep the PTY sized to the panel.
		const resize = () => {
			try {
				fit.fit()
				window.palot.terminal.resize(id, term.cols, term.rows)
			} catch {
				// Panel not laid out yet.
			}
		}
		const observer = new ResizeObserver(resize)
		observer.observe(containerRef.current)
		// Initial fit after layout settles.
		const raf = requestAnimationFrame(resize)

		return () => {
			cancelAnimationFrame(raf)
			observer.disconnect()
			offData()
			offExit()
			inputDisposable.dispose()
			// Kill the PTY when the panel closes so shells don't leak.
			window.palot.terminal.kill(id)
			term.dispose()
		}
	}, [sessionId, cwd])

	if (!isElectron) {
		return (
			<div className="flex h-full items-center justify-center p-4 text-muted-foreground text-sm">
				The terminal is only available in the desktop app.
			</div>
		)
	}

	return <div ref={containerRef} className="h-full w-full overflow-hidden p-2" />
}
