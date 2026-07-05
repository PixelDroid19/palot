import os from "node:os"
import { createLogger } from "./logger"
import { getServerUrl } from "./opencode-manager"

const log = createLogger("remote-access")

export interface RemoteAccessInfo {
	/** Loopback server URL as seen by this machine, or null if the server isn't running. */
	url: string | null
	/** LAN-reachable URLs another device on the same network can connect to. */
	lanUrls: string[]
	/** The port the OpenCode server is listening on, or null. */
	port: number | null
}

/** Collect non-internal IPv4 addresses for this host. */
function lanAddresses(): string[] {
	const addrs: string[] = []
	const ifaces = os.networkInterfaces()
	for (const name of Object.keys(ifaces)) {
		for (const info of ifaces[name] ?? []) {
			if (info.family === "IPv4" && !info.internal) {
				addrs.push(info.address)
			}
		}
	}
	return addrs
}

/**
 * Describe how to reach the running OpenCode server from another device
 * (a laptop's Palot, the web build, or a phone browser) on the same LAN.
 */
export function getRemoteAccessInfo(): RemoteAccessInfo {
	const url = getServerUrl()
	if (!url) {
		return { url: null, lanUrls: [], port: null }
	}

	let port: number | null = null
	try {
		port = Number.parseInt(new URL(url).port, 10) || null
	} catch {
		port = null
	}

	const lanUrls = port ? lanAddresses().map((ip) => `http://${ip}:${port}`) : []
	log.info("Remote access info", { port, lanCount: lanUrls.length })
	return { url, lanUrls, port }
}
