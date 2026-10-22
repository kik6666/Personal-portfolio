import {
  PORTFOLIO_ASSET_PURPOSES,
  validatePortfolioFile,
} from './portfolio-storage-core.js'
import {
  validateCertificateFiles,
  validateCertificateForm,
} from './admin-certificates-validation.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class AdminCertificatesError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'AdminCertificatesError'
    this.code = code
    this.cleanup = options.cleanup ?? null
    this.recoveryPaths = options.recoveryPaths ?? []
    this.databaseOutcomeUnknown = options.databaseOutcomeUnknown ?? false
  }
}

function requireCertificateId(id) {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw new AdminCertificatesError('invalid-certificate-id', 'The selected certificate ID is invalid.')
  }
}

function cleanupRecoveryPaths(cleanup) {
  return [...new Set(cleanup.failed.map((entry) => entry.path))]
}

export function createAdminCertificatesOperations({
  repository,
  storage,
  ensureAdmin,
  createId = () => globalThis.crypto?.randomUUID?.(),
} = {}) {
  if (
    !repository
    || typeof repository.list !== 'function'
    || typeof repository.getById !== 'function'
    || typeof repository.insert !== 'function'
    || typeof repository.update !== 'function'
    || typeof repository.delete !== 'function'
    || typeof repository.isAssetReferenced !== 'function'
    || !storage
    || typeof storage.upload !== 'function'
    || typeof storage.remove !== 'function'
    || typeof ensureAdmin !== 'function'
  ) {
    throw new TypeError('Certificate operations require an authorized repository and Storage service.')
  }

  async function removeUnreferencedPaths(paths) {
    const cleanup = { deleted: [], shared: [], failed: [] }
    for (const path of [...new Set(paths.filter((value) => typeof value === 'string' && value))]) {
      try {
        await storage.remove({
          path,
          isAssetReferenced: () => repository.isAssetReferenced(path),
        })
        cleanup.deleted.push(path)
      } catch (error) {
        if (error?.code === 'asset-in-use') {
          cleanup.shared.push(path)
        } else {
          cleanup.failed.push({
            path,
            message: error?.message || 'File cleanup failed.',
          })
        }
      }
    }
    return cleanup
  }

  async function uploadCertificateFile(purpose, recordId, file) {
    if (!file) return null
    validatePortfolioFile(
      file,
      purpose === PORTFOLIO_ASSET_PURPOSES.certificatePdf
        ? PORTFOLIO_ASSET_PURPOSES.certificatePdf
        : PORTFOLIO_ASSET_PURPOSES.certificatePreview,
    )
    return storage.upload({ purpose, recordId, file })
  }

  async function save({
    id = null,
    values,
    pdfFile = null,
    previewFile = null,
    publish = false,
  } = {}) {
    await ensureAdmin()

    let current = null
    if (id !== null) {
      requireCertificateId(id)
      current = await repository.getById(id)
      if (!current) {
        throw new AdminCertificatesError('certificate-not-found', 'This certificate no longer exists. Refresh the list and try again.')
      }
    }

    validateCertificateFiles(pdfFile, previewFile)
    const recordId = current?.id ?? createId()
    requireCertificateId(recordId)
    const fields = validateCertificateForm(values, {
      pdfPath: pdfFile ? null : current?.pdf_path,
      previewImagePath: previewFile ? null : current?.preview_image_path,
      hasPdfUpload: Boolean(pdfFile),
      publish,
    })

    const uploaded = []
    try {
      const pdf = await uploadCertificateFile(
        PORTFOLIO_ASSET_PURPOSES.certificatePdf,
        recordId,
        pdfFile,
      )
      if (pdf) uploaded.push(pdf)

      const preview = await uploadCertificateFile(
        PORTFOLIO_ASSET_PURPOSES.certificatePreview,
        recordId,
        previewFile,
      )
      if (preview) uploaded.push(preview)
    } catch (error) {
      const cleanup = await removeUnreferencedPaths([
        ...uploaded.map((asset) => asset.path),
        error?.path,
      ])
      throw new AdminCertificatesError(
        'asset-upload-failed',
        `Certificate files could not all be uploaded. ${error?.message || 'Try again.'}`,
        {
          cause: error,
          cleanup,
          recoveryPaths: cleanupRecoveryPaths(cleanup),
        },
      )
    }

    const pdfUpload = uploaded.find((asset) => asset.contentType === 'application/pdf')
    const previewUpload = uploaded.find((asset) => asset.contentType !== 'application/pdf')
    const record = {
      ...fields,
      pdf_path: pdfUpload?.path ?? fields.pdf_path,
      preview_image_path: previewUpload?.path ?? fields.preview_image_path,
      is_published: Boolean(publish),
    }

    let saved
    try {
      saved = current
        ? await repository.update(recordId, record)
        : await repository.insert({ id: recordId, ...record })
    } catch (error) {
      const cleanup = await removeUnreferencedPaths([
        ...uploaded.map((asset) => asset.path),
        current?.pdf_path,
        current?.preview_image_path,
      ])
      throw new AdminCertificatesError(
        'certificate-save-failed',
        'The certificate save could not be confirmed. Refresh the list before retrying.',
        {
          cause: error,
          cleanup,
          recoveryPaths: cleanupRecoveryPaths(cleanup),
          databaseOutcomeUnknown: true,
        },
      )
    }

    const oldPaths = current
      ? [current.pdf_path, current.preview_image_path].filter((path) => (
        path
        && path !== record.pdf_path
        && path !== record.preview_image_path
      ))
      : []
    const cleanup = await removeUnreferencedPaths(oldPaths)
    return Object.freeze({ certificate: saved, cleanup })
  }

  return Object.freeze({
    async list() {
      await ensureAdmin()
      return repository.list()
    },

    save,

    async setPublished(id, publish) {
      await ensureAdmin()
      requireCertificateId(id)
      if (typeof publish !== 'boolean') {
        throw new AdminCertificatesError('invalid-publication-state', 'Choose whether the certificate should be published.')
      }

      const current = await repository.getById(id)
      if (!current) {
        throw new AdminCertificatesError('certificate-not-found', 'This certificate no longer exists. Refresh the list and try again.')
      }

      if (publish) {
        validateCertificateForm({
          title: current.title,
          issuer: current.issuer ?? '',
          issueDate: current.issue_date ?? '',
          credentialUrl: current.credential_url ?? '',
          sortOrder: current.sort_order,
        }, {
          pdfPath: current.pdf_path,
          previewImagePath: current.preview_image_path,
          publish: true,
        })
      }

      try {
        return await repository.update(id, { is_published: publish })
      } catch (error) {
        throw new AdminCertificatesError(
          'publication-update-failed',
          'The publication change could not be confirmed. Refresh the certificate list before retrying.',
          { cause: error, databaseOutcomeUnknown: true },
        )
      }
    },

    async delete(id) {
      await ensureAdmin()
      requireCertificateId(id)
      const current = await repository.getById(id)
      if (!current) {
        throw new AdminCertificatesError('certificate-not-found', 'This certificate no longer exists. Refresh the list and try again.')
      }

      try {
        await repository.delete(id)
      } catch (error) {
        const cleanup = await removeUnreferencedPaths([
          current.pdf_path,
          current.preview_image_path,
        ])
        throw new AdminCertificatesError(
          'certificate-delete-failed',
          'The certificate deletion could not be confirmed. Refresh the list before retrying.',
          {
            cause: error,
            cleanup,
            recoveryPaths: cleanupRecoveryPaths(cleanup),
            databaseOutcomeUnknown: true,
          },
        )
      }

      const cleanup = await removeUnreferencedPaths([
        current.pdf_path,
        current.preview_image_path,
      ])
      return Object.freeze({ certificate: current, cleanup })
    },

    async retryCleanup(paths) {
      await ensureAdmin()
      if (!Array.isArray(paths)) {
        throw new AdminCertificatesError('invalid-cleanup-paths', 'The pending cleanup list is invalid.')
      }
      return removeUnreferencedPaths(paths)
    },
  })
}
