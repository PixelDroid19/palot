import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { OPENCODE_ACP_SPEC } from "../../../packages/agent-host/src/providers/acp"

const desktopSource = path.resolve(import.meta.dir, "../src")

function read(relativePath: string): string {
	return readFileSync(path.join(desktopSource, relativePath), "utf8")
}

describe("OpenCode ACP boundary", () => {
	test("declares the CLI ACP command", () => {
		expect(OPENCODE_ACP_SPEC.binary).toBe("opencode")
		expect(OPENCODE_ACP_SPEC.args).toEqual(["acp"])
	})

	test("does not ship a local HTTP lifecycle", () => {
		const sourceFiles = [
			"main/index.ts",
			"main/ipc-handlers.ts",
			"main/model-state.ts",
			"preload/index.ts",
			"renderer/services/backend.ts",
		]
			.map(read)
			.join("\n")

		expect(sourceFiles).not.toContain("opencode serve")
		expect(sourceFiles).not.toContain("127.0.0.1:4101")
		expect(sourceFiles).not.toContain('ipcMain.handle("runtime:ensure"')
		expect(sourceFiles).not.toContain('ipcRenderer.invoke("runtime:ensure"')
	})
})
