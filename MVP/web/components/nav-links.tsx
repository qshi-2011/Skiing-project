'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from './logout-button'

export function NavLinks({ isAuthenticated }: { isAuthenticated?: boolean }) {
  const pathname = usePathname()

  if (!isAuthenticated) {
    return (
      <nav className="topnav">
        <Link
          href="/sample-analysis"
          className={`topnav-link ${pathname === '/sample-analysis' ? 'topnav-link--active' : ''}`}
        >
          Sample Analysis
        </Link>
        <Link
          href="/login"
          className={`topnav-link ${pathname === '/login' ? 'topnav-link--active' : ''}`}
        >
          Login
        </Link>
        <Link href="/login" className="cta-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
          Get Started
        </Link>
      </nav>
    )
  }

  return (
    <nav className="topnav">
      <Link
        href="/upload"
        className={`topnav-link ${pathname === '/upload' ? 'topnav-link--active' : ''}`}
      >
        Analyse
      </Link>
      <Link
        href="/jobs"
        className={`topnav-link ${pathname.startsWith('/jobs') ? 'topnav-link--active' : ''}`}
      >
        Archive
      </Link>
      <LogoutButton />
    </nav>
  )
}
