import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NavLinks } from '@/components/nav-links'
import { LanguageProvider } from '@/components/language-provider'
import { LanguageToggle } from '@/components/language-toggle'
import { getDictionary } from '@/lib/i18n'
import { readLanguage } from '@/lib/i18n-server'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SkiCoach AI',
  description: 'Video-based ski coaching with alpine run recaps, moments, and progress tracking.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = readLanguage()
  const dict = getDictionary(lang)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthenticated = !!user
  const isAnonymous = user?.is_anonymous === true

  return (
    <html lang={lang === 'zh' ? 'zh-CN' : 'en'} className={manrope.variable}>
      <body>
        <LanguageProvider initialLang={lang}>
          <div className="site-shell">
            <header className="site-topbar">
              <Link href="/" className="brand-lockup">
                <span className="brand-mark">S</span>
                <span className="brand-wordmark">{dict.meta.brand}</span>
              </Link>

              <div className="topbar-actions">
                <LanguageToggle />
                <NavLinks isAuthenticated={isAuthenticated} isAnonymous={isAnonymous} />
              </div>
            </header>

            <main className="page-shell">{children}</main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  )
}
