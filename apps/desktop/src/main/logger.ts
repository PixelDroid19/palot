/**
 * Lightweight tagged logger for the Electron main process.
 *
 * Usage:
 *   const log = createLogger("opencode-manager")
 *   log.info("Server started", { url, pid })
 *   log.error("Spawn failed", err)
 *
 * Prefer passing correlation ids in a plain object as the second argument:
 *   log.info("Run finished", { runId, sessionId, durationMs })
 */

const IGNORABLE_CONSOLE_STREAM_ERROR_CODES = new Set(["EIO", "EPIPE", "ERR_STREAM_DESTROYED"])

let safeConsoleInstalled = false

function isIgnorableConsoleStreamError(error: unknown): error is NodeJS.ErrnoException {
	if (typeof error !== "object" || error === null) {
		return false
	}

	const code = "code" in error ? (error as NodeJS.ErrnoException).code : undefined
	return typeof code === "string" && IGNORABLE_CONSOLE_STREAM_ERROR_CODES.has(code)
}

function callConsole(method: (...args: unknown[]) => void, args: unknown[]) {
	try {
		method(...args)
	} catch (error) {
		if (!isIgnorableConsoleStreamError(error)) {
			throw error
		}
	}
}

function wrapConsoleMethod(methodName: "debug" | "log" | "warn" | "error") {
	const original = console[methodName].bind(console) as (...args: unknown[]) => void
	console[methodName] = ((...args: unknown[]) => {
		callConsole(original, args)
	}) as Console[typeof methodName]
}

function installConsoleStreamGuard(stream: NodeJS.WriteStream | undefined) {
	if (!stream) {
		return
	}

	stream.on("error", (error) => {
		if (isIgnorableConsoleStreamError(error)) {
			return
		}

		setImmediate(() => {
			throw error
		})
	})
}

export function installSafeConsole() {
	if (safeConsoleInstalled) {
		return
	}

	safeConsoleInstalled = true
	wrapConsoleMethod("debug")
	wrapConsoleMethod("log")
	wrapConsoleMethod("warn")
	wrapConsoleMethod("error")
	installConsoleStreamGuard(process.stdout)
	installConsoleStreamGuard(process.stderr)
}

export interface Logger {
	debug: (...args: unknown[]) => void
	info: (...args: unknown[]) => void
	warn: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
}

installSafeConsole()

function writeTagged(methodName: "debug" | "log" | "warn" | "error", tag: string, args: unknown[]) {
	const method = console[methodName].bind(console) as (...args: unknown[]) => void
	callConsole(method, [tag, ...args])
}

export function createLogger(module: string): Logger {
	const tag = `[main:${module}]`
	return {
		debug: (...args: unknown[]) => writeTagged("debug", tag, args),
		info: (...args: unknown[]) => writeTagged("log", tag, args),
		warn: (...args: unknown[]) => writeTagged("warn", tag, args),
		error: (...args: unknown[]) => writeTagged("error", tag, args),
	}
}
