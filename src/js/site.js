import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'bootstrap/js/dist/collapse.js'
import '../css/style.css'
import { profile } from './content.js'

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

export function headlineMarkup() {
  return profile.headline
    .split('|')
    .map((part) => escapeHtml(part.trim()))
    .join(' <span aria-hidden="true">·</span> ')
}

const pages = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'cv', label: 'CV', href: '/cv/' },
  { id: 'business-card', label: 'Business Card', href: '/business-card/' },
  { id: 'projects', label: 'Projects', href: '/projects/' },
  { id: 'certificates', label: 'Certificates', href: '/certificates/' },
]

export function mountSite(activePage) {
  const header = document.querySelector('#site-header')
  const footer = document.querySelector('#site-footer')

  if (!header || !footer) {
    throw new Error('The page is missing a shared header or footer mount point.')
  }

  header.innerHTML = `
    <header class="site-header">
      <nav class="navbar navbar-expand-lg" aria-label="Main navigation">
        <div class="container site-container">
          <a class="navbar-brand brand-link" href="/" aria-label="${escapeHtml(profile.name)} home">
            <span class="brand-mark" aria-hidden="true">KP</span>
            <span>${escapeHtml(profile.name)}</span>
          </a>
          <button
            class="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#primary-navigation"
            aria-controls="primary-navigation"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="primary-navigation">
            <ul class="navbar-nav ms-auto">
              ${pages.map(({ id, label, href }) => `
                <li class="nav-item">
                  <a class="nav-link${id === activePage ? ' active' : ''}" href="${href}"${id === activePage ? ' aria-current="page"' : ''}>${label}</a>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </nav>
    </header>
  `

  footer.innerHTML = `
    <footer class="site-footer">
      <div class="container site-container footer-content">
        <p class="mb-0">&copy; ${new Date().getFullYear()} ${escapeHtml(profile.name)}</p>
        <a href="mailto:${escapeHtml(profile.email)}">Get in touch <i class="bi bi-arrow-up-right" aria-hidden="true"></i></a>
      </div>
    </footer>
  `
}

export function pageHeading(eyebrow, title, description) {
  return `
    <header class="page-heading">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      <p class="page-lead">${description}</p>
    </header>
  `
}

export function backHomeLink() {
  return '<a class="back-home" href="/"><i class="bi bi-arrow-left" aria-hidden="true"></i> Back to Home</a>'
}
