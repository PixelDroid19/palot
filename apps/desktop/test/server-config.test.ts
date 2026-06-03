import { describe, expect, test } from "bun:test"
import {
	createDefaultLocalServer,
	getLocalServerDisplayName,
	sanitizeServerSettings,
} from "../src/shared/server-config"

describe("getLocalServerDisplayName", () => {
	test("maps platforms to expected labels", () => {
		expect(getLocalServerDisplayName("darwin")).toBe("This Mac")
		expect(getLocalServerDisplayName("win32")).toBe("This PC")
		expect(getLocalServerDisplayName("linux")).toBe("This Linux")
	})
})

describe("sanitizeServerSettings", () => {
	test("removes grok servers and fixes local name on linux", () => {
		const { settings, changed } = sanitizeServerSettings(
			{
				servers: [
					{ id: "local", name: "This Mac", type: "local" },
					{
						id: "local-grok",
						name: "Grok (This Mac)",
						type: "local-grok" as "local",
						runtime: "grok",
						port: 2419,
					} as never,
				],
				activeServerId: "local-grok",
			},
			"linux",
		)

		expect(changed).toBe(true)
		expect(settings.servers).toHaveLength(1)
		expect(settings.servers[0]).toMatchObject({ id: "local", name: "This Linux", type: "local" })
		expect(settings.activeServerId).toBe("local")
	})

	test("keeps custom local server name", () => {
		const { settings, changed } = sanitizeServerSettings(
			{
				servers: [{ id: "local", name: "Workstation", type: "local" }],
				activeServerId: "local",
			},
			"linux",
		)

		expect(changed).toBe(false)
		expect(settings.servers[0]?.name).toBe("Workstation")
	})

	test("darwin keeps This Mac for local server", () => {
		const { settings, changed } = sanitizeServerSettings(
			{
				servers: [{ id: "local", name: "This Mac", type: "local" }],
				activeServerId: "local",
			},
			"darwin",
		)

		expect(changed).toBe(false)
		expect(settings.servers[0]?.name).toBe("This Mac")
	})

	test("win32 renames legacy This Mac to This PC", () => {
		const { settings, changed } = sanitizeServerSettings(
			{
				servers: [{ id: "local", name: "This Mac", type: "local" }],
				activeServerId: "local",
			},
			"win32",
		)

		expect(changed).toBe(true)
		expect(settings.servers[0]?.name).toBe("This PC")
	})

	test("linux renames legacy This PC to This Linux", () => {
		const { settings, changed } = sanitizeServerSettings(
			{
				servers: [{ id: "local", name: "This PC", type: "local" }],
				activeServerId: "local",
			},
			"linux",
		)

		expect(changed).toBe(true)
		expect(settings.servers[0]?.name).toBe("This Linux")
	})

	test("strips runtime and enabled from local server", () => {
		const { settings } = sanitizeServerSettings(
			{
				servers: [
					{
						id: "local",
						name: "This Mac",
						type: "local",
						runtime: "opencode",
						enabled: true,
					} as never,
				],
				activeServerId: "local",
			},
			"linux",
		)

		const local = settings.servers[0] as unknown as Record<string, unknown>
		expect(local.runtime).toBeUndefined()
		expect(local.enabled).toBeUndefined()
		expect(local.name).toBe("This Linux")
	})

	test("keeps remote server when name contains grok", () => {
		const { settings, changed } = sanitizeServerSettings(
			{
				servers: [
					{ id: "local", name: "This Linux", type: "local" },
					{
						id: "remote-1",
						name: "My Grok Box",
						type: "remote",
						url: "http://192.168.1.10:4096",
					},
				],
				activeServerId: "local",
			},
			"linux",
		)

		expect(changed).toBe(false)
		expect(settings.servers).toHaveLength(2)
		expect(settings.servers[1]?.name).toBe("My Grok Box")
	})

	test("createDefaultLocalServer uses platform label", () => {
		expect(createDefaultLocalServer("darwin").name).toBe("This Mac")
		expect(createDefaultLocalServer("linux").name).toBe("This Linux")
	})
})
