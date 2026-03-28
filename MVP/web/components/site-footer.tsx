import type { Lang } from '@/lib/i18n'
import { getDictionary } from '@/lib/i18n'

export function SiteFooter({ lang = 'en' }: { lang?: Lang }) {
  const dict = getDictionary(lang)

  return (
    <footer className="site-footer">
      <div className="site-footer-links">
        <a href="#">{dict.footer.privacy}</a>
        <a href="#">{dict.footer.terms}</a>
        <a href="#">{dict.footer.docs}</a>
      </div>
      <p className="site-footer-copy">&copy; {new Date().getFullYear()} SkiCoach AI. {dict.footer.rights}</p>
    </footer>
  )
}
