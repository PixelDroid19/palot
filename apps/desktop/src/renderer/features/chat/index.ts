/** Public API for the chat feature. */

export { ChatView } from "./ui/chat-view"
export { ChatTurnComponent } from "./ui/chat-turn"
export { ChatToolCall } from "./ui/chat-tool-call"
export {
	type MentionOption,
	MentionPopover,
	type MentionPopoverHandle,
} from "./ui/mention-popover"
export { PromptAttachmentPreview } from "./ui/prompt-attachments"
export {
	createAgentMention,
	createFileMention,
	insertMentionIntoText,
} from "./ui/prompt-mentions"
export { PromptToolbar, StatusBar } from "./ui/prompt-toolbar"
export {
	AgentSelector,
	ModelSelector,
	VariantSelector,
} from "./ui/prompt-toolbar"