import { describe, expect, test } from "bun:test"
import { buildRsyncArgs } from "../src/main/rsync-command"

const BASE = {
	host: "user@example.com",
	remotePath: "~/.config/opencode/skills",
	localDir: "/home/me/.config/opencode/skills",
	port: 22,
}

describe("buildRsyncArgs", () => {
	test("push puts the local dir first, remote second", () => {
		const args = buildRsyncArgs({ ...BASE, direction: "push" })
		const [local, remote] = args.slice(-2)
		expect(local).toBe("/home/me/.config/opencode/skills/")
		expect(remote).toBe("user@example.com:~/.config/opencode/skills/")
	})

	test("pull reverses source and destination", () => {
		const args = buildRsyncArgs({ ...BASE, direction: "pull" })
		const [remote, local] = args.slice(-2)
		expect(remote).toBe("user@example.com:~/.config/opencode/skills/")
		expect(local).toBe("/home/me/.config/opencode/skills/")
	})

	test("always mirrors with archive+compress and delete", () => {
		const args = buildRsyncArgs({ ...BASE, direction: "push" })
		expect(args.slice(0, 2)).toEqual(["-avz", "--delete"])
	})

	test("drives a non-interactive ssh transport on the given port", () => {
		const args = buildRsyncArgs({ ...BASE, direction: "push", port: 2222 })
		const eIndex = args.indexOf("-e")
		expect(eIndex).toBeGreaterThanOrEqual(0)
		expect(args[eIndex + 1]).toBe(
			"ssh -p 2222 -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
		)
	})

	test("falls back to port 22 when unset", () => {
		const args = buildRsyncArgs({ ...BASE, direction: "push", port: undefined })
		expect(args[args.indexOf("-e") + 1]).toContain("-p 22 ")
	})

	test("normalizes trailing slashes so rsync copies contents", () => {
		const args = buildRsyncArgs({
			...BASE,
			direction: "push",
			localDir: "/a/b///",
			remotePath: "/c/d/",
		})
		expect(args).toContain("/a/b/")
		expect(args).toContain("user@example.com:/c/d/")
	})
})
