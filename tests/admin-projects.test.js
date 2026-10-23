import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AdminProjectsError,
  createAdminProjectsOperations,
} from '../src/js/services/admin-projects-core.js'
import {
  ProjectValidationError,
  suggestProjectSlug,
  validateProjectForm,
  validateProjectPreviewFile,
} from '../src/js/services/admin-projects-validation.js'
import { PORTFOLIO_ASSET_PURPOSES } from '../src/js/services/portfolio-storage-core.js'

const projectId = '8c84b1f1-3ddf-4f29-a8db-6bbab6e451a1'
const secondProjectId = 'e001fe55-70d2-4e65-80bd-7c36e2e2562a'
const versionId = '13a7edc8-9133-4ec1-b3a9-80b495e44648'
const oldVersionId = 'b92bfe14-cc2e-4d54-8a6d-c87e6cfe2143'
const oldPreviewPath = `projects/${projectId}/preview/${oldVersionId}.webp`
const previewFile = { name: 'preview.webp', type: 'image/webp', size: 2048 }
const validValues = {
  title: 'Interactive Portfolio',
  slug: 'interactive-portfolio',
  description: 'An accessible portfolio application.',
  technologies: 'HTML, CSS, JavaScript, HTML',
  completedAt: '2026-09-18',
  liveUrl: 'https://example.test/demo',
  repositoryUrl: 'https://github.com/example/portfolio',
  sortOrder: '2',
}

function makeProject(fields = {}) {
  return {
    id: projectId,
    title: 'Existing Project',
    slug: 'existing-project',
    description: 'A saved project.',
    technologies: ['JavaScript'],
    preview_image_path: oldPreviewPath,
    live_url: null,
    repository_url: null,
    completed_at: '2025-10-01',
    sort_order: 0,
    is_published: false,
    ...fields,
  }
}

function createFixture({
  records = [],
  unauthorized = false,
  fail = {},
  sharedPaths = [],
} = {}) {
  const events = []
  const storedRecords = new Map(records.map((record) => [record.id, { ...record }]))
  const removedPaths = []
  const uploadedPaths = []

  const repository = {
    async list() {
      events.push('list')
      if (fail.list) throw new Error('database list failed')
      return [...storedRecords.values()].map((record) => ({ ...record }))
    },
    async getById(id) {
      events.push('get')
      return storedRecords.has(id) ? { ...storedRecords.get(id) } : null
    },
    async insert(record) {
      events.push('insert')
      if (fail.duplicateSlug) {
        const error = new Error('duplicate slug')
        error.code = '23505'
        error.constraint = 'projects_slug_key'
        throw error
      }
      if (fail.insert) throw new Error('database insert failed')
      storedRecords.set(record.id, { ...record })
      return { ...record }
    },
    async update(id, fields) {
      events.push('update')
      if (fail.duplicateSlug && fields.slug) {
        const error = new Error('duplicate slug')
        error.code = '23505'
        error.constraint = 'projects_slug_key'
        throw error
      }
      if (fail.update) throw new Error('database update failed')
      if (!storedRecords.has(id)) throw new Error('missing record')
      const updated = { ...storedRecords.get(id), ...fields }
      storedRecords.set(id, updated)
      return { ...updated }
    },
    async delete(id) {
      events.push('delete')
      if (fail.delete) throw new Error('database delete failed')
      storedRecords.delete(id)
    },
    async isAssetReferenced(path) {
      events.push(`reference:${path}`)
      if (fail.reference) throw new Error('reference query failed')
      return sharedPaths.includes(path)
        || [...storedRecords.values()].some((record) => record.preview_image_path === path)
    },
  }

  const storage = {
    async upload({ purpose, recordId, file }) {
      events.push(`upload:${purpose}`)
      const path = `projects/${recordId}/preview/${versionId}.${file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]}`
      if (fail.upload) {
        const error = new Error('mock upload failed')
        error.path = path
        throw error
      }
      uploadedPaths.push(path)
      return { bucket: 'portfolio-assets', path, contentType: file.type, size: file.size }
    },
    async remove({ path, isAssetReferenced }) {
      events.push(`remove-check:${path}`)
      if (await isAssetReferenced(path)) {
        const error = new Error('file is referenced')
        error.code = 'asset-in-use'
        throw error
      }
      if (fail.cleanup) throw new Error('mock cleanup failed')
      removedPaths.push(path)
      events.push(`remove:${path}`)
      return { path }
    },
  }

  const operations = createAdminProjectsOperations({
    repository,
    storage,
    ensureAdmin: async () => {
      events.push('admin')
      if (unauthorized) throw new Error('administrator required')
    },
    createId: () => projectId,
  })
  return { operations, events, removedPaths, uploadedPaths, storedRecords }
}

test('suggests URL-friendly slugs and normalizes accented titles', () => {
  assert.equal(suggestProjectSlug('  Kristína’s AI Portfolio!  '), 'kristina-s-ai-portfolio')
  assert.equal(suggestProjectSlug('Python & Web Development 2026'), 'python-web-development-2026')
  assert.equal(suggestProjectSlug('---'), '')
})

test('validates required fields, slug, URLs, completion date, order and technologies', () => {
  const result = validateProjectForm(validValues)
  assert.deepEqual(result.technologies, ['HTML', 'CSS', 'JavaScript'])
  assert.equal(result.slug, 'interactive-portfolio')
  assert.equal(result.live_url, 'https://example.test/demo')

  for (const [values, code, field] of [
    [{ ...validValues, title: ' ' }, 'title-required', 'title'],
    [{ ...validValues, slug: 'Not-a-slug' }, 'invalid-slug', 'slug'],
    [{ ...validValues, description: ' ' }, 'description-required', 'description'],
    [{ ...validValues, liveUrl: 'javascript:alert(1)' }, 'invalid-live-url', 'liveUrl'],
    [{ ...validValues, repositoryUrl: 'ftp://example.test' }, 'invalid-repository-url', 'repositoryUrl'],
    [{ ...validValues, completedAt: '2026-02-30' }, 'invalid-completed-date', 'completedAt'],
    [{ ...validValues, sortOrder: '-1' }, 'invalid-sort-order', 'sortOrder'],
  ]) {
    assert.throws(
      () => validateProjectForm(values),
      (error) => error instanceof ProjectValidationError && error.code === code && error.field === field,
    )
  }
})

test('accepts an optional completion date, URLs, technologies and preview path', () => {
  const result = validateProjectForm({
    title: 'Minimal Project',
    slug: 'minimal-project',
    description: 'A project without optional metadata.',
    technologies: '',
    completedAt: '',
    liveUrl: '',
    repositoryUrl: '',
    sortOrder: '',
  }, { previewImagePath: oldPreviewPath })

  assert.equal(result.completed_at, null)
  assert.deepEqual(result.technologies, [])
  assert.equal(result.preview_image_path, oldPreviewPath)
  assert.equal(result.sort_order, 0)
  assert.throws(
    () => validateProjectForm(validValues, {
      previewImagePath: 'certificates/bad/path.webp',
    }),
    { code: 'invalid-preview-path', field: 'previewFile' },
  )
})

test('validates optional project preview MIME type and file size', () => {
  assert.doesNotThrow(() => validateProjectPreviewFile(previewFile))
  assert.throws(
    () => validateProjectPreviewFile({ ...previewFile, type: 'application/pdf' }),
    /not supported for the selected asset/,
  )
  assert.throws(
    () => validateProjectPreviewFile({ ...previewFile, size: 50 * 1024 * 1024 + 1 }),
    /no larger than 50 MiB/,
  )
  assert.equal(PORTFOLIO_ASSET_PURPOSES.projectPreview, 'project-preview')
})

test('checks administrator access before listing and rejects unauthorized mutations', async () => {
  const fixture = createFixture({ records: [makeProject()], unauthorized: true })
  await assert.rejects(fixture.operations.list(), /administrator required/)
  await assert.rejects(fixture.operations.save({ values: validValues }), /administrator required/)
  await assert.rejects(fixture.operations.setPublished(projectId, true), /administrator required/)
  await assert.rejects(fixture.operations.delete(projectId), /administrator required/)
  assert.deepEqual(fixture.events, ['admin', 'admin', 'admin', 'admin'])
  assert.equal(fixture.storedRecords.has(projectId), true)
})

test('lists drafts and published projects after administrator verification', async () => {
  const fixture = createFixture({
    records: [makeProject(), makeProject({ id: secondProjectId, is_published: true })],
  })
  const projects = await fixture.operations.list()
  assert.equal(projects.length, 2)
  assert.equal(projects.some((project) => project.is_published), true)
  assert.equal(projects.some((project) => !project.is_published), true)
  assert.deepEqual(fixture.events, ['admin', 'list'])
})

test('creates drafts and uploads the preview before inserting the database record', async () => {
  const fixture = createFixture()
  const result = await fixture.operations.save({
    values: validValues,
    previewFile,
  })

  assert.equal(result.project.is_published, false)
  assert.equal(result.project.preview_image_path, `projects/${projectId}/preview/${versionId}.webp`)
  assert.deepEqual(result.project.technologies, ['HTML', 'CSS', 'JavaScript'])
  assert.equal(fixture.events.indexOf('upload:project-preview') < fixture.events.indexOf('insert'), true)
  assert.equal(fixture.removedPaths.length, 0)
})

test('replaces a preview after upload and database update, then cleans the old unshared image', async () => {
  const fixture = createFixture({ records: [makeProject()] })
  const result = await fixture.operations.save({
    id: projectId,
    values: { ...validValues, slug: 'existing-project' },
    previewFile,
  })

  assert.equal(result.project.preview_image_path, `projects/${projectId}/preview/${versionId}.webp`)
  assert.equal(fixture.events.indexOf('upload:project-preview') < fixture.events.indexOf('update'), true)
  assert.equal(fixture.events.indexOf('update') < fixture.events.indexOf(`remove-check:${oldPreviewPath}`), true)
  assert.deepEqual(fixture.removedPaths, [oldPreviewPath])
})

test('preserves the existing preview when no replacement is selected', async () => {
  const fixture = createFixture({ records: [makeProject()] })
  const result = await fixture.operations.save({
    id: projectId,
    values: { ...validValues, slug: 'existing-project' },
  })
  assert.equal(result.project.preview_image_path, oldPreviewPath)
  assert.equal(fixture.events.some((event) => event.startsWith('upload:')), false)
  assert.equal(fixture.removedPaths.length, 0)
})

test('retains the old preview if a replacement image upload succeeds but the database update fails', async () => {
  const fixture = createFixture({
    records: [makeProject()],
    fail: { update: true },
  })
  await assert.rejects(
    fixture.operations.save({
      id: projectId,
      values: { ...validValues, slug: 'existing-project' },
      previewFile,
    }),
    { code: 'project-save-failed' },
  )

  assert.equal(fixture.storedRecords.get(projectId).preview_image_path, oldPreviewPath)
  assert.deepEqual(fixture.removedPaths, [`projects/${projectId}/preview/${versionId}.webp`])
})

test('surfaces Storage failures without writing the project record', async () => {
  const fixture = createFixture({ fail: { upload: true } })
  await assert.rejects(
    fixture.operations.save({ values: validValues, previewFile }),
    (error) => error instanceof AdminProjectsError && error.code === 'project-upload-failed',
  )
  assert.equal(fixture.events.includes('insert'), false)
})

test('cleans a newly uploaded preview after a database save failure', async () => {
  const fixture = createFixture({ fail: { insert: true } })
  await assert.rejects(
    fixture.operations.save({ values: validValues, previewFile }),
    (error) => error instanceof AdminProjectsError && error.databaseOutcomeUnknown,
  )
  assert.deepEqual(fixture.removedPaths, [`projects/${projectId}/preview/${versionId}.webp`])
  assert.equal(fixture.events.includes('insert'), true)
})

test('returns retryable cleanup information after a replacement succeeds but old-image cleanup fails', async () => {
  const fixture = createFixture({
    records: [makeProject()],
    fail: { cleanup: true },
  })
  const result = await fixture.operations.save({
    id: projectId,
    values: { ...validValues, slug: 'existing-project' },
    previewFile,
  })

  assert.equal(result.project.preview_image_path, `projects/${projectId}/preview/${versionId}.webp`)
  assert.deepEqual(result.cleanup.failed.map((entry) => entry.path), [oldPreviewPath])
  assert.deepEqual(fixture.removedPaths, [])
})

test('reports duplicate slugs clearly and cleans the unreferenced uploaded preview', async () => {
  const fixture = createFixture({ fail: { duplicateSlug: true } })
  await assert.rejects(
    fixture.operations.save({ values: validValues, previewFile }),
    (error) => error.code === 'duplicate-slug' && /already in use/.test(error.message),
  )
  assert.deepEqual(fixture.removedPaths, [`projects/${projectId}/preview/${versionId}.webp`])
})

test('keeps shared preview images when deleting a project', async () => {
  const fixture = createFixture({
    records: [makeProject()],
    sharedPaths: [oldPreviewPath],
  })
  const result = await fixture.operations.delete(projectId)
  assert.equal(fixture.events.indexOf('delete') < fixture.events.indexOf(`remove-check:${oldPreviewPath}`), true)
  assert.deepEqual(result.cleanup.shared, [oldPreviewPath])
  assert.deepEqual(fixture.removedPaths, [])
})

test('deletes an unshared preview only after the project record is deleted', async () => {
  const fixture = createFixture({ records: [makeProject()] })
  const result = await fixture.operations.delete(projectId)
  assert.equal(fixture.events.indexOf('delete') < fixture.events.indexOf(`remove-check:${oldPreviewPath}`), true)
  assert.deepEqual(result.cleanup.deleted, [oldPreviewPath])
  assert.deepEqual(fixture.removedPaths, [oldPreviewPath])
})

test('publishes and unpublishes projects through authorized updates', async () => {
  const fixture = createFixture({ records: [makeProject()] })
  const published = await fixture.operations.setPublished(projectId, true)
  assert.equal(published.is_published, true)
  const unpublished = await fixture.operations.setPublished(projectId, false)
  assert.equal(unpublished.is_published, false)
  assert.equal(fixture.events.filter((event) => event === 'update').length, 2)
})

test('refuses to publish a project with invalid required fields', async () => {
  const fixture = createFixture({
    records: [makeProject({ slug: 'INVALID SLUG' })],
  })
  await assert.rejects(
    fixture.operations.setPublished(projectId, true),
    { code: 'invalid-slug', field: 'slug' },
  )
  assert.equal(fixture.events.includes('update'), false)
})
