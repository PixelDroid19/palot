/**
 * Onboarding completion state — same localStorage key as former jotai atom.
 */
export interface OnboardingState {
	completed: boolean
	completedAt: string | null
	skippedSteps: string[]
	migrationPerformed: boolean
	migratedFrom: string[]
	projectRuntimeVersion: string | null
	providersConnected: number
}

const KEY = "gcode:onboarding"

const DEFAULT: OnboardingState = {
	completed: false,
	completedAt: null,
	skippedSteps: [],
	migrationPerformed: false,
	migratedFrom: [],
	projectRuntimeVersion: null,
	providersConnected: 0,
}

export function readOnboardingState(): OnboardingState {
	try {
		const raw = localStorage.getItem(KEY)
		if (!raw) return { ...DEFAULT }
		const parsed = JSON.parse(raw) as OnboardingState
		return { ...DEFAULT, ...parsed }
	} catch {
		return { ...DEFAULT }
	}
}

export function writeOnboardingState(partial: Partial<OnboardingState>): OnboardingState {
	const next = { ...readOnboardingState(), ...partial }
	localStorage.setItem(KEY, JSON.stringify(next))
	return next
}

export function markOnboardingComplete(): OnboardingState {
	return writeOnboardingState({
		completed: true,
		completedAt: new Date().toISOString(),
	})
}

/** Reset the wizard so Setup can deliberately relaunch onboarding. */
export function markOnboardingIncomplete(): OnboardingState {
	return writeOnboardingState({
		completed: false,
		completedAt: null,
		skippedSteps: [],
		migrationPerformed: false,
		migratedFrom: [],
		projectRuntimeVersion: null,
		providersConnected: 0,
	})
}
