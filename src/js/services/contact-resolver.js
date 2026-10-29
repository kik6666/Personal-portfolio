import { safeContactHref } from '../pages/home-content.js'

// Only published rows reach this code; rows that fail the public safety check are ignored.
function usablePublicLinks(links, linkType) {
  return (Array.isArray(links) ? links : [])
    .filter((link) => link?.is_public !== false && link?.link_type === linkType && safeContactHref(link))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function emailAddress(link) {
  return safeContactHref(link).replace(/^mailto:/i, '')
}

export function linkedinLabel(url) {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

/**
 * Chooses the two Business Card email slots and the LinkedIn link.
 * Published emails come first (by sort_order); remaining slots use the static
 * fallback addresses that are not already shown.
 */
export function resolveBusinessCardContacts(publicLinks, fallback) {
  const emails = usablePublicLinks(publicLinks, 'email').slice(0, 2).map(emailAddress)
  for (const address of fallback.emails) {
    if (emails.length >= 2) break
    if (!emails.some((existing) => existing.toLowerCase() === address.toLowerCase())) emails.push(address)
  }

  const [linkedin] = usablePublicLinks(publicLinks, 'linkedin')
  const linkedinUrl = linkedin ? safeContactHref(linkedin) : fallback.linkedinUrl

  return { emails, linkedinUrl, linkedinLabel: linkedinLabel(linkedinUrl) }
}
