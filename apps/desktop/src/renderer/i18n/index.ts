/**
 * Minimal, dependency-free i18n core.
 *
 * Translation keys are dot-paths into the English base locale (see `en`), typed
 * so `t("codexSubagent.title")` is checked at compile time. Interpolation uses
 * `{{name}}` placeholders. New locales register here and must mirror `en`.
 */
import { en } from "./locales/en"

export type Locale = "en"

export const DEFAULT_LOCALE: Locale = "en"

type Messages = typeof en

/** Recursively collect dot-path keys whose leaves are strings. */
type DotPaths<T> = {
	[K in keyof T & string]: T[K] extends string ? K : `${K}.${DotPaths<T[K]>}`
}[keyof T & string]

export type TranslationKey = DotPaths<Messages>

export type TranslationParams = Record<string, string | number>

// Every locale must provide the same shape as the English base.
const LOCALES: Record<Locale, Messages> = {
	en,
}

export const AVAILABLE_LOCALES: Locale[] = Object.keys(LOCALES) as Locale[]

function lookup(messages: Messages, key: string): string | undefined {
	// biome-ignore lint/suspicious/noExplicitAny: dynamic dot-path walk over a typed object
	let node: any = messages
	for (const segment of key.split(".")) {
		if (node == null || typeof node !== "object") return undefined
		node = node[segment]
	}
	return typeof node === "string" ? node : undefined
}

/** Replace `{{name}}` placeholders with the provided params. */
export function interpolate(template: string, params?: TranslationParams): string {
	if (!params) return template
	return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match,
	)
}

/**
 * Translate a key for a locale. Falls back to the English base when a key is
 * missing from the requested locale, then to the key itself so nothing renders
 * blank.
 */
export function translate(
	locale: Locale,
	key: TranslationKey,
	params?: TranslationParams,
): string {
	const template = lookup(LOCALES[locale], key) ?? lookup(LOCALES[DEFAULT_LOCALE], key) ?? key
	return interpolate(template, params)
}
