import 'server-only'

import { cookies } from 'next/headers'
import { normalizeLang } from '@/lib/i18n'

export function readLanguage() {
  return normalizeLang(cookies().get('site_lang')?.value)
}
