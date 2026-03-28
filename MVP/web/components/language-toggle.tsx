'use client'

import { useRouter } from 'next/navigation'
import type { Lang } from '@/lib/i18n'
import { useLanguage } from '@/components/language-provider'

export function LanguageToggle() {
  const router = useRouter()
  const { lang, setLang, dict } = useLanguage()

  function handleChange(nextLang: Lang) {
    if (nextLang === lang) return
    setLang(nextLang)
    router.refresh()
  }

  return (
    <div className="language-toggle" aria-label={dict.language.label}>
      <span className="language-toggle-label">{dict.language.label}</span>
      <button
        type="button"
        onClick={() => handleChange('en')}
        className={`language-toggle-button ${lang === 'en' ? 'language-toggle-button--active' : ''}`}
      >
        {dict.language.english}
      </button>
      <button
        type="button"
        onClick={() => handleChange('zh')}
        className={`language-toggle-button ${lang === 'zh' ? 'language-toggle-button--active' : ''}`}
      >
        {dict.language.chinese}
      </button>
    </div>
  )
}
