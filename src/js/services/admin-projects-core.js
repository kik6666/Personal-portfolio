import {
  PORTFOLIO_ASSET_PURPOSES,
  validatePortfolioFile,
} from './portfolio-storage-core.js'
import {
  validateProjectForm,
  validateProjectPreviewFile,
} from './admin-projects-validation.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class AdminProjectsError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'AdminProjectsError'
    this.code = code
    this.cleanup = options.cleanup ?? null
    this.recoveryPaths = options.recoveryPaths ?? []
    this.databaseOutcomeUnknown = options.databaseOutcomeUnknown ?? false
  }
}

function requireProjectId(id) {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw new AdminProjectsError('invalid-project-id', 'The selected project ID is invalid.')
  }
}

function cleanupRecoveryPaths(cleanup) {
  return [...new Set(cleanup.failed.map((entry) => entry.path))]
}

function isDuplicateSlug(error) {
  return error?.code === 'duplicate-slug'
    || (
      error?.code === '23505'
      && (error?.constraint === 'projects_slug_key' || /slug/i.test(error?.message ?? ''))
    )
}

export function createAdminProjectsOperations({
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
    throw new TypeError('Project operations require an authorized repository and Storage service.')
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
          cleanup.failed.push({ path, message: error?.message || 'File cleanup failed.' })
        }
      }
    }
    return cleanup
  }

  async function save({
    id = null,
    values,
    previewFile = null,
    publish = false,
  } = {}) {
    await ensureAdmin()

    let current = null
    if (id !== null) {
      requireProjectId(id)
      current = await repository.getById(id)
      if (!current) {
        throw new AdminProjectsError(
          'project-not-found',
          'This project no longer exists. Refresh the list and try again.',
        )
      }
    }

    validateProjectPreviewFile(previewFile)
    const projectId = current?.id ?? createId()
    requireProjectId(projectId)
    const fields = validateProjectForm(values, {
      previewImagePath: previewFile ? null : current?.preview_image_path,
    })

    const uploaded = []
    try {
      if (previewFile) {
        validatePortfolioFile(previewFile, PORTFOLIO_ASSET_PURPOSES.projectPreview)
        uploaded.push(await storage.upload({
          purpose: PORTFOLIO_ASSET_PURPOSES.projectPreview,
          recordId: projectId,
          file: previewFile,
        }))
      }
    } catch (error) {
      const cleanup = await removeUnreferencedPaths([
        ...uploaded.map((asset) => asset.path),
        error?.path,
      ])
      throw new AdminProjectsError(
        'project-upload-failed',
        `The project preview could not be uploaded. ${error?.message || 'Try again.'}`,
        { cause: error, cleanup, recoveryPaths: cleanupRecoveryPaths(cleanup) },
      )
    }

    const previewUpload = uploaded[0]
    const record = {
      ...fields,
      preview_image_path: previewUpload?.path ?? fields.preview_image_path,
      is_published: Boolean(publish),
    }

    let saved
    try {
      saved = current
        ? await repository.update(projectId, record)
        : await repository.insert({ id: projectId, ...record })
    } catch (error) {
      const cleanup = await removeUnreferencedPaths(uploaded.map((asset) => asset.path))
      if (isDuplicateSlug(error)) {
        throw new AdminProjectsError(
          'duplicate-slug',
          'That slug is already in use. Choose a different slug.',
          { cause: error, cleanup, recoveryPaths: cleanupRecoveryPaths(cleanup) },
        )
      }
      throw new AdminProjectsError(
        'project-save-failed',
        'The project save could not be confirmed. Refresh the list before retrying.',
        {
          cause: error,
          cleanup,
          recoveryPaths: cleanupRecoveryPaths(cleanup),
          databaseOutcomeUnknown: true,
        },
      )
    }

    const oldPaths = current?.preview_image_path
      && current.preview_image_path !== record.preview_image_path
      ? [current.preview_image_path]
      : []
    const cleanup = await removeUnreferencedPaths(oldPaths)
    return Object.freeze({ project: saved, cleanup })
  }

  return Object.freeze({
    async list() {
      await ensureAdmin()
      return repository.list()
    },

    save,

    async setPublished(id, publish) {
      await ensureAdmin()
      requireProjectId(id)
      if (typeof publish !== 'boolean') {
        throw new AdminProjectsError(
          'invalid-publication-state',
          'Choose whether the project should be published.',
        )
      }

      const current = await repository.getById(id)
      if (!current) {
        throw new AdminProjectsError(
          'project-not-found',
          'This project no longer exists. Refresh the list and try again.',
        )
      }

      if (publish) {
        validateProjectForm({
          title: current.title,
          slug: current.slug,
          description: current.description,
          technologies: current.technologies,
          liveUrl: current.live_url ?? '',
          repositoryUrl: current.repository_url ?? '',
          completedAt: current.completed_at ?? '',
          sortOrder: current.sort_order,
        }, { previewImagePath: current.preview_image_path })
      }

      try {
        return await repository.update(id, { is_published: publish })
      } catch (error) {
        throw new AdminProjectsError(
          'publication-update-failed',
          'The publication change could not be confirmed. Refresh the project list before retrying.',
          { cause: error, databaseOutcomeUnknown: true },
        )
      }
    },

    async delete(id) {
      await ensureAdmin()
      requireProjectId(id)
      const current = await repository.getById(id)
      if (!current) {
        throw new AdminProjectsError(
          'project-not-found',
          'This project no longer exists. Refresh the list and try again.',
        )
      }

      try {
        await repository.delete(id)
      } catch (error) {
        const cleanup = await removeUnreferencedPaths([current.preview_image_path])
        throw new AdminProjectsError(
          'project-delete-failed',
          'The project deletion could not be confirmed. Refresh the list before retrying.',
          {
            cause: error,
            cleanup,
            recoveryPaths: cleanupRecoveryPaths(cleanup),
            databaseOutcomeUnknown: true,
          },
        )
      }

      const cleanup = await removeUnreferencedPaths([current.preview_image_path])
      return Object.freeze({ project: current, cleanup })
    },

    async retryCleanup(paths) {
      await ensureAdmin()
      if (!Array.isArray(paths)) {
        throw new AdminProjectsError('invalid-cleanup-paths', 'The pending cleanup list is invalid.')
      }
      return removeUnreferencedPaths(paths)
    },
  })
}
