/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react"

import { translate, type TranslationParams } from "@/lib/i18n"
import type { Locale, Pilot } from "@/lib/types"

interface PreferencesContextValue {
  locale: Locale
  pilot: Pilot
  setLocale: (locale: Locale) => void
  setPilot: (pilot: Pilot) => void
  t: (key: string, params?: TranslationParams) => string
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

const localeStorageKey = "eat.web.locale"
const pilotStorageKey = "eat.web.pilot"

function getStoredLocale(): Locale {
  const stored = window.localStorage.getItem(localeStorageKey)
  return stored === "en" ? "en" : "zh-CN"
}

function getStoredPilot(): Pilot {
  const stored = window.localStorage.getItem(pilotStorageKey)
  return stored === "shinji" ? "shinji" : "rei"
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale())
  const [pilot, setPilotState] = useState<Pilot>(() => getStoredPilot())

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale)
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    window.localStorage.setItem(pilotStorageKey, pilot)
    document.documentElement.dataset.pilot = pilot
    document.documentElement.classList.toggle("dark", pilot === "shinji")
  }, [pilot])

  const value = useMemo<PreferencesContextValue>(
    () => ({
      locale,
      pilot,
      setLocale: (nextLocale) => {
        startTransition(() => setLocaleState(nextLocale))
      },
      setPilot: (nextPilot) => {
        startTransition(() => setPilotState(nextPilot))
      },
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, pilot],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider.")
  }
  return context
}
