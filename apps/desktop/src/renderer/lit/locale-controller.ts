/**
 * Lit ReactiveController for framework-agnostic i18n (en/es).
 * Reads/writes the same localStorage key as the React binding (`gcode:locale`)
 * so hybrid UI stays in sync, and publishes BusTopics.localeChanged.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit"
import {
	AVAILABLE_LOCALES,
	DEFAULT_LOCALE,
	type Locale,
	type TranslationKey,
	type TranslationParams,
	translate,
} from "../i18n"
import { BusTopics, gcodeBus } from "./bus"

const STORAGE_KEY = "gcode:locale"

function readStoredLocale(): Locale {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return DEFAULT_LOCALE
		const parsed = JSON.parse(raw) as string
		if (parsed === "en" || parsed === "es") return parsed
		// bare string storage
		if (raw === "en" || raw === "es") return raw
	} catch {
		// ignore
	}
	return DEFAULT_LOCALE
}

function writeStoredLocale(locale: Locale): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(locale))
	} catch {
		// ignore
	}
}

export class LocaleController implements ReactiveController {
	host: ReactiveControllerHost
	locale: Locale = DEFAULT_LOCALE
	private unsub: (() => void) | null = null

	constructor(host: ReactiveControllerHost) {
		this.host = host
		host.addController(this)
		this.locale = readStoredLocale()
	}

	hostConnected(): void {
		this.unsub = gcodeBus.subscribe<Locale>(BusTopics.localeChanged, (locale) => {
			if (locale === this.locale) return
			this.locale = locale
			this.host.requestUpdate()
		})
	}

	hostDisconnected(): void {
		this.unsub?.()
		this.unsub = null
	}

	t(key: TranslationKey, params?: TranslationParams): string {
		return translate(this.locale, key, params)
	}

	setLocale(locale: Locale): void {
		if (!AVAILABLE_LOCALES.includes(locale)) return
		if (locale === this.locale) return
		this.locale = locale
		writeStoredLocale(locale)
		gcodeBus.publish(BusTopics.localeChanged, locale)
		this.host.requestUpdate()
	}

	toggleLocale(): void {
		this.setLocale(this.locale === "en" ? "es" : "en")
	}
}

export { AVAILABLE_LOCALES, type Locale }
