export const CONTACT_LINK_TYPES = Object.freeze([
  Object.freeze({ value: 'email', label: 'Email', defaultIcon: 'envelope' }),
  Object.freeze({ value: 'linkedin', label: 'LinkedIn', defaultIcon: 'linkedin' }),
  Object.freeze({ value: 'github', label: 'GitHub', defaultIcon: 'github' }),
  Object.freeze({ value: 'website', label: 'Website', defaultIcon: 'globe' }),
  Object.freeze({ value: 'other', label: 'Other', defaultIcon: 'link-45deg' }),
])

export const CONTACT_ICON_OPTIONS = Object.freeze([
  'envelope',
  'linkedin',
  'github',
  'globe',
  'link-45deg',
  'person-lines-fill',
  'briefcase',
  'twitter-x',
  'instagram',
  'facebook',
  'youtube',
  'behance',
  'dribbble',
  'medium',
  'telegram',
])

export const CONTACT_LABEL_MAX_LENGTH = 60
export const CONTACT_URL_MAX_LENGTH = 2048
export const CONTACT_EMAIL_MAX_LENGTH = 254
export const CONTACT_SORT_ORDER_MAX = 9999

const TYPE_BY_VALUE = new Map(CONTACT_LINK_TYPES.map((type) => [type.value, type]))
const ICON_SET = new Set(CONTACT_ICON_OPTIONS)
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
const WHITESPACE = /\s/
const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const HOST_RULES = Object.freeze({
  linkedin: 'linkedin.com',
  github: 'github.com',
})

export class ContactLinkValidationError extends Error {
  constructor(code, message, field) {
    super(message)
    this.name = 'ContactLinkValidationError'
    this.code = code
    this.field = field
  }
}

function fail(code, message, field) {
  throw new ContactLinkValidationError(code, message, field)
}

export function defaultIconFor(linkType) {
  return TYPE_BY_VALUE.get(linkType)?.defaultIcon ?? 'link-45deg'
}

export function normalizeContactLabel(value) {
  if (typeof value !== 'string') fail('invalid-label', 'Enter a label.', 'label')
  const label = value.trim()
  if (!label) fail('label-required', 'Enter a label.', 'label')
  if (CONTROL_CHARACTERS.test(label)) {
    fail('invalid-label', 'The label contains characters that are not allowed.', 'label')
  }
  if (label.length > CONTACT_LABEL_MAX_LENGTH) {
    fail('label-too-long', `The label must be no longer than ${CONTACT_LABEL_MAX_LENGTH} characters.`, 'label')
  }
  return label
}

export function normalizeContactEmail(value) {
  if (typeof value !== 'string') fail('invalid-email', 'Enter a valid email address.', 'value')
  let address = value.trim()
  if (!address) fail('value-required', 'Enter an email address.', 'value')
  if (CONTROL_CHARACTERS.test(address) || WHITESPACE.test(address)) {
    fail('invalid-email', 'The email address contains characters that are not allowed.', 'value')
  }
  address = address.replace(/^mailto:/i, '').toLowerCase()
  if (address.length > CONTACT_EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(address)) {
    fail('invalid-email', 'Enter a valid email address, for example name@example.com.', 'value')
  }
  return `mailto:${address}`
}

export function normalizeContactUrl(value, linkType) {
  if (typeof value !== 'string') fail('invalid-url', 'Enter a valid https:// URL.', 'value')
  const raw = value.trim()
  if (!raw) fail('value-required', 'Enter a URL.', 'value')
  if (CONTROL_CHARACTERS.test(raw) || WHITESPACE.test(raw)) {
    fail('invalid-url', 'The URL contains characters that are not allowed.', 'value')
  }
  if (raw.length > CONTACT_URL_MAX_LENGTH) {
    fail('url-too-long', `The URL must be no longer than ${CONTACT_URL_MAX_LENGTH} characters.`, 'value')
  }

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    fail('invalid-url', 'Enter a valid URL that starts with https://.', 'value')
  }
  if (parsed.protocol !== 'https:') {
    fail('insecure-url', 'Only https:// URLs are allowed.', 'value')
  }
  if (parsed.username || parsed.password) {
    fail('credentials-in-url', 'The URL must not contain a username or password.', 'value')
  }
  if (!parsed.hostname.includes('.')) {
    fail('invalid-url', 'Enter a URL with a public domain name.', 'value')
  }

  const requiredHost = HOST_RULES[linkType]
  if (requiredHost && parsed.hostname !== requiredHost && !parsed.hostname.endsWith(`.${requiredHost}`)) {
    fail(
      'wrong-host',
      `A ${TYPE_BY_VALUE.get(linkType).label} link must point to ${requiredHost}.`,
      'value',
    )
  }
  return parsed.href
}

export function normalizeContactValue(linkType, value) {
  return linkType === 'email' ? normalizeContactEmail(value) : normalizeContactUrl(value, linkType)
}

export function normalizeContactIcon(linkType, value) {
  if (value === undefined || value === null || value === '') return defaultIconFor(linkType)
  if (typeof value !== 'string' || !ICON_SET.has(value)) {
    fail('invalid-icon', 'Choose an icon from the list.', 'icon_name')
  }
  return value
}

export function validateContactLinkInput(input) {
  const linkType = input?.link_type
  if (!TYPE_BY_VALUE.has(linkType)) {
    fail('invalid-type', 'Choose a supported link type.', 'link_type')
  }
  return Object.freeze({
    label: normalizeContactLabel(input.label),
    link_type: linkType,
    url: normalizeContactValue(linkType, input.value),
    icon_name: normalizeContactIcon(linkType, input.icon_name),
  })
}

export function normalizeSortOrder(value) {
  if (!Number.isInteger(value) || value < 0 || value > CONTACT_SORT_ORDER_MAX) {
    fail('invalid-sort-order', 'The display order is invalid.', 'sort_order')
  }
  return value
}

export function contactValueForEditing(link) {
  return link?.link_type === 'email' ? String(link.url ?? '').replace(/^mailto:/i, '') : String(link?.url ?? '')
}
