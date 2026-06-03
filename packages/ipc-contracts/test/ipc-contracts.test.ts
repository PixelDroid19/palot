import { describe, expect, test } from "bun:test"

import { type GetVersionResponse, IPC_CHANNELS, type IpcChannel } from "../src/index"

describe("ipc-contracts", () => {
	test("exports channel constants", () => {
		expect(IPC_CHANNELS.GET_VERSION).toBe("app:get-version")
	})

	test("channel type is union of values", () => {
		const ch: IpcChannel = IPC_CHANNELS.GET_VERSION
		expect(ch).toBe("app:get-version")
	})

	test("response shape", () => {
		const res: GetVersionResponse = { version: "0.0.1" }
		expect(res.version).toContain(".")
	})
})
