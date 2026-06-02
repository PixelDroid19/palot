/**
 * Public shell API for feature modules.
 * Features must import shell UI from here — not deep paths into components/.
 */

export { APP_BAR_HEIGHT } from "./app-bar"
export { PalotWordmark } from "./palot-wordmark"
export {
	type DiffComment,
	diffCommentsFamily,
	serializeCommentsForChat,
} from "./review/review-comments"
export { SessionView } from "./session-view"
export { useSetSidebarSlot } from "./sidebar-slot-context"