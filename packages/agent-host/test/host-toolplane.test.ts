/**
 * Host tool plane — product surface independent of CLI brands.
 *
 * Proves:
 *  - default host registers automation/system/browser + agents/context
 *  - tools work with a fake harness and zero built-in CLIs
 *  - bridge GET/POST /v1/tools list+call is brand-agnostic
 *  - fail-closed: missing backends and unknown tools error, never invent
 *  - registerHostTools: false yields empty registry (bare host)
 *  - injectable backends replace stubs without touching adapters
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentBridge } from "../src/bridge"
import { AgentHost } from "../src/host"
import {
	HostToolRegistry,
	registerDefaultPlatformTools,
} from "../src/host-tools"
import { MCP_PROXY_SOURCE } from "../src/mcp-proxy"
import type { BridgeInfo } from "../src/types"
import { FakeProvider } from "./fake-provider"

const PLATFORM_TOOL_NAMES = [
	"gcode_automation_list",
	"gcode_automation_run",
	"gcode_system_run",
	"gcode_browser_open",
] as const

const CORE_TOOL_NAMES = [
	"gcode_list_agents",
	"gcode_delegate",
	"gcode_context_get",
	"gcode_context_set",
	"gcode_context_list",
] as const

describe("HostToolRegistry", () => {
	test("register / list / call / unregister", async () => {
		const reg = new HostToolRegistry()
		reg.register({
			name: "echo",
			description: "echo",
			category: "custom",
			inputSchema: { type: "object", properties: { x: { type: "string" } } },
			async handler(args) {
				return String(args.x ?? "")
			},
		})
		expect(reg.has("echo")).toBe(true)
		expect(reg.list().map((t) => t.name)).toEqual(["echo"])
		expect(await reg.call("echo", { x: "hi" })).toBe("hi")
		expect(reg.unregister("echo")).toBe(true)
		await expect(reg.call("echo")).rejects.toThrow(/Unknown host tool/)
	})

	test("listForMcp omits handler and category", () => {
		const reg = new HostToolRegistry()
		reg.register({
			name: "t",
			description: "d",
			category: "system",
			inputSchema: { type: "object" },
			async handler() {
				return "ok"
			},
		})
		const mcp = reg.listForMcp()
		expect(mcp).toEqual([{ name: "t", description: "d", inputSchema: { type: "object" } }])
		expect("handler" in mcp[0]!).toBe(false)
		expect("category" in mcp[0]!).toBe(false)
	})
})

describe("registerDefaultPlatformTools fail-closed stubs", () => {
	test("stub backends refuse automation/system/browser", async () => {
		const reg = new HostToolRegistry()
		registerDefaultPlatformTools(reg)
		expect(await reg.call("gcode_automation_list")).toBe("[]")
		await expect(reg.call("gcode_automation_run", { id: "x" })).rejects.toThrow(
			/No automation backend/,
		)
		const sys = JSON.parse(await reg.call("gcode_system_run", { command: "echo hi" })) as {
			exitCode: number
			stderr: string
		}
		expect(sys.exitCode).toBe(1)
		expect(sys.stderr).toMatch(/No system backend/)
		await expect(reg.call("gcode_browser_open", { url: "https://example.com" })).rejects.toThrow(
			/No browser backend/,
		)
	})

	test("injectable backends are invoked (real dispatch path)", async () => {
		const reg = new HostToolRegistry()
		const calls: string[] = []
		registerDefaultPlatformTools(reg, {
			listAutomations: async () => {
				calls.push("list")
				return [{ id: "a1", name: "Nightly", status: "active" }]
			},
			runAutomation: async (id) => {
				calls.push(`run:${id}`)
				return { ok: true, message: `queued ${id}` }
			},
			runSystemCommand: async (command) => {
				calls.push(`sys:${command}`)
				return { exitCode: 0, stdout: "ok\n", stderr: "" }
			},
			openBrowser: async (url) => {
				calls.push(`browser:${url}`)
				return { ok: true, message: `opened ${url}` }
			},
		})
		expect(JSON.parse(await reg.call("gcode_automation_list"))).toEqual([
			{ id: "a1", name: "Nightly", status: "active" },
		])
		expect(await reg.call("gcode_automation_run", { id: "a1" })).toBe("queued a1")
		expect(JSON.parse(await reg.call("gcode_system_run", { command: "true" }))).toMatchObject({
			exitCode: 0,
			stdout: "ok\n",
		})
		expect(await reg.call("gcode_browser_open", { url: "https://example.com" })).toMatch(
			/opened/,
		)
		expect(calls).toEqual([
			"list",
			"run:a1",
			"sys:true",
			"browser:https://example.com",
		])
	})

	test("browser rejects non-http URLs", async () => {
		const reg = new HostToolRegistry()
		registerDefaultPlatformTools(reg, {
			openBrowser: async () => ({ ok: true, message: "should not run" }),
		})
		await expect(reg.call("gcode_browser_open", { url: "file:///etc/passwd" })).rejects.toThrow(
			/http/,
		)
	})

	test("automation_run fails closed when backend returns ok:false", async () => {
		const reg = new HostToolRegistry()
		registerDefaultPlatformTools(reg, {
			runAutomation: async () => ({ ok: false, message: "not found" }),
		})
		await expect(reg.call("gcode_automation_run", { id: "missing" })).rejects.toThrow(/not found/)
	})
})

describe("AgentHost tool plane with fake harness only", () => {
	test("installs core + platform tools without codex/claude", () => {
		const host = new AgentHost({
			builtinProviders: false,
			providers: [new FakeProvider("custom-harness")],
			resolveBinary: async () => "/bin/sh",
		})
		const names = host.tools.list().map((t) => t.name)
		for (const n of CORE_TOOL_NAMES) expect(names).toContain(n)
		for (const n of PLATFORM_TOOL_NAMES) expect(names).toContain(n)
		expect(host.hasProvider("codex")).toBe(false)
		expect(host.hasProvider("claude")).toBe(false)
		expect(host.listRuntimes().map((r) => r.id)).toEqual(["custom-harness"])
	})

	test("registerHostTools: false yields empty tool registry", () => {
		const host = new AgentHost({
			builtinProviders: false,
			registerHostTools: false,
		})
		expect(host.tools.list()).toEqual([])
	})

	test("registerHostTool adds custom host-owned tools", async () => {
		const host = new AgentHost({ builtinProviders: false, registerHostTools: false })
		host.registerHostTool({
			name: "gcode_desktop_ping",
			description: "ping",
			category: "custom",
			inputSchema: { type: "object" },
			async handler() {
				return "pong"
			},
		})
		expect(await host.tools.call("gcode_desktop_ping")).toBe("pong")
	})

	test("platform tools are not owned by any provider adapter", () => {
		const host = new AgentHost({ builtinProviders: false })
		// Tools live on host.tools — no provider field, no brand switch.
		const tools = host.tools.list()
		expect(tools.every((t) => typeof t.name === "string" && t.category)).toBe(true)
		expect(tools.filter((t) => t.category === "automation").map((t) => t.name)).toEqual([
			"gcode_automation_list",
			"gcode_automation_run",
		])
		expect(tools.filter((t) => t.category === "system").map((t) => t.name)).toEqual([
			"gcode_system_run",
		])
		expect(tools.filter((t) => t.category === "browser").map((t) => t.name)).toEqual([
			"gcode_browser_open",
		])
	})
})

describe("AgentBridge host tool plane HTTP", () => {
	let host: AgentHost
	let bridge: AgentBridge
	let info: BridgeInfo
	let proxyPath: string

	beforeAll(async () => {
		const dir = mkdtempSync(join(tmpdir(), "gcode-toolplane-"))
		proxyPath = join(dir, "gcode-mcp.cjs")
		writeFileSync(proxyPath, MCP_PROXY_SOURCE)
		host = new AgentHost({
			builtinProviders: false,
			providers: [new FakeProvider("echo", { reply: (i) => `answer:${i.text}` })],
			resolveBinary: async () => "/bin/sh",
		})
		// Real injectable backends — simulates desktop installDesktopHostToolBackends
		registerDefaultPlatformTools(host.tools, {
			listAutomations: async () => [{ id: "auto-1", name: "Daily", status: "active" }],
			runAutomation: async (id) =>
				id === "auto-1"
					? { ok: true, message: `automation ${id} queued` }
					: { ok: false, message: `not found: ${id}` },
			runSystemCommand: async (command) => ({
				exitCode: 0,
				stdout: `ran:${command}`,
				stderr: "",
			}),
			openBrowser: async (url) => ({ ok: true, message: `opened ${url}` }),
		})
		bridge = new AgentBridge(host, {
			proxyScriptPath: proxyPath,
			nodeBinary: process.execPath,
		})
		info = await bridge.start()
	})

	afterAll(async () => {
		await bridge.stop()
	})

	function call(path: string, init?: RequestInit) {
		return fetch(`${info.url}${path}`, {
			...init,
			headers: {
				authorization: `Bearer ${info.token}`,
				"content-type": "application/json",
				...(init?.headers ?? {}),
			},
		})
	}

	test("GET /v1/tools lists platform tools for any harness", async () => {
		const res = await call("/v1/tools")
		expect(res.status).toBe(200)
		const data = (await res.json()) as { tools: { name: string }[] }
		const names = data.tools.map((t) => t.name)
		for (const n of PLATFORM_TOOL_NAMES) expect(names).toContain(n)
		for (const n of CORE_TOOL_NAMES) expect(names).toContain(n)
	})

	test("POST /v1/tools/call automation_list", async () => {
		const res = await call("/v1/tools/call", {
			method: "POST",
			body: JSON.stringify({ name: "gcode_automation_list", arguments: {} }),
		})
		expect(res.status).toBe(200)
		const data = (await res.json()) as { result: string }
		expect(JSON.parse(data.result)).toEqual([{ id: "auto-1", name: "Daily", status: "active" }])
	})

	test("POST /v1/tools/call automation_run fail-closed for missing id", async () => {
		const res = await call("/v1/tools/call", {
			method: "POST",
			body: JSON.stringify({ name: "gcode_automation_run", arguments: { id: "nope" } }),
		})
		expect(res.status).toBe(502)
		const data = (await res.json()) as { error: string }
		expect(data.error).toMatch(/not found/)
	})

	test("POST /v1/tools/call system_run and browser_open", async () => {
		const sys = await call("/v1/tools/call", {
			method: "POST",
			body: JSON.stringify({ name: "gcode_system_run", arguments: { command: "pwd" } }),
		})
		expect(sys.status).toBe(200)
		const sysData = (await sys.json()) as { result: string }
		expect(JSON.parse(sysData.result).stdout).toBe("ran:pwd")

		const br = await call("/v1/tools/call", {
			method: "POST",
			body: JSON.stringify({
				name: "gcode_browser_open",
				arguments: { url: "https://example.com" },
			}),
		})
		expect(br.status).toBe(200)
		const brData = (await br.json()) as { result: string }
		expect(brData.result).toMatch(/opened/)
	})

	test("POST /v1/tools/call unknown tool is 404 fail-closed", async () => {
		const res = await call("/v1/tools/call", {
			method: "POST",
			body: JSON.stringify({ name: "gcode_invented_tool", arguments: {} }),
		})
		expect(res.status).toBe(404)
		const data = (await res.json()) as { error: string }
		expect(data.error).toMatch(/Unknown host tool/)
	})

	test("tools/call still reaches gcode_delegate for fake harness", async () => {
		const res = await call("/v1/tools/call", {
			method: "POST",
			body: JSON.stringify({
				name: "gcode_delegate",
				arguments: { agent: "echo", prompt: "hi", cwd: "/tmp" },
			}),
		})
		expect(res.status).toBe(200)
		const data = (await res.json()) as { result: string }
		expect(data.result).toBe("answer:hi")
	})
})
