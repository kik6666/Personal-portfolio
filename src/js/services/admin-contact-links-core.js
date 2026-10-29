import {
  ContactLinkValidationError,
  normalizeSortOrder,
  validateContactLinkInput,
  normalizeContactValue,
} from './contact-links-validation.js'

export class AdminContactLinksError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'AdminContactLinksError'
    this.code = code
  }
}

const UNIQUE_VIOLATION = '23505'

function isDuplicateError(error) {
  return error?.code === UNIQUE_VIOLATION
    || /contact_links_url_unique|duplicate key/i.test(String(error?.message ?? ''))
}

function wrapWriteError(error) {
  if (isDuplicateError(error)) {
    return new AdminContactLinksError(
      'duplicate-url',
      'A contact link with this address already exists. Edit the existing link instead.',
      { cause: error },
    )
  }
  return error
}

function requireId(id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new AdminContactLinksError('invalid-id', 'Choose a contact link.')
  }
  return id
}

function normalizeRecord(record) {
  if (
    !record
    || typeof record.id !== 'string'
    || typeof record.label !== 'string'
    || typeof record.link_type !== 'string'
    || typeof record.url !== 'string'
    || typeof record.is_public !== 'boolean'
  ) {
    throw new AdminContactLinksError('invalid-record', 'A contact link has an invalid format.')
  }
  return Object.freeze({
    id: record.id,
    label: record.label,
    link_type: record.link_type,
    url: record.url,
    icon_name: typeof record.icon_name === 'string' ? record.icon_name : '',
    sort_order: Number.isInteger(record.sort_order) ? record.sort_order : 0,
    is_public: record.is_public,
    created_at: record.created_at ?? null,
    updated_at: record.updated_at ?? null,
  })
}

export function sortContactLinks(records) {
  return [...records].sort((a, b) => (
    a.sort_order - b.sort_order
    || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    || a.id.localeCompare(b.id)
  ))
}

function normalizeList(records) {
  if (!Array.isArray(records)) {
    throw new AdminContactLinksError('invalid-response', 'The contact link response was invalid.')
  }
  return sortContactLinks(records.map(normalizeRecord))
}

export function createAdminContactLinksOperations({ repository, ensureAdmin } = {}) {
  if (
    !repository
    || ['list', 'insert', 'update', 'delete'].some((name) => typeof repository[name] !== 'function')
    || typeof ensureAdmin !== 'function'
  ) {
    throw new TypeError('Contact link operations require a repository and administrator check.')
  }

  async function updateConfirmed(id, fields) {
    try {
      const record = await repository.update(id, fields)
      if (!record || record.id !== id) {
        throw new AdminContactLinksError(
          'update-unconfirmed',
          'The database did not confirm the contact link update.',
        )
      }
      return normalizeRecord(record)
    } catch (error) {
      throw wrapWriteError(error)
    }
  }

  return Object.freeze({
    async list() {
      await ensureAdmin()
      return normalizeList(await repository.list())
    },

    // New links are always saved as drafts; editing never changes publication or order.
    async save(input) {
      const fields = validateContactLinkInput(input)
      await ensureAdmin()

      if (input.id === undefined || input.id === null || input.id === '') {
        const existing = normalizeList(await repository.list())
        const nextOrder = existing.reduce((max, link) => Math.max(max, link.sort_order), -1) + 1
        try {
          const record = await repository.insert({
            ...fields,
            sort_order: normalizeSortOrder(Math.min(nextOrder, 9999)),
            is_public: false,
          })
          if (!record) {
            throw new AdminContactLinksError('insert-unconfirmed', 'The database did not confirm the new contact link.')
          }
          return normalizeRecord(record)
        } catch (error) {
          throw wrapWriteError(error)
        }
      }

      return updateConfirmed(requireId(input.id), fields)
    },

    async setPublished(id, isPublic) {
      requireId(id)
      if (typeof isPublic !== 'boolean') {
        throw new AdminContactLinksError('invalid-publication-state', 'Choose whether the link is a draft or published.')
      }
      await ensureAdmin()

      if (isPublic) {
        const current = normalizeList(await repository.list()).find((link) => link.id === id)
        if (!current) {
          throw new AdminContactLinksError('not-found', 'This contact link no longer exists.')
        }
        try {
          normalizeContactValue(current.link_type, current.url)
        } catch (error) {
          if (error instanceof ContactLinkValidationError) {
            throw new AdminContactLinksError(
              'unsafe-published-link',
              `This link cannot be published: ${error.message} Edit it first.`,
              { cause: error },
            )
          }
          throw error
        }
      }
      return updateConfirmed(id, { is_public: isPublic })
    },

    async move(id, direction) {
      requireId(id)
      if (direction !== 'up' && direction !== 'down') {
        throw new AdminContactLinksError('invalid-direction', 'Choose a direction to move the link.')
      }
      await ensureAdmin()

      const ordered = normalizeList(await repository.list())
      const index = ordered.findIndex((link) => link.id === id)
      if (index === -1) {
        throw new AdminContactLinksError('not-found', 'This contact link no longer exists.')
      }
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= ordered.length) {
        return Object.freeze({ moved: false, updated: [], failed: [] })
      }

      const arranged = [...ordered]
      ;[arranged[index], arranged[target]] = [arranged[target], arranged[index]]

      const updated = []
      const failed = []
      for (const [position, link] of arranged.entries()) {
        if (link.sort_order === position) continue
        try {
          updated.push(await updateConfirmed(link.id, { sort_order: normalizeSortOrder(position) }))
        } catch (error) {
          failed.push(Object.freeze({
            id: link.id,
            label: link.label,
            message: error?.message || 'The new order could not be saved.',
          }))
        }
      }
      return Object.freeze({ moved: failed.length === 0, updated, failed })
    },

    async delete(id, { confirmed } = {}) {
      requireId(id)
      if (confirmed !== true) {
        throw new AdminContactLinksError('confirmation-required', 'Confirm the deletion before removing a contact link.')
      }
      await ensureAdmin()
      await repository.delete(id)
    },
  })
}
