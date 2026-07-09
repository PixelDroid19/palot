/**
 * @gcode/cli-registry -- Detection and description of coding-agent CLIs.
 *
 * GCode is agent-runtime agnostic. This package models the coding-agent CLIs it
 * can work with (OpenCode, Claude Code, Codex, Cursor Agent, Gemini CLI) as
 * declarative {@link CliAdapter}s and probes the host to report which are
 * installed, their versions, and their auth state.
 *
 * The detection logic is pure and host-injected ({@link DetectionHost}), so it
 * is exercised both with fakes and against the real system in integration
 * tests. `createNodeHost()` provides the production implementation.
 *
 *   import { detectAll, createNodeHost } from "@gcode/cli-registry"
 *   const clis = await detectAll(createNodeHost())
 */

export {
	ADAPTERS,
	claudeAdapter,
	codexAdapter,
	cursorAdapter,
	geminiAdapter,
	getAdapter,
	opencodeAdapter,
} from "./adapters/index"
export { defaultParseVersion, detectAll, detectOne } from "./detect"
export { createNodeHost, expandHome, runCapture, whichOnPath } from "./host"
export type {
	AuthState,
	CliAdapter,
	CliDetection,
	CliId,
	DetectionHost,
} from "./types"
