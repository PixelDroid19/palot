import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { AcpProvider } from "../src/providers/acp"

const FAKE_ACP_SOURCE = `
const readline = require("node:readline")
const rl = readline.createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n")
rl.on("line", (line) => {
  const request = JSON.parse(line)
  if (request.method === "initialize") {
    send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: 1 } })
  } else if (request.method === "session/new") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        sessionId: "fake-session",
        configOptions: [{ id: "model", currentValue: "fake/default", options: [] }],
      },
    })
  } else if (request.method === "session/prompt") {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: request.params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hello from ACP" },
        },
      },
    })
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: { stopReason: "end_turn" },
    })
  } else if (request.method === "session/close") {
    send({ jsonrpc: "2.0", id: request.id, result: {} })
  }
})
`

const RECOVERING_ACP_SOURCE = `
const fs = require("node:fs")
const readline = require("node:readline")
const marker = process.env.FAKE_ACP_MARKER
const firstProcess = !fs.existsSync(marker)
if (firstProcess) fs.writeFileSync(marker, "first")
const rl = readline.createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n")
rl.on("line", (line) => {
  const request = JSON.parse(line)
  if (request.method === "initialize") {
    send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: 1 } })
  } else if (request.method === "session/new") {
    send({ jsonrpc: "2.0", id: request.id, result: { sessionId: "recoverable-session" } })
  } else if (request.method === "session/load") {
    send({ jsonrpc: "2.0", id: request.id, result: { sessionId: request.params.sessionId } })
  } else if (request.method === "session/prompt") {
    if (firstProcess) {
      process.exit(0)
    }
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: request.params.sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "recovered" } },
    } })
    send({ jsonrpc: "2.0", id: request.id, result: { stopReason: "end_turn" } })
  } else if (request.method === "session/close") {
    send({ jsonrpc: "2.0", id: request.id, result: {} })
  }
})
`

describe("AcpProvider", () => {
	test("drives a persistent stdio session through initialize/new/prompt/close", async () => {
		const provider = new AcpProvider(
			{
				id: "fake-acp",
				displayName: "Fake ACP",
				binary: process.execPath,
				args: ["-e", FAKE_ACP_SOURCE],
				fallbackModels: [{ slug: "", label: "Default", efforts: [] }],
			},
			async () => process.execPath,
		)
		const updates: string[] = []
		const session = await provider.openSession(
			{ cwd: process.cwd(), sandbox: "workspace-write" },
			(update) => {
				if (update.kind === "message-delta") updates.push(update.text)
			},
		)

		expect(session.threadId).toBe("fake-session")
		const result = await session.send({ text: "hello" })
		expect(result.message).toBe("hello from ACP")
		expect(updates).toEqual(["hello from ACP"])

		await session.close()
		await provider.dispose()
	})

	test("reloads the ACP session after the process dies", async () => {
		const markerDir = path.join(tmpdir(), `gcode-acp-${Date.now()}`)
		mkdirSync(markerDir, { recursive: true })
		const marker = path.join(markerDir, "started")
		const previousMarker = process.env.FAKE_ACP_MARKER
		process.env.FAKE_ACP_MARKER = marker
		try {
			const provider = new AcpProvider(
				{
					id: "recovering-acp",
					displayName: "Recovering ACP",
					binary: process.execPath,
					args: ["-e", RECOVERING_ACP_SOURCE],
				},
				async () => process.execPath,
			)
			const session = await provider.openSession({ cwd: process.cwd() }, () => {})
			await expect(session.send({ text: "first" })).rejects.toThrow(/process exited|RPC connection closed/i)
			await new Promise((resolve) => setTimeout(resolve, 50))
			const result = await session.send({ text: "second" })
			expect(result.message).toBe("recovered")
			expect(session.threadId).toBe("recoverable-session")
			await session.close()
			await provider.dispose()
		} finally {
			if (previousMarker === undefined) delete process.env.FAKE_ACP_MARKER
			else process.env.FAKE_ACP_MARKER = previousMarker
			rmSync(markerDir, { recursive: true, force: true })
		}
	})
})
