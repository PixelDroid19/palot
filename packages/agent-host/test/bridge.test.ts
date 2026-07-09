import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { AgentBridge } from "../src/bridge"
import { AgentHost } from "../src/host"
import { MCP_PROXY_SOURCE } from "../src/mcp-proxy"
import type { BridgeInfo } from "../src/types"
import { FakeProvider } from "./fake-provider"

const echoProvider = new FakeProvider("echo", { reply: (input) => `answer:${input.text}` })

let host: AgentHost
let bridge: AgentBridge
let info: BridgeInfo
let proxyPath: string

beforeAll(async () => {
	const dir = mkdtempSync(join(tmpdir(), "gcode-bridge-"))
	proxyPath = join(dir, "gcode-mcp.cjs")
	writeFileSync(proxyPath, MCP_PROXY_SOURCE)
	host = new AgentHost({ builtinProviders: false, resolveBinary: async () => "/bin/sh" })
	host.registerProvider(echoProvider)
	bridge = new AgentBridge(host, { proxyScriptPath: proxyPath, nodeBinary: process.execPath })
	info = await bridge.start()
})

afterAll(async () => {
	await bridge.stop()
})

function call(path: string, init?: RequestInit & { token?: string }) {
	return fetch(`${info.url}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${init?.token ?? info.token}`,
			"content-type": "application/json",
			...(init?.headers ?? {}),
		},
	})
}

describe("AgentBridge", () => {
	test("rejects requests without the bearer token", async () => {
		const res = await call("/v1/agents", { token: "wrong" })
		expect(res.status).toBe(401)
	})

	test("lists registered agents", async () => {
		const res = await call("/v1/agents")
		const data = (await res.json()) as { agents: { id: string }[] }
		expect(data.agents.map((a) => a.id)).toContain("echo")
	})

	test("delegates a task to another agent", async () => {
		const res = await call("/v1/delegate", {
			method: "POST",
			body: JSON.stringify({ agent: "echo", prompt: "hola", cwd: "/tmp" }),
		})
		const data = (await res.json()) as { message: string }
		expect(data.message).toBe("answer:hola")
	})

	test("shares context across calls", async () => {
		await call("/v1/context", {
			method: "POST",
			body: JSON.stringify({ key: "plan", value: "step 1", author: "echo" }),
		})
		const res = await call("/v1/context")
		const data = (await res.json()) as { entries: { key: string; value: string }[] }
		expect(data.entries.find((e) => e.key === "plan")?.value).toBe("step 1")
	})

	test("the MCP proxy speaks MCP and reaches the bridge end-to-end", async () => {
		const child = spawn(process.execPath, [proxyPath], {
			env: { ...process.env, GCODE_BRIDGE_URL: info.url, GCODE_BRIDGE_TOKEN: info.token },
			stdio: ["pipe", "pipe", "inherit"],
		})
		const responses: Record<string, unknown>[] = []
		let buffer = ""
		child.stdout.setEncoding("utf8")
		const done = new Promise<void>((resolve) => {
			child.stdout.on("data", (chunk: string) => {
				buffer += chunk
				let nl = buffer.indexOf("\n")
				while (nl !== -1) {
					const line = buffer.slice(0, nl).trim()
					buffer = buffer.slice(nl + 1)
					if (line) responses.push(JSON.parse(line))
					nl = buffer.indexOf("\n")
				}
				if (responses.length >= 3) resolve()
			})
		})

		const send = (msg: unknown) => child.stdin.write(`${JSON.stringify(msg)}\n`)
		send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })
		send({ jsonrpc: "2.0", method: "notifications/initialized" })
		send({ jsonrpc: "2.0", id: 2, method: "tools/list" })
		send({
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: { name: "gcode_delegate", arguments: { agent: "echo", prompt: "ping", cwd: "/tmp" } },
		})

		await done
		child.kill()

		const init = responses.find((r) => r.id === 1) as { result: { serverInfo: { name: string } } }
		expect(init.result.serverInfo.name).toBe("gcode-bridge")
		const tools = responses.find((r) => r.id === 2) as { result: { tools: { name: string }[] } }
		expect(tools.result.tools.map((t) => t.name)).toContain("gcode_delegate")
		const callRes = responses.find((r) => r.id === 3) as {
			result: { content: { text: string }[] }
		}
		expect(callRes.result.content[0]?.text).toBe("answer:ping")
	}, 15_000)
})
