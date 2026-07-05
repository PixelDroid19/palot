/**
 * React binding for the i18n core. The active locale is a persisted Jotai atom,
 * so switching locales updates every consumer and survives restarts.
 */
import { useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { useCallback, useMemo } from "react"
import {
	DEFAULT_LOCALE,
	type Locale,
	translate,
	type TranslationKey,
	type TranslationParams,
} from "./index"

export const localeAtom = atomWithStorage<Locale>("palot:locale", DEFAULT_LOCALE)

export interface UseTranslation {
	t: (key: TranslationKey, params?: TranslationParams) => string
	locale: Locale
	setLocale: (locale: Locale) => void
}

export function useTranslation(): UseTranslation {
	const [locale, setLocale] = useAtom(localeAtom)
	const t = useCallback(
		(key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
		[locale],
	)
	return useMemo(() => ({ t, locale, setLocale }), [t, locale, setLocale])
}
