/**
 * Client-side scale limits for Palot.
 *
 * Centralizes magic numbers so they can be tuned in one place.
 * Renderer and main process may import from here.
 */

/** Max messages kept in memory per session (oldest dropped on overflow). */
export const MAX_MESSAGES_PER_SESSION = 200

/** Sessions loaded per sidebar page when expanding a project. */
export const SESSIONS_PAGE_SIZE = 5

/** Max concurrent automation runs (main process semaphore). */
export const AUTOMATION_CONCURRENCY_LIMIT = 5

/** SSE event batch flush interval (ms), aligned with one frame at 60fps. */
export const FRAME_BUDGET_MS = 16