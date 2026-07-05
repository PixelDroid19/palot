export { claudeAdapter, parseClaudeLine } from "./claude"
export { codexAdapter, parseCodexLine } from "./codex"

import { claudeAdapter } from "./claude"
import { codexAdapter } from "./codex"

/** Built-in adapters, in display order. */
export const BUILTIN_ADAPTERS = [codexAdapter, claudeAdapter] as const
