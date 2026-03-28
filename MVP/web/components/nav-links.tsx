'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from './logout-button'
import { useLanguage } from '@/components/language-provider'

export function NavLinks({ isAuthenticated, isAnonymous }: { isAuthenticated?: boolean; isAnonymous?: boolean }) {
  const pathname = usePathname()
  const { dict } = useLanguage()

  if (!isAuthenticated) {
    return (
      <nav className="topnav">
        <Link
          href="/sample-analysis"
          className={`topnav-link ${pathname === '/sample-analysis' ? 'topnav-link--active' : ''}`}
        >
          {dict.nav.sample}
        </Link>
        <Link
          href="/login"
          className={`topnav-link ${pathname === '/login' ? 'topnav-link--active' : ''}`}
        >
          {dict.nav.login}
        </Link>
        <Link href="/signup" className="cta-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
          {dict.nav.getStarted}
        </Link>
      </nav>
    )
  }

  if (isAnonymous) {
    return (
      <nav className="topnav">
        <Link
          href="/upload"
          className={`topnav-link ${pathname === '/upload' ? 'topnav-link--active' : ''}`}
        >
          {dict.nav.upload}
        </Link>
        <Link href="/signup" className="cta-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
          {dict.nav.getStarted}
        </Link>
        <LogoutButton />
      </nav>
    )
  }

  return (
    <nav className="topnav">
      <Link
        href="/upload"
        className={`topnav-link ${pathname === '/upload' ? 'topnav-link--active' : ''}`}
      >
        {dict.nav.upload}
      </Link>
      <Link
        href="/jobs"
        className={`topnav-link ${pathname.startsWith('/jobs') ? 'topnav-link--active' : ''}`}
      >
        {dict.nav.archive}
      </Link>
      <Link
        href="/profile"
        className={`topnav-link ${pathname === '/profile' ? 'topnav-link--active' : ''}`}
      >
        {dict.nav.profile}
      </Link>
      <LogoutButton />
    </nav>
  )
}
