/**
 * XDG Base Directory paths for GCode automation storage.
 *
 * Follows the XDG Base Directory Specification, matching the convention
 * used by OpenCode (see packages/opencode/src/global/index.ts):
 *
 *   Config:  $XDG_CONFIG_HOME/gcode  (default ~/.config/gcode)
 *   Data:    $XDG_DATA_HOME/gcode    (default ~/.local/share/gcode)
 *
 * Legacy Palot installs used `~/.config/palot` and `~/.local/share/palot`.
 * On first access, if the new directory is missing and the legacy path
 * exists, we migrate by renaming (atomic when possible) so automations and
 * SQLite data are not lost.
 *
 * Automation configs live under config (human-editable JSON + prompt.md).
 * The SQLite database lives under data (machine-managed state).
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const APP_NAME = "gcode"
/** Previous product id — dual-read / one-time migrate only. */
const LEGACY_APP_NAME = "palot"

function xdgConfigHome(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
}

function xdgDataHome(): string {
	return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
}

/**
 * If `next` does not exist and `legacy` does, rename legacy → next.
 * Falls back to no-op on error (caller still gets the preferred path).
 */
function migrateDirOnce(legacy: string, next: string): void {
	try {
		if (fs.existsSync(next)) return
		if (!fs.existsSync(legacy)) return
		fs.mkdirSync(path.dirname(next), { recursive: true })
		fs.renameSync(legacy, next)
	} catch {
		// Non-fatal: keep preferred path; empty tree if rename failed.
	}
}

/**
 * Returns the XDG config directory for GCode.
 * Automations configs are stored at `<config>/automations/<id>/`.
 */
export function getConfigDir(): string {
	const next = path.join(xdgConfigHome(), APP_NAME)
	const legacy = path.join(xdgConfigHome(), LEGACY_APP_NAME)
	migrateDirOnce(legacy, next)
	return next
}

/**
 * Returns the XDG data directory for GCode.
 * The SQLite database is stored at `<data>/gcode.db`.
 *
 * Also migrates a legacy `palot.db` filename inside the data dir when present.
 */
export function getDataDir(): string {
	const next = path.join(xdgDataHome(), APP_NAME)
	const legacy = path.join(xdgDataHome(), LEGACY_APP_NAME)
	migrateDirOnce(legacy, next)
	// Filename rename inside data dir (palot.db → gcode.db)
	try {
		const oldDb = path.join(next, "palot.db")
		const newDb = path.join(next, "gcode.db")
		if (!fs.existsSync(newDb) && fs.existsSync(oldDb)) {
			fs.renameSync(oldDb, newDb)
		}
	} catch {
		// ignore
	}
	return next
}
