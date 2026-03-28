export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-links">
        <a href="#">Privacy Policy</a>
        <a href="#">Terms of Service</a>
        <a href="#">Technical Docs</a>
      </div>
      <p className="site-footer-copy">&copy; {new Date().getFullYear()} SkiCoach AI. All rights reserved.</p>
    </footer>
  )
}
