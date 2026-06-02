import { describe, expect, test } from "bun:test"
import { Semaphore } from "../src/main/automation/semaphore"

describe("Semaphore", () => {
	test("limits concurrent acquisitions", async () => {
		const sem = new Semaphore(2)
		const release1 = await sem.acquire()
		const release2 = await sem.acquire()
		expect(sem.active).toBe(2)

		let thirdStarted = false
		const third = sem.acquire().then(() => {
			thirdStarted = true
		})

		await new Promise((r) => setTimeout(r, 10))
		expect(thirdStarted).toBe(false)
		expect(sem.pending).toBe(1)

		release1()
		await third
		expect(thirdStarted).toBe(true)

		release2()
		const release3 = await sem.acquire()
		release3()
	})
})