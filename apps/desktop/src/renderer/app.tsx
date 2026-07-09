import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { Provider as JotaiProvider } from "jotai"
import { appStore } from "./atoms/store"
import { queryClient } from "./lib/query-client"
import { router } from "./router"
import { restoreRuntimeSessions } from "./services/runtime-session-launch"

// Rehydrate CLI-backed sessions (Codex, Claude Code, …) before first render so
// they appear in the sidebar and their transcripts survive reloads.
restoreRuntimeSessions()

export function App() {
	return (
		<JotaiProvider store={appStore}>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</JotaiProvider>
	)
}
