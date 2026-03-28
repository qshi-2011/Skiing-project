'use client'

import { createContext, useContext, useState } from 'react'
import type { Lang } from '@/lib/i18n'
import { LANGUAGE_COOKIE, getDictionary } from '@/lib/i18n'

interface LanguageContextValue {
  lang: Lang
  setLang: (nextLang: Lang) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Lang
  children: React.ReactNode
}) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  function setLang(nextLang: Lang) {
    setLangState(nextLang)
    document.cookie = `${LANGUAGE_COOKIE}=${nextLang}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider')
  }

  return {
    ...context,
    dict: getDictionary(context.lang),
  }
}
