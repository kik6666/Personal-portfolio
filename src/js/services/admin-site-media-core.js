import {
  isSafePortfolioAssetPath,
  PORTFOLIO_ASSET_PURPOSES,
  validatePortfolioFile,
} from './portfolio-storage-core.js'
import { SITE_MEDIA_KEYS } from './site-content-keys.js'

export const SITE_MEDIA_ITEMS = Object.freeze([
  Object.freeze({
    key: SITE_MEDIA_KEYS.avatarVideo,
    label: 'Home introduction video',
    purpose: PORTFOLIO_ASSET_PURPOSES.avatarVideo,
    accept: 'video/mp4',
    help: 'MP4 video, up to 50 MiB.',
    fallback: 'The Home page keeps using its bundled introduction video when this item is missing or unpublished.',
  }),
  Object.freeze({
    key: SITE_MEDIA_KEYS.avatarVideoPoster,
    label: 'Home Video Poster',
    purpose: PORTFOLIO_ASSET_PURPOSES.avatarVideoPoster,
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    help: 'JPEG, PNG, or WebP image, up to 50 MiB.',
    fallback: 'The Home introduction video keeps its bundled poster when this item is missing or unpublished.',
  }),
  Object.freeze({
    key: SITE_MEDIA_KEYS.cvPdf,
    label: 'CV PDF',
    purpose: PORTFOLIO_ASSET_PURPOSES.cvPdf,
    accept: 'application/pdf,.pdf',
    help: 'PDF document, up to 50 MiB.',
    fallback: 'The CV page keeps using its bundled PDF when this item is missing or unpublished.',
  }),
  Object.freeze({
    key: SITE_MEDIA_KEYS.cvPreviewImage,
    label: 'CV preview image',
    purpose: PORTFOLIO_ASSET_PURPOSES.cvPreview,
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    help: 'JPEG, PNG, or WebP image, up to 50 MiB.',
    fallback: 'The CV page keeps using its bundled preview when this item is missing or unpublished.',
  }),
  Object.freeze({
    key: SITE_MEDIA_KEYS.businessCardImage,
    label: 'Business Card image',
    purpose: PORTFOLIO_ASSET_PURPOSES.businessCardImage,
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    help: 'JPEG, PNG, or WebP image, up to 50 MiB.',
    fallback: 'Kept as a design reference. The public Business Card page uses its built-in HTML design and does not display this image.',
  }),
])

const MEDIA_BY_KEY = new Map(SITE_MEDIA_ITEMS.map((item) => [item.key, item]))

export class AdminSiteMediaError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'AdminSiteMediaError'
    this.code = code
    this.path = options.path ?? null
    this.cleanup = options.cleanup ?? null
  }
}

export function validateSiteMediaFile(key, file) {
  const item = MEDIA_BY_KEY.get(key)
  if (!item) {
    throw new AdminSiteMediaError('invalid-key', 'Choose a supported media item.')
  }

  try {
    return validatePortfolioFile(file, item.purpose)
  } catch (error) {
    throw new AdminSiteMediaError(
      error?.code ?? 'invalid-file',
      error?.message ?? `${item.label} file is invalid.`,
      { cause: error },
    )
  }
}

function normalizeRecords(records) {
  if (!Array.isArray(records)) {
    throw new AdminSiteMediaError('invalid-response', 'The site media response was invalid.')
  }

  const normalized = {}
  for (const record of records) {
    if (!MEDIA_BY_KEY.has(record?.key)) continue
    if (typeof record.value !== 'string' || typeof record.is_public !== 'boolean') {
      const item = MEDIA_BY_KEY.get(record.key)
      throw new AdminSiteMediaError(
        'invalid-record',
        `The saved ${item.label.toLowerCase()} record has an invalid format.`,
      )
    }
    normalized[record.key] = Object.freeze({
      key: record.key,
      value: record.value,
      is_public: record.is_public,
      updated_at: record.updated_at ?? null,
    })
  }

  return normalized
}

export function createAdminSiteMediaOperations({ repository, storage, ensureAdmin } = {}) {
  if (
    !repository
    || typeof repository.list !== 'function'
    || typeof repository.get !== 'function'
    || typeof repository.insert !== 'function'
    || typeof repository.update !== 'function'
    || typeof repository.delete !== 'function'
    || typeof repository.isAssetReferenced !== 'function'
    || !storage
    || typeof storage.upload !== 'function'
    || typeof storage.remove !== 'function'
    || typeof ensureAdmin !== 'function'
  ) {
    throw new TypeError('Site media operations require a repository, Storage service, and administrator check.')
  }

  async function cleanupPath(path) {
    try {
      await storage.remove({
        path,
        isAssetReferenced: () => repository.isAssetReferenced(path),
      })
      return Object.freeze({ status: 'deleted', path })
    } catch (error) {
      if (error?.code === 'asset-in-use') {
        return Object.freeze({ status: 'shared', path, message: error.message })
      }
      return Object.freeze({
        status: 'failed',
        path,
        message: error?.message || 'Storage cleanup could not be confirmed.',
      })
    }
  }

  async function save({ key, file = null, is_public } = {}) {
    const item = MEDIA_BY_KEY.get(key)
    if (!item) throw new AdminSiteMediaError('invalid-key', 'Choose a supported media item.')
    if (file) validateSiteMediaFile(key, file)
    if (typeof is_public !== 'boolean') {
      throw new AdminSiteMediaError('invalid-publication-state', 'Choose Draft or Published visibility.')
    }

    await ensureAdmin()
    const current = await repository.get(key)
    let uploaded = null

    if (file) {
      try {
        uploaded = await storage.upload({ purpose: item.purpose, file })
      } catch (error) {
        throw new AdminSiteMediaError(
          'upload-failed',
          error?.message || `${item.label} could not be uploaded. No database reference was changed.`,
          { cause: error, path: error?.path ?? null },
        )
      }
      if (typeof uploaded?.path !== 'string' || !isSafePortfolioAssetPath(uploaded.path)) {
        throw new AdminSiteMediaError(
          'upload-unconfirmed',
          'Storage did not confirm a valid uploaded file path. Check Storage before retrying.',
          { path: uploaded?.path ?? null },
        )
      }
    } else if (!current || !current.value) {
      throw new AdminSiteMediaError(
        'media-required',
        `Choose a file for ${item.label} before saving its publication status.`,
      )
    }

    const next = Object.freeze({
      key,
      value: uploaded?.path ?? current.value,
      is_public,
    })

    try {
      const saved = current
        ? await repository.update(current, next)
        : await repository.insert(next)
      if (!saved || saved.key !== key || saved.value !== next.value || saved.is_public !== next.is_public) {
        throw new AdminSiteMediaError(
          'save-unconfirmed',
          'The database did not confirm the media reference update.',
        )
      }

      const previousCleanup = uploaded && current?.value && current.value !== saved.value
        ? await cleanupPath(current.value)
        : null
      return Object.freeze({
        record: normalizeRecords([saved])[key],
        previousCleanup,
      })
    } catch (error) {
      if (!uploaded) throw error
      const uploadedCleanup = await cleanupPath(uploaded.path)
      throw new AdminSiteMediaError(
        'database-save-failed',
        `The database reference for ${item.label} could not be confirmed. The existing media reference was not intentionally replaced.`,
        { cause: error, path: uploaded.path, cleanup: uploadedCleanup },
      )
    }
  }

  async function remove(key) {
    const item = MEDIA_BY_KEY.get(key)
    if (!item) throw new AdminSiteMediaError('invalid-key', 'Choose a supported media item.')

    await ensureAdmin()
    const current = await repository.get(key)
    if (!current) return Object.freeze({ removed: false, cleanup: null })

    const deleted = await repository.delete(current)
    if (!deleted) {
      throw new AdminSiteMediaError(
        'remove-unconfirmed',
        `The database did not confirm removal of ${item.label}. The Storage file was kept.`,
      )
    }

    const cleanup = current.value ? await cleanupPath(current.value) : null
    return Object.freeze({ removed: true, cleanup })
  }

  async function cleanupUnreferenced(path) {
    await ensureAdmin()
    return cleanupPath(path)
  }

  return Object.freeze({
    async list() {
      await ensureAdmin()
      return normalizeRecords(await repository.list(SITE_MEDIA_ITEMS.map(({ key }) => key)))
    },
    save,
    remove,
    cleanupUnreferenced,
  })
}
