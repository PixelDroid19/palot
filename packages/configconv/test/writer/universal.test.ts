import { afterEach, describe, expect, test } from "bun:test"
import { lstat, mkdir, readlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createEmptyReport } from "../../src/types/canonical"
import type { CanonicalConversionResult } from "../../src/types/canonical"
import { universalWrite } from "../../src/writer/universal"

function tempDir(): string {
	return join(tmpdir(), `configconv-universal-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function makeConversion(overrides: Partial<CanonicalConversionResult> = {}): CanonicalConversionResult {
	return {
		sourceFormat: overrides.sourceFormat ?? "claude-code",
		targetFormat: overrides.targetFormat ?? "opencode",
		globalConfig: overrides.globalConfig ?? {},
		projectConfigs: overrides.projectConfigs ?? new Map(),
		agents: overrides.agents ?? new Map(),
		commands: overrides.commands ?? new Map(),
		rules: overrides.rules ?? new Map(),
		linkedDirs: overrides.linkedDirs ?? new Map(),
		extraFiles: overrides.extraFiles ?? new Map(),
		report: overrides.report ?? createEmptyReport(),
	}
}

describe("universalWrite", () => {
	const tempDirs: string[] = []

	afterEach(async () => {
		for (const dir of tempDirs) {
			try {
				await rm(dir, { recursive: true, force: true })
			} catch {}
		}
		tempDirs.length = 0
	})

	test("writes linked skill directories as symlinks", async () => {
		const dir = tempDir()
		tempDirs.push(dir)

		const sourceSkillDir = join(dir, "source-skills", "research")
		const targetSkillDir = join(dir, "target", ".opencode", "skills", "research")
		await mkdir(sourceSkillDir, { recursive: true })

		const linkedDirs = new Map<string, string>()
		linkedDirs.set(targetSkillDir, sourceSkillDir)

		const result = await universalWrite(makeConversion({ linkedDirs }), {
			force: true,
		})

		expect(result.filesWritten).toContain(targetSkillDir)

		const stats = await lstat(targetSkillDir)
		expect(stats.isSymbolicLink()).toBe(true)
		expect(await readlink(targetSkillDir)).toBe(sourceSkillDir)
	})
})
