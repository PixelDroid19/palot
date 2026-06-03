import { describe, expect, test } from "bun:test"

import { createLogger } from "../src/main/logger"

describe("main logger", () => {
	test("swallows ignorable console stream write errors", () => {
		const log = createLogger("test")
		const originalConsoleError = console.error

		console.error = (() => {
			const error = new Error("write EIO") as NodeJS.ErrnoException
			error.code = "EIO"
			throw error
		}) as Console["error"]

		try {
			expect(() => log.error("logger should not crash")).not.toThrow()
		} finally {
			console.error = originalConsoleError
		}
	})
})
