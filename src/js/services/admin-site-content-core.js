export const SITE_PROFILE_FIELDS = Object.freeze([
  Object.freeze({ key: 'full_name', label: 'Full name', maxLength: 120 }),
  Object.freeze({ key: 'headline', label: 'Professional headline', maxLength: 200 }),
  Object.freeze({ key: 'introduction', label: 'Introduction', maxLength: 1500 }),
])

const PROFILE_FIELD_BY_KEY = new Map(SITE_PROFILE_FIELDS.map((field) => [field.key, field]))

export class AdminSiteContentError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'AdminSiteContentError'
    this.code = code
  }
}

export function validateSiteContentChange(change) {
  const field = PROFILE_FIELD_BY_KEY.get(change?.key)
  if (!field) {
    throw new AdminSiteContentError('invalid-key', 'Choose a supported profile field.')
  }
  if (typeof change.value !== 'string') {
    throw new AdminSiteContentError('invalid-value', `${field.label} must be plain text.`)
  }
  if (change.value.length > field.maxLength) {
    throw new AdminSiteContentError(
      'value-too-long',
      `${field.label} must be no longer than ${field.maxLength} characters.`,
    )
  }
  if (typeof change.is_public !== 'boolean') {
    throw new AdminSiteContentError('invalid-publication-state', `Choose whether ${field.label} is a draft or published.`)
  }
  if (change.is_public && !change.value.trim()) {
    throw new AdminSiteContentError('empty-published-value', `${field.label} needs a value before it can be published.`)
  }

  return Object.freeze({
    key: field.key,
    value: change.value.trim(),
    is_public: change.is_public,
  })
}

function normalizeRecords(records) {
  if (!Array.isArray(records)) {
    throw new AdminSiteContentError('invalid-response', 'The site content response was invalid.')
  }

  const normalized = {}
  for (const record of records) {
    const field = PROFILE_FIELD_BY_KEY.get(record?.key)
    if (!field) continue
    if (typeof record.value !== 'string' || typeof record.is_public !== 'boolean') {
      throw new AdminSiteContentError(
        'invalid-record',
        `The saved ${field.label.toLowerCase()} has an invalid format. No values were changed.`,
      )
    }
    normalized[field.key] = Object.freeze({
      key: field.key,
      value: record.value,
      is_public: record.is_public,
    })
  }

  return normalized
}

export function createAdminSiteContentOperations({ repository, ensureAdmin } = {}) {
  if (
    !repository
    || typeof repository.list !== 'function'
    || typeof repository.upsert !== 'function'
    || typeof ensureAdmin !== 'function'
  ) {
    throw new TypeError('Site content operations require a repository and administrator check.')
  }

  return Object.freeze({
    async list() {
      await ensureAdmin()
      return normalizeRecords(await repository.list())
    },

    async save(changes = []) {
      if (!Array.isArray(changes)) {
        throw new AdminSiteContentError('invalid-changes', 'The requested site content changes were invalid.')
      }

      const validated = changes.map(validateSiteContentChange)
      const keys = new Set(validated.map(({ key }) => key))
      if (keys.size !== validated.length) {
        throw new AdminSiteContentError('duplicate-key', 'Each profile field can be saved only once per request.')
      }

      await ensureAdmin()
      const saved = []
      const failed = []

      for (const change of validated) {
        try {
          const record = await repository.upsert(change)
          if (!record || record.key !== change.key) {
            throw new AdminSiteContentError(
              'save-unconfirmed',
              'The database did not confirm this field was saved.',
            )
          }
          saved.push(normalizeRecords([record])[change.key])
        } catch (error) {
          failed.push(Object.freeze({
            key: change.key,
            message: error?.message || 'This field could not be saved.',
          }))
        }
      }

      return Object.freeze({ saved, failed })
    },
  })
}
