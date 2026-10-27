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
  validateProjectVideoFile,
  normalizeProjectVideoUrl,
} from '../src/js/services/admin-projects-validation.js'
import { PORTFOLIO_ASSET_PURPOSES } from '../src/js/services/portfolio-storage-core.js'

const projectId = '8c84b1f1-3ddf-4f29-a8db-6bbab6e451a1'
const secondProjectId = 'e001fe55-70d2-4e65-80bd-7c36e2e2562a'
const versionId = '13a7edc8-9133-4ec1-b3a9-80b495e44648'
const oldVersionId = 'b92bfe14-cc2e-4d54-8a6d-c87e6cfe2143'
const oldPreviewPath = `projects/${projectId}/preview/${oldVersionId}.webp`
const oldVideoPath = `projects/${projectId}/video/${oldVersionId}.mp4`
const previewFile = { name: 'preview.webp', type: 'image/webp', size: 2048 }
const videoFile = { name: 'project.mp4', type: 'video/mp4', size: 4096 }
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
    video_path: null,
    video_url: null,
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
        || [...storedRecords.values()].some((record) => (
          record.preview_image_path === path || record.video_path === path
        ))
    },
  }

  const storage = {
    async upload({ purpose, recordId, file }) {
      events.push(`upload:${purpose}`)
      const slot = purpose === 'project-video' ? 'video' : 'preview'
      const path = `projects/${recordId}/${slot}/${versionId}.${file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]}`
      if (fail.upload || (purpose === 'project-video' && fail.videoUpload)) {
        const error = new Error('mock upload failed')
        error.path = path
        throw error
      }
      uploadedPaths.push(path)
      return { bucket: 'portfolio-assets', path, contentType: file.type, size: file.size, purpose }
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

test('validates supported HTTPS YouTube and Vimeo URL formats', () => {
  assert.equal(
    normalizeProjectVideoUrl('https://youtu.be/AbCdEf12345?t=25'),
    'https://www.youtube.com/watch?v=AbCdEf12345',
  )
  assert.equal(
    normalizeProjectVideoUrl('https://www.youtube.com/shorts/AbCdEf12345'),
    'https://www.youtube.com/watch?v=AbCdEf12345',
  )
  assert.equal(
    normalizeProjectVideoUrl('https://player.vimeo.com/video/123456789'),
    'https://vimeo.com/123456789',
  )
  for (const url of [
    'http://www.youtube.com/watch?v=AbCdEf12345',
    'https://youtube.com.evil.example/watch?v=AbCdEf12345',
    'https://www.youtube.com/watch?v=bad',
    'https://vimeo.com/not-a-video',
    'javascript:alert(1)',
    'https://user@vimeo.com/123456789',
  ]) {
    assert.equal(normalizeProjectVideoUrl(url), null)
  }
})

test('validates MP4 files and mutually exclusive project video sources', () => {
  assert.doesNotThrow(() => validateProjectVideoFile(videoFile))
  assert.throws(
    () => validateProjectVideoFile({ ...videoFile, type: 'video/webm' }),
    (error) => error instanceof ProjectValidationError && error.field === 'videoFile',
  )
  assert.throws(
    () => validateProjectVideoFile({ ...videoFile, size: 50 * 1024 * 1024 + 1 }),
    /no larger than 50 MiB/,
  )

  const noVideo = validateProjectForm({ ...validValues, videoSource: 'none' })
  assert.equal(noVideo.video_path, null)
  assert.equal(noVideo.video_url, null)
  const external = validateProjectForm({
    ...validValues,
    videoSource: 'external',
    videoUrl: 'https://www.youtube.com/watch?v=AbCdEf12345',
  })
  assert.equal(external.video_path, null)
  assert.equal(external.video_url, 'https://www.youtube.com/watch?v=AbCdEf12345')
  const uploaded = validateProjectForm({
    ...validValues,
    videoSource: 'upload',
  }, {
    projectId,
    currentVideoPath: oldVideoPath,
  })
  assert.equal(uploaded.video_path, oldVideoPath)
  assert.equal(uploaded.video_url, null)
  assert.throws(
    () => validateProjectForm({ ...validValues, videoSource: 'upload' }, { projectId }),
    { code: 'video-file-required', field: 'videoFile' },
  )
  assert.throws(
    () => validateProjectForm({
      ...validValues,
      videoSource: 'external',
      videoUrl: 'https://example.test/iframe',
    }),
    { code: 'invalid-video-url', field: 'videoUrl' },
  )
  assert.throws(
    () => validateProjectForm({ ...validValues, videoSource: 'external' }, {
      projectId,
      hasVideoFile: true,
    }),
    { code: 'unexpected-video-file', field: 'videoFile' },
  )
})

test('checks administrator access before listing and rejects unauthorized mutations', async () => {
  const fixture = createFixture({ records: [makeProject()], unauthorized: true })
  await assert.rejects(fixture.operations.list(), /administrator required/)
  await assert.rejects(fixture.operations.save({ values: validValues }), /administrator required/)
  await assert.rejects(
    fixture.operations.save({
      values: { ...validValues, videoSource: 'upload' },
      videoFile,
    }),
    /administrator required/,
  )
  await assert.rejects(fixture.operations.setPublished(projectId, true), /administrator required/)
  assert.equal(fixture.events.some((event) => event.startsWith('upload:')), false)
  await assert.rejects(fixture.operations.delete(projectId), /administrator required/)
  assert.deepEqual(fixture.events, ['admin', 'admin', 'admin', 'admin', 'admin'])
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

test('uploads an MP4 before inserting a new project with exclusive video fields', async () => {
  const fixture = createFixture()
  const result = await fixture.operations.save({
    values: {
      ...validValues,
      videoSource: 'upload',
    },
    videoFile,
  })

  assert.equal(result.project.video_path, `projects/${projectId}/video/${versionId}.mp4`)
  assert.equal(result.project.video_url, null)
  assert.equal(fixture.events.indexOf('upload:project-video') < fixture.events.indexOf('insert'), true)
})

test('replaces an MP4 after database update and then removes the old unshared video', async () => {
  const fixture = createFixture({
    records: [makeProject({ video_path: oldVideoPath })],
  })
  const result = await fixture.operations.save({
    id: projectId,
    values: { ...validValues, slug: 'existing-project', videoSource: 'upload' },
    videoFile,
  })

  assert.equal(result.project.video_path, `projects/${projectId}/video/${versionId}.mp4`)
  assert.equal(result.project.video_url, null)
  assert.equal(fixture.events.indexOf('upload:project-video') < fixture.events.indexOf('update'), true)
  assert.equal(fixture.events.indexOf('update') < fixture.events.indexOf(`remove-check:${oldVideoPath}`), true)
  assert.deepEqual(fixture.removedPaths, [oldVideoPath])
})

test('switches from an uploaded video to an external URL and removes only the old video after save', async () => {
  const fixture = createFixture({
    records: [makeProject({ video_path: oldVideoPath })],
  })
  const result = await fixture.operations.save({
    id: projectId,
    values: {
      ...validValues,
      slug: 'existing-project',
      videoSource: 'external',
      videoUrl: 'https://vimeo.com/123456789',
    },
  })

  assert.equal(result.project.video_path, null)
  assert.equal(result.project.video_url, 'https://vimeo.com/123456789')
  assert.equal(fixture.events.indexOf('update') < fixture.events.indexOf(`remove-check:${oldVideoPath}`), true)
  assert.deepEqual(fixture.removedPaths, [oldVideoPath])
})

test('switches from an external video URL to an MP4 upload without leaving both columns populated', async () => {
  const fixture = createFixture({
    records: [makeProject({
      video_url: 'https://vimeo.com/123456789',
    })],
  })
  const result = await fixture.operations.save({
    id: projectId,
    values: {
      ...validValues,
      slug: 'existing-project',
      videoSource: 'upload',
    },
    videoFile,
  })

  assert.equal(result.project.video_path, `projects/${projectId}/video/${versionId}.mp4`)
  assert.equal(result.project.video_url, null)
  assert.equal(fixture.events.indexOf('upload:project-video') < fixture.events.indexOf('update'), true)
})

test('removes an existing video source by updating both database video fields to null', async () => {
  const fixture = createFixture({
    records: [makeProject({ video_path: oldVideoPath })],
  })
  const result = await fixture.operations.save({
    id: projectId,
    values: { ...validValues, slug: 'existing-project', videoSource: 'none' },
  })

  assert.equal(result.project.video_path, null)
  assert.equal(result.project.video_url, null)
  assert.deepEqual(fixture.removedPaths, [oldVideoPath])
})

test('removes an external video URL without attempting Storage cleanup', async () => {
  const fixture = createFixture({
    records: [makeProject({ video_url: 'https://vimeo.com/123456789' })],
  })
  const result = await fixture.operations.save({
    id: projectId,
    values: { ...validValues, slug: 'existing-project', videoSource: 'none' },
  })

  assert.equal(result.project.video_path, null)
  assert.equal(result.project.video_url, null)
  assert.deepEqual(fixture.removedPaths, [])
})

test('keeps the existing video and cleans a new MP4 if the database update fails', async () => {
  const fixture = createFixture({
    records: [makeProject({ video_path: oldVideoPath })],
    fail: { update: true },
  })
  await assert.rejects(
    fixture.operations.save({
      id: projectId,
      values: { ...validValues, slug: 'existing-project', videoSource: 'upload' },
      videoFile,
    }),
    { code: 'project-save-failed' },
  )

  assert.equal(fixture.storedRecords.get(projectId).video_path, oldVideoPath)
  assert.deepEqual(fixture.removedPaths, [`projects/${projectId}/video/${versionId}.mp4`])
})

test('does not update the database when project video upload fails', async () => {
  const fixture = createFixture({ fail: { videoUpload: true } })
  await assert.rejects(
    fixture.operations.save({
      values: { ...validValues, videoSource: 'upload' },
      videoFile,
    }),
    (error) => error instanceof AdminProjectsError && error.code === 'project-upload-failed',
  )
  assert.equal(fixture.events.includes('insert'), false)
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

test('does not delete a shared project video when deleting its project record', async () => {
  const fixture = createFixture({
    records: [makeProject({ preview_image_path: null, video_path: oldVideoPath })],
    sharedPaths: [oldVideoPath],
  })
  const result = await fixture.operations.delete(projectId)
  assert.equal(fixture.events.indexOf('delete') < fixture.events.indexOf(`remove-check:${oldVideoPath}`), true)
  assert.deepEqual(result.cleanup.shared, [oldVideoPath])
  assert.equal(fixture.removedPaths.includes(oldVideoPath), false)
})

test('deletes an unshared project video only after deleting the project record', async () => {
  const fixture = createFixture({
    records: [makeProject({ preview_image_path: null, video_path: oldVideoPath })],
  })
  const result = await fixture.operations.delete(projectId)

  assert.equal(fixture.events.indexOf('delete') < fixture.events.indexOf(`remove-check:${oldVideoPath}`), true)
  assert.deepEqual(result.cleanup.deleted, [oldVideoPath])
  assert.deepEqual(fixture.removedPaths, [oldVideoPath])
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
