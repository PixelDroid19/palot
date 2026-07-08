/**
 * Thin public facade for the CLI runtime. The implementation now lives in
 * smaller internal modules so the rest of the app can depend on narrower
 * runtime layers instead of one grab-bag file.
 */
export {
	forgetCliSession,
	persistCliSession,
	restoreCliSessions,
} from "./cli-chat-persistence"
export {
	buildConversationHandoff,
	consumeProjectRuntimeHandoff,
	createCliSession,
	switchCliRuntime,
	switchCliSessionToProjectRuntime,
} from "./cli-chat-session"
export {
	answerCliQuestion,
	cancelCliTurn,
	isCliTurnActive,
	respondCliPermission,
	runCliTurn,
} from "./cli-chat-turn"
