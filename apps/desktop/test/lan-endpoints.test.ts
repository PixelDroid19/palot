import { describe, expect, test } from "bun:test"
import {
	buildEndpoints,
	classifyAddress,
	isTailscaleAddress,
	parsePort,
} from "../src/main/lan-endpoints"

describe("isTailscaleAddress", () => {
	test("recognizes addresses in the 100.64.0.0/10 CGNAT range", () => {
		expect(isTailscaleAddress("100.64.0.1")).toBe(true)
		expect(isTailscaleAddress("100.100.50.4")).toBe(true)
		expect(isTailscaleAddress("100.127.255.255")).toBe(true)
	})

	test("rejects addresses outside the range", () => {
		expect(isTailscaleAddress("100.63.0.1")).toBe(false) // just below
		expect(isTailscaleAddress("100.128.0.1")).toBe(false) // just above
		expect(isTailscaleAddress("192.168.1.10")).toBe(false)
		expect(isTailscaleAddress("10.0.0.5")).toBe(false)
	})

	test("rejects malformed input", () => {
		expect(isTailscaleAddress("")).toBe(false)
		expect(isTailscaleAddress("100.64.0")).toBe(false)
		expect(isTailscaleAddress("not.an.ip.addr")).toBe(false)
	})
})

describe("classifyAddress", () => {
	test("tags Tailscale vs LAN", () => {
		expect(classifyAddress("100.80.0.1")).toBe("tailscale")
		expect(classifyAddress("192.168.0.2")).toBe("lan")
	})
})

describe("parsePort", () => {
	test("extracts the port from a URL", () => {
		expect(parsePort("http://127.0.0.1:4101")).toBe(4101)
		expect(parsePort("https://example.com:8443/path")).toBe(8443)
	})
	test("returns null when there is no explicit port or the URL is invalid", () => {
		expect(parsePort("http://example.com")).toBeNull()
		expect(parsePort("not a url")).toBeNull()
	})
})

describe("buildEndpoints", () => {
	test("returns nothing without a port", () => {
		expect(buildEndpoints(null, ["192.168.1.5"])).toEqual([])
	})

	test("builds URLs and labels for each address", () => {
		const eps = buildEndpoints(4101, ["192.168.1.5"])
		expect(eps).toEqual([{ url: "http://192.168.1.5:4101", type: "lan", label: "LAN" }])
	})

	test("sorts Tailscale before LAN regardless of input order", () => {
		const eps = buildEndpoints(4101, ["192.168.1.5", "100.90.0.2"])
		expect(eps.map((e) => e.type)).toEqual(["tailscale", "lan"])
		expect(eps[0].url).toBe("http://100.90.0.2:4101")
	})

	test("handles multiple LAN addresses", () => {
		const eps = buildEndpoints(3000, ["10.0.0.2", "192.168.1.5"])
		expect(eps).toHaveLength(2)
		expect(eps.every((e) => e.type === "lan")).toBe(true)
	})
})
