/**
 * Composer context helpers — file references into the prompt (@ mentions).
 * Pure functions for unit tests without Electron file dialogs.
 */
import type { FileMention, PromptMention } from "../components/chat/prompt-mentions"
import { getMentionMarker, insertMentionIntoText } from "../components/chat/prompt-mentions"

/** Basename for display chips. */
export function fileDisplayName(path: string): string {
	const parts = path.replace(/\\/g, "/").split("/")
	return parts[parts.length - 1] || path
}

/** Build a file mention from an absolute or workspace-relative path. */
export function pathToFileMention(path: string): FileMention {
	const trimmed = path.trim()
	return {
		type: "file",
		path: trimmed,
		displayName: fileDisplayName(trimmed),
	}
}

export function pathsToFileMentions(paths: readonly string[]): FileMention[] {
	const seen = new Set<string>()
	const out: FileMention[] = []
	for (const p of paths) {
		const m = pathToFileMention(p)
		if (!m.path || seen.has(m.path)) continue
		seen.add(m.path)
		out.push(m)
	}
	return out
}

/**
 * Insert one file reference at the cursor (replaces trailing @query if present).
 * Returns updated text, cursor, and the mention to track in context chips.
 */
export function insertFileContextAtCursor(
	text: string,
	cursorPosition: number,
	path: string,
): { text: string; cursorPosition: number; mention: FileMention } {
	const mention = pathToFileMention(path)
	const result = insertMentionIntoText(text, cursorPosition, mention)
	return { ...result, mention }
}

/**
 * Append multiple file refs to the end of the prompt (picker → composer path).
 * Dedupes paths already present as `@displayName` markers.
 */
export function appendFileContextToPrompt(
	text: string,
	paths: readonly string[],
): { text: string; mentions: FileMention[] } {
	const mentions = pathsToFileMentions(paths)
	let next = text
	const added: FileMention[] = []
	for (const m of mentions) {
		const marker = getMentionMarker(m)
		if (next.includes(marker)) continue
		const pad = next.length > 0 && !/\s$/.test(next) ? " " : ""
		next = `${next}${pad}${marker}`
		added.push(m)
	}
	return { text: next.trimEnd() + (added.length && !next.endsWith(" ") ? " " : ""), mentions: added }
}

/**
 * Merge new mentions into an existing list without duplicates.
 */
export function mergeMentions(
	existing: readonly PromptMention[],
	incoming: readonly PromptMention[],
): PromptMention[] {
	const keys = new Set(
		existing.map((m) => (m.type === "file" ? `file:${m.path}` : `agent:${m.name}`)),
	)
	const out = [...existing]
	for (const m of incoming) {
		const key = m.type === "file" ? `file:${m.path}` : `agent:${m.name}`
		if (keys.has(key)) continue
		keys.add(key)
		out.push(m)
	}
	return out
}
