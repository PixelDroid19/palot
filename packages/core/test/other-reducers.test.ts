import { describe, expect, test } from "bun:test"

import type { PalotEvent } from "@palot/events"
import { automationsReducer, initialAutomationsState } from "../src/automations"
import { initialSettingsState, settingsReducer } from "../src/settings"
import { initialFullCoreState, rootReducer } from "../src/state"
import { makeTestEvent } from "../src/use-cases"
import { initialWorkspacesState, workspacesReducer } from "../src/workspaces"

describe("automations reducer", () => {
	test("updates run status", () => {
		let state = initialAutomationsState
		const evt: PalotEvent = makeTestEvent("automation.run.updated", {
			at: 1,
			run: { id: "r1", automationId: "a1", status: "running" },
		})
		state = automationsReducer(state, evt)
		expect(state.runs.r1.status).toBe("running")
	})
})

describe("settings reducer", () => {
	test("sets single value", () => {
		let state = initialSettingsState
		const evt: PalotEvent = makeTestEvent("settings.changed", {
			at: 10,
			key: "theme",
			value: "dark",
		})
		state = settingsReducer(state, evt)
		expect(state.values.theme).toBe("dark")
	})

	test("bulk payload", () => {
		let state = initialSettingsState
		const evt: PalotEvent = makeTestEvent("settings.changed", {
			at: 11,
			payload: { foo: 1, bar: true },
		})
		state = settingsReducer(state, evt)
		expect(state.values.foo).toBe(1)
	})
})

describe("workspaces reducer", () => {
	test("discovers workspace", () => {
		let state = initialWorkspacesState
		const evt: PalotEvent = makeTestEvent("workspace.discovered", {
			at: 5,
			workspace: { id: "w1", name: "proj", directory: "/p" },
		})
		state = workspacesReducer(state, evt)
		expect(state.byId.w1.name).toBe("proj")
	})
})

describe("provider and root reducer + more settings", () => {
	test("rootReducer handles provider.connected + settings + workspace", () => {
		let state = initialFullCoreState
		state = rootReducer(
			state,
			makeTestEvent("provider.connected", { at: 1, providerId: "opencode" }),
		)
		expect(state.provider.connectedProviderId).toBe("opencode")
		state = rootReducer(
			state,
			makeTestEvent("settings.changed", { at: 2, key: "model", value: "gpt" }),
		)
		expect(state.settings.values.model).toBe("gpt")
		state = rootReducer(
			state,
			makeTestEvent("workspace.discovered", {
				at: 3,
				workspace: { id: "w2", name: "p2", directory: "/p2" },
			}),
		)
		expect(state.workspaces.byId.w2).toBeDefined()
	})

	test("settings bulk + key override", () => {
		let state = initialSettingsState
		state = settingsReducer(
			state,
			makeTestEvent("settings.changed", { at: 1, payload: { a: 1, b: 2 } }),
		)
		state = settingsReducer(
			state,
			makeTestEvent("settings.changed", { at: 2, key: "a", value: 99 }),
		)
		expect(state.values.a).toBe(99)
		expect(state.values.b).toBe(2)
	})
})
