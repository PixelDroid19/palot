/**
 * Projects the user removed from Palot's sidebar.
 *
 * OpenCode has no project-delete API, so "remove project" is a local hide:
 * persisted by directory path and filtered out of the project list until
 * the user re-adds the folder (or clears the hide entry).
 */
import { atomWithStorage } from "jotai/utils"
import { atom } from "jotai"

const STORAGE_KEY = "palot:hiddenProjects"

/** Directory paths (worktrees) the user has removed from the sidebar. */
export const hiddenProjectDirsAtom = atomWithStorage<string[]>(STORAGE_KEY, [])

export const hideProjectDirAtom = atom(null, (get, set, directory: string) => {
	const current = get(hiddenProjectDirsAtom)
	if (current.includes(directory)) return
	set(hiddenProjectDirsAtom, [...current, directory])
})

export const unhideProjectDirAtom = atom(null, (get, set, directory: string) => {
	const current = get(hiddenProjectDirsAtom)
	if (!current.includes(directory)) return
	set(
		hiddenProjectDirsAtom,
		current.filter((d) => d !== directory),
	)
})

export function isProjectDirHidden(hidden: string[], directory: string): boolean {
	return hidden.includes(directory)
}
