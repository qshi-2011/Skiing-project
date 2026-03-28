'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'

export function LogoutButton() {
  const router = useRouter()
  const { dict } = useLanguage()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="topnav-link"
      style={{ cursor: 'pointer', background: 'none', border: 'none' }}
    >
      {dict.nav.logout}
    </button>
  )
}
