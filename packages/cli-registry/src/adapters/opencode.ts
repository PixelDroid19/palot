import type { CliAdapter } from "../types"

/**
 * OpenCode — the agent runtime Palot manages directly today. Its auth lives in
 * an `auth.json` under the platform data/config dir.
 */
export const opencodeAdapter: CliAdapter = {
	id: "opencode",
	displayName: "OpenCode",
	binaries: ["opencode"],
	versionArgs: ["--version"],
	authPaths: [
		"~/.local/share/opencode/auth.json",
		"~/.config/opencode/auth.json",
		"~/Library/Application Support/opencode/auth.json",
	],
	docsUrl: "https://opencode.ai/docs",
	installHint: "curl -fsSL https://opencode.ai/install | bash",
	managed: true,
}
