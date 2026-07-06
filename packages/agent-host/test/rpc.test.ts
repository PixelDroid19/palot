import { describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { JsonRpcConnection } from "../src/rpc"

/**
 * A scripted NDJSON JSON-RPC peer: replies to `initialize`, emits a
 * notification, sends a server→client request and echoes the client's answer
 * back as a notification.
 */
const PEER_SOURCE = `
const readline = require("node:readline")
const rl = readline.createInterface({ input: process.stdin })
const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\\n")
rl.on("line", (line) => {
  const msg = JSON.parse(line)
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: { ok: true } })
    send({ jsonrpc: "2.0", method: "hello", params: { n: 1 } })
    send({ jsonrpc: "2.0", id: 99, method: "approve?", params: { what: "thing" } })
  } else if (msg.id === 99) {
    send({ jsonrpc: "2.0", method: "answered", params: msg.result })
  } else if (msg.method === "boom") {
    send({ jsonrpc: "2.0", id: msg.id, error: { code: -1, message: "kaput" } })
  }
})
`

function connect() {
	const child = spawn(process.execPath, ["-e", PEER_SOURCE], { stdio: ["pipe", "pipe", "pipe"] })
	return { child, rpc: new JsonRpcConnection(child) }
}

describe("JsonRpcConnection", () => {
	test("request/response, notifications, and server→client requests", async () => {
		const { rpc } = connect()
		const notifications: Array<{ method: string; params: unknown }> = []
		rpc.onNotification((method, params) => notifications.push({ method, params }))
		rpc.onRequest(async (method, params) => {
			expect(method).toBe("approve?")
			expect(params).toEqual({ what: "thing" })
			return { decision: "accept" }
		})
		const result = await rpc.request("initialize", {})
		expect(result).toEqual({ ok: true })
		// Wait for the answered echo to round-trip.
		await new Promise((r) => setTimeout(r, 200))
		expect(notifications).toContainEqual({ method: "hello", params: { n: 1 } })
		expect(notifications).toContainEqual({ method: "answered", params: { decision: "accept" } })
		rpc.close()
	})

	test("rpc errors reject with code and message", async () => {
		const { rpc } = connect()
		await rpc.request("initialize", {})
		await expect(rpc.request("boom")).rejects.toThrow("kaput")
		rpc.close()
	})

	test("pending requests reject when the process dies", async () => {
		const { child, rpc } = connect()
		const pending = rpc.request("never-answered")
		child.kill("SIGKILL")
		await expect(pending).rejects.toThrow()
	})
})
