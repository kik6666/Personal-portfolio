import { safeHttpUrl } from '../utils/safe-url.js'

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function icon(name) {
  const node = element('i', `bi bi-${name}`)
  node.setAttribute('aria-hidden', 'true')
  return node
}

function formatIssueDate(value) {
  const date = new Date(value)
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) return null
  return {
    label: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
    iso: value,
  }
}

// A stored PDF takes priority; the official credential URL is the fallback.
export function certificateHref(certificate, resolveAssetUrl = () => null) {
  return safeHttpUrl(resolveAssetUrl(certificate?.pdf_path)) ?? safeHttpUrl(certificate?.credential_url)
}

function certificateVisual(certificate, title, resolveAssetUrl) {
  const visual = element('div', 'certificate-icon')
  const imageUrl = safeHttpUrl(resolveAssetUrl(certificate.preview_image_path))

  const showFallback = () => {
    visual.classList.remove('certificate-thumb')
    visual.replaceChildren(icon('award'))
  }

  if (!imageUrl) {
    showFallback()
    return visual
  }

  const image = element('img')
  image.src = imageUrl
  image.alt = `Preview of the ${title} certificate`
  image.loading = 'lazy'
  image.decoding = 'async'
  image.addEventListener('error', showFallback)
  visual.classList.add('certificate-thumb')
  visual.append(image)
  return visual
}

export function certificateCard(certificate, resolveAssetUrl = () => null) {
  const title = typeof certificate?.title === 'string' ? certificate.title.trim() : ''
  if (!title) return null

  const card = element('article', 'certificate-card')
  const content = element('div', 'certificate-content')

  const issued = formatIssueDate(certificate.issue_date)
  if (issued) {
    const time = element('time', 'certificate-date', issued.label)
    time.dateTime = issued.iso
    content.append(time)
  }

  content.append(element('h2', '', title))

  if (typeof certificate.issuer === 'string' && certificate.issuer.trim()) {
    content.append(element('p', 'certificate-recognition', certificate.issuer.trim()))
  }

  card.append(certificateVisual(certificate, title, resolveAssetUrl), content)

  const href = certificateHref(certificate, resolveAssetUrl)
  if (href) {
    const link = element('a', 'certificate-link')
    link.href = href
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.setAttribute('aria-label', `View certificate: ${title}`)
    link.append(element('span', '', 'View Certificate'), icon('arrow-up-right'))
    card.append(link)
  }

  return card
}

export function renderCertificates(container, certificates, resolveAssetUrl) {
  const cards = certificates.map((certificate) => certificateCard(certificate, resolveAssetUrl)).filter(Boolean)
  if (cards.length === 0) return 0

  const grid = element('div', 'certificate-grid')
  grid.append(...cards)
  container.replaceChildren(grid)
  return cards.length
}

export function renderCertificatesLoading(container) {
  const status = element('div', 'data-status', 'Loading certificates…')
  status.setAttribute('role', 'status')
  container.replaceChildren(status)
}

export function renderCertificatesEmpty(container) {
  const section = element('div', 'empty-state')
  const iconWrap = element('span', 'empty-state-icon')
  iconWrap.append(icon('award'))
  const link = element('a', 'btn btn-outline-primary', 'Get in touch')
  link.href = '/#contact'
  section.append(
    iconWrap,
    element('h2', '', 'Certificates coming soon'),
    element('p', '', 'Training certificates and recognitions will appear here as they are published.'),
    link,
  )
  container.replaceChildren(section)
}

export function renderCertificatesError(container, onRetry) {
  const box = element('div', 'data-status data-status-error')
  box.setAttribute('role', 'alert')
  const retry = element('button', 'btn btn-outline-primary btn-sm', 'Try again')
  retry.type = 'button'
  retry.addEventListener('click', onRetry)
  box.append(element('span', '', 'We could not load the certificates right now.'), retry)
  container.replaceChildren(box)
}
