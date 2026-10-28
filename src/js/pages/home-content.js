// Expected public `site_content` keys (JSON string values):
//   full_name     - e.g. "Jane Doe"
//   headline      - parts separated by "|", e.g. "Role | Focus"
//   introduction  - short paragraph
export const SITE_CONTENT_KEYS = {
  name: 'full_name',
  headline: 'headline',
  introduction: 'introduction',
}

const FALLBACK_ICONS = {
  email: 'envelope',
  linkedin: 'linkedin',
  github: 'github',
  website: 'globe',
  other: 'link-45deg',
}

function textValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function readProfile(siteContent) {
  const content = siteContent ?? {}
  return {
    name: textValue(content[SITE_CONTENT_KEYS.name]),
    headline: textValue(content[SITE_CONTENT_KEYS.headline]),
    introduction: textValue(content[SITE_CONTENT_KEYS.introduction]),
  }
}

export function resolveProfileWithFallback(siteContent, fallbackProfile) {
  const published = readProfile(siteContent)
  return {
    name: published.name || textValue(fallbackProfile?.name),
    headline: published.headline || textValue(fallbackProfile?.headline),
    introduction: published.introduction || textValue(fallbackProfile?.introduction),
  }
}

export function safeContactHref(link) {
  const url = textValue(link?.url)
  if (!url) return null

  if (link.link_type === 'email') {
    return /^mailto:[^\s]+$/i.test(url) ? url : null
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}

function iconClass(link) {
  const name = textValue(link.icon_name)
  const icon = /^[a-z0-9-]{1,40}$/.test(name) ? name : (FALLBACK_ICONS[link.link_type] ?? FALLBACK_ICONS.other)
  return `bi bi-${icon}`
}

function contactDetail(link, href) {
  if (link.link_type === 'email') return href.replace(/^mailto:/i, '').split('?')[0]
  return new URL(href).hostname.replace(/^www\./, '')
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function renderHeadline(target, headline) {
  target.replaceChildren()
  headline
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part, index) => {
      if (index > 0) {
        const separator = element('span', '', '·')
        separator.setAttribute('aria-hidden', 'true')
        target.append(' ', separator, ' ')
      }
      target.append(part)
    })
  target.hidden = target.childNodes.length === 0
}

export function contactCard(link) {
  const href = safeContactHref(link)
  const label = textValue(link?.label)
  if (!href || !label) return null

  const card = element('a', 'contact-card')
  card.href = href
  if (link.link_type !== 'email') {
    card.target = '_blank'
    card.rel = 'noopener noreferrer'
  }

  const icon = element('span', 'contact-icon')
  const glyph = element('i', iconClass(link))
  glyph.setAttribute('aria-hidden', 'true')
  icon.append(glyph)

  const body = element('span')
  body.append(element('strong', '', label), element('small', '', contactDetail(link, href)))

  const arrow = element('i', 'bi bi-arrow-up-right contact-arrow')
  arrow.setAttribute('aria-hidden', 'true')

  card.append(icon, body, arrow)
  return card
}

export function renderContactCards(container, links) {
  const columns = links
    .map(contactCard)
    .filter(Boolean)
    .map((card) => {
      const column = element('div', 'col-12 col-sm-6')
      column.append(card)
      return column
    })
  container.replaceChildren(...columns)
  return columns.length
}

export function statusMessage(text, onRetry) {
  const wrapper = element('div', 'col-12')
  const box = element('div', `data-status${onRetry ? ' data-status-error' : ''}`)
  box.setAttribute('role', onRetry ? 'alert' : 'status')
  box.append(element('span', '', text))

  if (onRetry) {
    const button = element('button', 'btn btn-outline-primary btn-sm', 'Try again')
    button.type = 'button'
    button.addEventListener('click', onRetry)
    box.append(button)
  }

  wrapper.append(box)
  return wrapper
}
