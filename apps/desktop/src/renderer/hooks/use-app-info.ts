import { useEffect, useState } from "react"
import type { AppInfo } from "@desktop/preload"

const isElectron = typeof window !== "undefined" && "palot" in window

export function useAppInfo() {
	const [info, setInfo] = useState<AppInfo | null>(null)

	useEffect(() => {
		if (!isElectron) return
		window.palot.getAppInfo().then(setInfo)
	}, [])

	return info
}
