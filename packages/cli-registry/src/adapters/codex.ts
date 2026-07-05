import type { CliAdapter } from "../types"

/**
 * Codex — OpenAI's coding CLI. Auth (API key or ChatGPT sign-in) is written to
 * `~/.codex/auth.json`.
 */
export const codexAdapter: CliAdapter = {
	id: "codex",
	displayName: "Codex",
	binaries: ["codex"],
	versionArgs: ["--version"],
	authPaths: ["~/.codex/auth.json"],
	docsUrl: "https://developers.openai.com/codex/cli",
	installHint: "npm install -g @openai/codex",
	managed: false,
}
