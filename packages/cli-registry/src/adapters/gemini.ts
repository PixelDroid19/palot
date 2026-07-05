import type { CliAdapter } from "../types"

/**
 * Gemini CLI — Google's open-source coding CLI. OAuth / API-key credentials are
 * cached under `~/.gemini`.
 */
export const geminiAdapter: CliAdapter = {
	id: "gemini",
	displayName: "Gemini CLI",
	binaries: ["gemini"],
	versionArgs: ["--version"],
	authPaths: ["~/.gemini/oauth_creds.json", "~/.gemini/settings.json"],
	docsUrl: "https://github.com/google-gemini/gemini-cli",
	installHint: "npm install -g @google/gemini-cli",
	managed: false,
}
