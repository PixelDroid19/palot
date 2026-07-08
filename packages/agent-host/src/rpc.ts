/**
 * Minimal newline-delimited JSON-RPC 2.0 endpoint over a child process's
 * stdio — the transport `codex app-server` speaks. Supports both directions:
 * client→server requests/notifications, and server→client requests (used for
 * approval prompts) answered via the handler's returned promise.
 */
import type { ChildProcess } from "node:child_process"

export interface RpcError extends Error {
	code?: number
	data?: unknown
}

type Json = Record<string, unknown>

function isWarningLine(line: string): boolean {
	return /\bWARN\b/.test(line) || /^warning:/i.test(line)
}

function summarizeStderr(stderrTail: string): string {
	const lines = stderrTail
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
	if (!lines.length) return ""
	const useful = lines.filter((line) => !isWarningLine(line))
	return useful.join("\n")
}

export class JsonRpcConnection {
	private nextId = 1
	private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
	private notificationHandlers: Array<(method: string, params: unknown) => void> = []
	private requestHandler: ((method: string, params: unknown) => Promise<unknown>) | null = null
	private buffer = ""
	private closed = false
	private closeHandlers: Array<(error: Error | null) => void> = []
	private stderrTail = ""

	constructor(private readonly child: ChildProcess) {
		child.stdout?.setEncoding("utf8")
		child.stdout?.on("data", (chunk: string) => this.feed(chunk))
		child.stderr?.setEncoding("utf8")
		child.stderr?.on("data", (chunk: string) => {
			this.stderrTail = (this.stderrTail + chunk).slice(-4_096)
		})
		const fail = (err: Error | null) => this.handleClosed(err)
		child.on("error", (err) => fail(err))
		child.on("close", (code) => {
			const stderr = summarizeStderr(this.stderrTail)
			fail(
				code === 0 || this.closed ? null : new Error(stderr || `process exited with code ${code}`),
			)
		})
	}

	/** Register a handler for server→client notifications. */
	onNotification(handler: (method: string, params: unknown) => void): void {
		this.notificationHandlers.push(handler)
	}

	/** Register the handler for server→client requests (approvals etc.). */
	onRequest(handler: (method: string, params: unknown) => Promise<unknown>): void {
		this.requestHandler = handler
	}

	/** Notified when the underlying process goes away. */
	onClose(handler: (error: Error | null) => void): void {
		this.closeHandlers.push(handler)
	}

	request<T = unknown>(method: string, params?: unknown): Promise<T> {
		if (this.closed) return Promise.reject(new Error(`RPC connection closed (${method})`))
		const id = this.nextId++
		const promise = new Promise<T>((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
		})
		this.write({ jsonrpc: "2.0", id, method, params })
		return promise
	}

	notify(method: string, params?: unknown): void {
		if (this.closed) return
		this.write({ jsonrpc: "2.0", method, params })
	}

	close(): void {
		this.closed = true
		this.handleClosed(null)
		this.child.kill("SIGTERM")
	}

	get alive(): boolean {
		return !this.closed
	}

	private write(payload: Json): void {
		try {
			this.child.stdin?.write(`${JSON.stringify(payload)}\n`)
		} catch {
			// Process is gone; pending requests fail via the close handler.
		}
	}

	private feed(chunk: string): void {
		this.buffer += chunk
		let newline = this.buffer.indexOf("\n")
		while (newline !== -1) {
			const line = this.buffer.slice(0, newline).trim()
			this.buffer = this.buffer.slice(newline + 1)
			newline = this.buffer.indexOf("\n")
			if (!line) continue
			let message: Json
			try {
				message = JSON.parse(line) as Json
			} catch {
				continue
			}
			this.dispatch(message)
		}
	}

	private dispatch(message: Json): void {
		const { id, method } = message
		if (typeof method === "string" && id !== undefined && id !== null) {
			// Server→client request.
			const respond = (result: unknown, error?: { code: number; message: string }) =>
				this.write(error ? { jsonrpc: "2.0", id, error } : ({ jsonrpc: "2.0", id, result } as Json))
			const handler = this.requestHandler
			if (!handler) {
				respond(undefined, { code: -32601, message: `No handler for ${method}` })
				return
			}
			handler(method, message.params)
				.then((result) => respond(result ?? {}))
				.catch((err: unknown) =>
					respond(undefined, {
						code: -32000,
						message: err instanceof Error ? err.message : String(err),
					}),
				)
			return
		}
		if (typeof method === "string") {
			for (const handler of this.notificationHandlers) handler(method, message.params)
			return
		}
		if (typeof id === "number") {
			const pending = this.pending.get(id)
			if (!pending) return
			this.pending.delete(id)
			if (message.error !== undefined) {
				const raw = message.error as { code?: number; message?: string; data?: unknown }
				const err: RpcError = new Error(raw?.message || "RPC error")
				err.code = raw?.code
				err.data = raw?.data
				pending.reject(err)
			} else {
				pending.resolve(message.result)
			}
		}
	}

	private handleClosed(error: Error | null): void {
		if (this.closed && !this.pending.size) return
		this.closed = true
		const failure = error ?? new Error("RPC connection closed")
		for (const [, entry] of this.pending) entry.reject(failure)
		this.pending.clear()
		for (const handler of this.closeHandlers) handler(error)
		this.closeHandlers = []
	}
}
