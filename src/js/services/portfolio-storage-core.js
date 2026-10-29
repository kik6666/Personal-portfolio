export const PORTFOLIO_ASSET_MAX_BYTES = 50 * 1024 * 1024

const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
})

const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID_REGEX = new RegExp(`^${UUID_PATTERN}$`, 'i')

export const PORTFOLIO_ASSET_PURPOSES = Object.freeze({
  certificatePdf: 'certificate-pdf',
  certificatePreview: 'certificate-preview',
  projectPreview: 'project-preview',
  projectVideo: 'project-video',
  cvPdf: 'cv-pdf',
  cvPreview: 'cv-preview',
  businessCardImage: 'business-card-image',
  avatarVideo: 'avatar-video',
  avatarVideoPoster: 'avatar-video-poster',
})

const PURPOSE_SPECS = Object.freeze({
  [PORTFOLIO_ASSET_PURPOSES.certificatePdf]: {
    prefix: 'certificates',
    recordIdRequired: true,
    slot: 'pdf',
    mimeTypes: ['application/pdf'],
  },
  [PORTFOLIO_ASSET_PURPOSES.certificatePreview]: {
    prefix: 'certificates',
    recordIdRequired: true,
    slot: 'preview',
    mimeTypes: IMAGE_MIME_TYPES,
  },
  [PORTFOLIO_ASSET_PURPOSES.projectPreview]: {
    prefix: 'projects',
    recordIdRequired: true,
    slot: 'preview',
    mimeTypes: IMAGE_MIME_TYPES,
  },
  [PORTFOLIO_ASSET_PURPOSES.projectVideo]: {
    prefix: 'projects',
    recordIdRequired: true,
    slot: 'video',
    mimeTypes: ['video/mp4'],
  },
  [PORTFOLIO_ASSET_PURPOSES.cvPdf]: {
    prefix: 'site-content/cv',
    recordIdRequired: false,
    slot: 'pdf',
    mimeTypes: ['application/pdf'],
  },
  [PORTFOLIO_ASSET_PURPOSES.cvPreview]: {
    prefix: 'site-content/cv',
    recordIdRequired: false,
    slot: 'preview',
    mimeTypes: IMAGE_MIME_TYPES,
  },
  [PORTFOLIO_ASSET_PURPOSES.businessCardImage]: {
    prefix: 'site-content/business-card',
    recordIdRequired: false,
    slot: 'image',
    mimeTypes: IMAGE_MIME_TYPES,
  },
  [PORTFOLIO_ASSET_PURPOSES.avatarVideo]: {
    prefix: 'site-content/avatar',
    recordIdRequired: false,
    slot: 'video',
    mimeTypes: ['video/mp4'],
  },
  [PORTFOLIO_ASSET_PURPOSES.avatarVideoPoster]: {
    prefix: 'site-content/avatar',
    recordIdRequired: false,
    slot: 'poster',
    mimeTypes: IMAGE_MIME_TYPES,
  },
})

export class PortfolioStorageError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'PortfolioStorageError'
    this.code = code
    this.path = options.path ?? null
  }
}

function getPurposeSpec(purpose) {
  const spec = PURPOSE_SPECS[purpose]
  if (!spec) {
    throw new PortfolioStorageError('invalid-purpose', 'Choose a supported portfolio asset type.')
  }

  return spec
}

function validateUuid(value, code, label) {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new PortfolioStorageError(code, `The ${label} must be a valid UUID.`)
  }
}

export function validatePortfolioFile(file, purpose) {
  const spec = getPurposeSpec(purpose)
  if (
    !file
    || typeof file !== 'object'
    || typeof file.type !== 'string'
    || !Number.isSafeInteger(file.size)
    || file.size < 0
  ) {
    throw new PortfolioStorageError('invalid-file', 'Choose a valid file to upload.')
  }

  if (file.size === 0) {
    throw new PortfolioStorageError('empty-file', 'Empty files cannot be uploaded.')
  }

  if (!Object.hasOwn(MIME_EXTENSIONS, file.type)) {
    throw new PortfolioStorageError('unsupported-file-type', 'Use a JPEG, PNG, WebP, PDF, or MP4 file.')
  }

  if (!spec.mimeTypes.includes(file.type)) {
    throw new PortfolioStorageError('unsupported-purpose-type', 'This file type is not supported for the selected asset.')
  }

  if (file.size > PORTFOLIO_ASSET_MAX_BYTES) {
    throw new PortfolioStorageError('file-too-large', 'Files must be no larger than 50 MiB.')
  }

  return Object.freeze({
    contentType: file.type,
    extension: MIME_EXTENSIONS[file.type],
    size: file.size,
  })
}

export function createPortfolioAssetPath({ purpose, recordId, file, versionId }) {
  const spec = getPurposeSpec(purpose)
  const validatedFile = validatePortfolioFile(file, purpose)
  const version = versionId ?? globalThis.crypto?.randomUUID?.()

  validateUuid(version, 'invalid-version-id', 'version ID')

  if (spec.recordIdRequired) {
    validateUuid(recordId, 'invalid-record-id', 'record ID')
  } else if (recordId !== undefined) {
    throw new PortfolioStorageError('unexpected-record-id', 'This asset type does not use a record ID.')
  }

  const recordSegment = spec.recordIdRequired ? `/${recordId.toLowerCase()}` : ''
  const path = `${spec.prefix}${recordSegment}/${spec.slot}/${version.toLowerCase()}${validatedFile.extension}`
  if (!isSafePortfolioAssetPath(path)) {
    throw new PortfolioStorageError('unsafe-path', 'A safe Storage path could not be generated.', { path })
  }

  return path
}

export function isSafePortfolioAssetPath(path) {
  if (
    typeof path !== 'string'
    || !path
    || path.trim() !== path
    || path.startsWith('/')
    || path.includes('\\')
    || /[?#\u0000-\u001f]/.test(path)
  ) {
    return false
  }

  return Object.values(PURPOSE_SPECS).some((spec) => {
    const extensions = spec.mimeTypes
      .map((mimeType) => MIME_EXTENSIONS[mimeType].slice(1))
      .join('|')
    const recordSegment = spec.recordIdRequired ? `/${UUID_PATTERN}` : ''
    const pattern = new RegExp(
      `^${spec.prefix}${recordSegment}/${spec.slot}/${UUID_PATTERN}\\.(?:${extensions})$`,
      'i',
    )
    return pattern.test(path)
  })
}

export function createPortfolioStorageOperations({ getBucket, ensureAdmin, createVersionId } = {}) {
  if (typeof getBucket !== 'function' || typeof ensureAdmin !== 'function') {
    throw new TypeError('Storage operations require a bucket provider and administrator check.')
  }

  const makeVersionId = createVersionId ?? (() => globalThis.crypto?.randomUUID?.())

  return Object.freeze({
    async upload({ purpose, recordId, file } = {}) {
      const validatedFile = validatePortfolioFile(file, purpose)
      const versionId = makeVersionId()
      const path = createPortfolioAssetPath({ purpose, recordId, file, versionId })
      await ensureAdmin()

      let response
      try {
        response = await getBucket().upload(path, file, {
          cacheControl: '3600',
          contentType: validatedFile.contentType,
          upsert: false,
        })
      } catch (error) {
        throw new PortfolioStorageError(
          'upload-outcome-unknown',
          'The upload result could not be confirmed. Check Storage before retrying.',
          { cause: error, path },
        )
      }

      if (response?.error) {
        throw new PortfolioStorageError(
          'upload-failed',
          'The file could not be uploaded. No database record was changed.',
          { cause: response.error, path },
        )
      }

      if (response?.data?.path !== path) {
        throw new PortfolioStorageError(
          'upload-unconfirmed',
          'Storage did not confirm the generated file path.',
          { path },
        )
      }

      return Object.freeze({
        bucket: 'portfolio-assets',
        path,
        contentType: validatedFile.contentType,
        size: validatedFile.size,
      })
    },

    async remove({ path, isAssetReferenced } = {}) {
      if (!isSafePortfolioAssetPath(path)) {
        throw new PortfolioStorageError('unsafe-path', 'The Storage path is invalid.', { path })
      }
      if (typeof isAssetReferenced !== 'function') {
        throw new PortfolioStorageError(
          'reference-check-required',
          'A database reference check is required before deleting a file.',
          { path },
        )
      }

      await ensureAdmin()

      let isReferenced
      try {
        isReferenced = await isAssetReferenced(path)
      } catch (error) {
        throw new PortfolioStorageError(
          'reference-check-failed',
          'The file could not be deleted because its database references could not be checked.',
          { cause: error, path },
        )
      }

      if (typeof isReferenced !== 'boolean') {
        throw new PortfolioStorageError(
          'reference-check-failed',
          'The database reference check returned an invalid result; the file was not deleted.',
          { path },
        )
      }
      if (isReferenced) {
        throw new PortfolioStorageError(
          'asset-in-use',
          'The file is still referenced by a database record and was not deleted.',
          { path },
        )
      }

      let response
      try {
        response = await getBucket().remove([path])
      } catch (error) {
        throw new PortfolioStorageError(
          'delete-failed',
          'The file could not be deleted from Storage.',
          { cause: error, path },
        )
      }

      if (response?.error) {
        throw new PortfolioStorageError(
          'delete-failed',
          'The file could not be deleted from Storage.',
          { cause: response.error, path },
        )
      }

      if (!Array.isArray(response?.data) || !response.data.some((file) => file?.name === path)) {
        throw new PortfolioStorageError(
          'delete-unconfirmed',
          'Storage did not confirm that the file was deleted.',
          { path },
        )
      }

      return Object.freeze({ bucket: 'portfolio-assets', path })
    },
  })
}
