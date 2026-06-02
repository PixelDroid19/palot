/**
 * Structured log context helpers for correlating logs across main/renderer.
 */

export type LogContext = Record<string, string | number | boolean | null | undefined>

/** Merge module tag with optional correlation fields (sessionId, runId, etc.). */
export function formatLogContext(module: string, context?: LogContext): LogContext {
	return { module, ...context }
}