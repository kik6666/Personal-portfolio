import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AdminSiteMediaError,
  createAdminSiteMediaOperations,
  SITE_MEDIA_ITEMS,
  validateSiteMediaFile,
} from '../src/js/services/admin-site-media-core.js'
import { PORTFOLIO_ASSET_MAX_BYTES } from '../src/js/services/portfolio-storage-core.js'

const version = '13a7edc8-9133-4ec1-b3a9-80b495e44648'
const nextVersion = 'b92bfe14-cc2e-4d54-8a6d-c87e6cfe2143'
const mediaPaths = {
  avatar: `site-content/avatar/video/${version}.mp4`,
  poster: `site-content/avatar/poster/${version}.webp`,
  nextPoster: `site-content/avatar/poster/${nextVersion}.png`,
  cvPdf: `site-content/cv/pdf/${version}.pdf`,
  cvPreview: `site-content/cv/preview/${version}.webp`,
  businessCard: `site-content/business-card/image/${version}.png`,
  nextCvPdf: `site-content/cv/pdf/${nextVersion}.pdf`,
}

function record(key, value, is_public = false) {
  return { key, value, is_public, updated_at: '2026-10-28T12:00:00Z' }
}

function createFixture({
  records = [],
  unauthorized = false,
  fail = {},
} = {}) {
  const rows = new Map(records.map((row) => [row.key, { ...row }]))
  const events = []
  const uploads = []
  const deletedPaths = []
  let adminChecks = 0

  const repository = {
    async list(keys) {
      events.push('list')
      if (fail.list) throw new Error('Database list failed.')
      return [...rows.values()]
        .filter((row) => keys.includes(row.key))
        .map((row) => ({ ...row }))
    },
    async get(key) {
      events.push(`get:${key}`)
      if (fail.get) throw new Error('Database read failed.')
      return rows.has(key) ? { ...rows.get(key) } : null
    },
    async insert(next) {
      events.push(`insert:${next.key}`)
      if (fail.insert) throw new Error('Database insert failed.')
      if (rows.has(next.key)) throw new Error('The key already exists.')
      const saved = { ...next, updated_at: '2026-10-28T13:00:00Z' }
      rows.set(next.key, saved)
      return { ...saved }
    },
    async update(current, next) {
      events.push(`update:${next.key}`)
      if (fail.update) throw new Error('Database update failed.')
      const latest = rows.get(current.key)
      if (
        !latest
        || latest.value !== current.value
        || latest.is_public !== current.is_public
        || latest.updated_at !== current.updated_at
      ) {
        throw new AdminSiteMediaError('concurrent-update', 'The media item changed.')
      }
      const saved = { ...next, updated_at: '2026-10-28T13:00:00Z' }
      rows.set(next.key, saved)
      return { ...saved }
    },
    async delete(current) {
      events.push(`delete:${current.key}`)
      if (fail.delete) throw new Error('Database delete failed.')
      const latest = rows.get(current.key)
      if (
        !latest
        || latest.value !== current.value
        || latest.is_public !== current.is_public
        || latest.updated_at !== current.updated_at
      ) return false
      rows.delete(current.key)
      return true
    },
    async isAssetReferenced(path) {
      events.push(`reference:${path}`)
      if (fail.reference) throw new Error('Reference check failed.')
      return [...rows.values()].some((row) => row.value === path)
        || (fail.sharedPaths ?? []).includes(path)
    },
  }

  const storage = {
    async upload(options) {
      events.push(`upload:${options.purpose}`)
      if (fail.upload) throw new Error('Storage upload failed.')
      const path = fail.uploadUnknown
        ? null
        : fail.uploadPath || (
          options.purpose === 'cv-pdf'
            ? mediaPaths.nextCvPdf
            : options.purpose === 'avatar-video-poster'
              ? mediaPaths.nextPoster
              : `site-content/test/${nextVersion}.bin`
        )
      uploads.push({ ...options, path })
      if (!path) {
        const error = new Error('Upload outcome could not be confirmed.')
        error.code = 'upload-outcome-unknown'
        error.path = mediaPaths.nextCvPdf
        throw error
      }
      return { bucket: 'portfolio-assets', path }
    },
    async remove({ path, isAssetReferenced }) {
      events.push(`remove:${path}`)
      if (fail.remove) throw new Error('Storage delete failed.')
      if (await isAssetReferenced(path)) {
        throw new AdminSiteMediaError('asset-in-use', 'File is still referenced.')
      }
      deletedPaths.push(path)
      return { bucket: 'portfolio-assets', path }
    },
  }

  const operations = createAdminSiteMediaOperations({
    repository,
    storage,
    ensureAdmin: async () => {
      adminChecks += 1
      if (unauthorized) throw new AdminSiteMediaError('not-admin', 'Administrator access is required.')
    },
  })

  return {
    operations,
    events,
    uploads,
    deletedPaths,
    get adminChecks() { return adminChecks },
    get rows() { return [...rows.values()].map((row) => ({ ...row })) },
  }
}

test('defines all four media items and validates accepted MIME types and the shared limit', () => {
  assert.deepEqual(SITE_MEDIA_ITEMS.map(({ key }) => key), [
    'avatar_video_path',
    'avatar_video_poster_path',
    'cv_pdf_path',
    'cv_preview_image_path',
    'business_card_image_path',
  ])
  assert.equal(validateSiteMediaFile('avatar_video_path', {
    type: 'video/mp4',
    size: PORTFOLIO_ASSET_MAX_BYTES,
  }).contentType, 'video/mp4')
  assert.equal(validateSiteMediaFile('cv_pdf_path', {
    type: 'application/pdf',
    size: 10,
  }).extension, '.pdf')
  for (const key of ['avatar_video_poster_path', 'cv_preview_image_path', 'business_card_image_path']) {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      assert.equal(validateSiteMediaFile(key, { type, size: 20 }).contentType, type)
    }
  }
})

test('rejects invalid media types, oversized files and unsupported media keys', () => {
  assert.throws(
    () => validateSiteMediaFile('avatar_video_path', { type: 'video/webm', size: 10 }),
    { code: 'unsupported-file-type' },
  )
  assert.throws(
    () => validateSiteMediaFile('cv_pdf_path', { type: 'image/png', size: 10 }),
    { code: 'unsupported-purpose-type' },
  )
  assert.throws(
    () => validateSiteMediaFile('business_card_image_path', {
      type: 'image/jpeg',
      size: PORTFOLIO_ASSET_MAX_BYTES + 1,
    }),
    { code: 'file-too-large' },
  )
  assert.throws(
    () => validateSiteMediaFile('other_path', { type: 'image/png', size: 10 }),
    { code: 'invalid-key' },
  )
})

test('loads an initially empty media table without requiring content rows', async () => {
  const fixture = createFixture()

  assert.deepEqual(await fixture.operations.list(), {})
  assert.equal(fixture.adminChecks, 1)
  assert.deepEqual(fixture.uploads, [])
  assert.deepEqual(fixture.deletedPaths, [])
})

test('requires administrator authorization before listing, uploading or removing', async () => {
  const fixture = createFixture({ unauthorized: true, records: [record('cv_pdf_path', mediaPaths.cvPdf)] })

  await assert.rejects(fixture.operations.list(), { code: 'not-admin' })
  await assert.rejects(
    fixture.operations.save({
      key: 'cv_pdf_path',
      file: { type: 'application/pdf', size: 10 },
      is_public: false,
    }),
    { code: 'not-admin' },
  )
  await assert.rejects(fixture.operations.remove('cv_pdf_path'), { code: 'not-admin' })
  assert.equal(fixture.uploads.length, 0)
  assert.deepEqual(fixture.deletedPaths, [])
})

test('publishes and unpublishes an existing media reference without reuploading it', async () => {
  const fixture = createFixture({ records: [record('cv_pdf_path', mediaPaths.cvPdf, false)] })

  const published = await fixture.operations.save({ key: 'cv_pdf_path', is_public: true })
  assert.deepEqual(published.record, { ...record('cv_pdf_path', mediaPaths.cvPdf, true), updated_at: '2026-10-28T13:00:00Z' })
  assert.equal(fixture.uploads.length, 0)

  const drafted = await fixture.operations.save({ key: 'cv_pdf_path', is_public: false })
  assert.equal(drafted.record.is_public, false)
  assert.equal(drafted.record.value, mediaPaths.cvPdf)
  assert.equal(fixture.uploads.length, 0)
})

test('manages the Home Video Poster independently from the Home video publication state', async () => {
  const fixture = createFixture({
    records: [
      record('avatar_video_path', mediaPaths.avatar, true),
      record('avatar_video_poster_path', mediaPaths.poster, false),
    ],
  })

  const replacement = await fixture.operations.save({
    key: 'avatar_video_poster_path',
    file: { type: 'image/png', size: 400 },
    is_public: false,
  })

  assert.equal(replacement.record.value, mediaPaths.nextPoster)
  assert.equal(replacement.record.is_public, false)
  assert.deepEqual(replacement.previousCleanup, { status: 'deleted', path: mediaPaths.poster })
  assert.equal(fixture.rows.find(({ key }) => key === 'avatar_video_path').is_public, true)

  const published = await fixture.operations.save({
    key: 'avatar_video_poster_path',
    is_public: true,
  })
  assert.equal(published.record.is_public, true)
  assert.equal(fixture.rows.find(({ key }) => key === 'avatar_video_path').value, mediaPaths.avatar)
})

test('removes a Home Video Poster only after updating its reference and checking for shared use', async () => {
  const fixture = createFixture({
    records: [record('avatar_video_poster_path', mediaPaths.poster, true)],
  })

  const result = await fixture.operations.remove('avatar_video_poster_path')

  assert.equal(result.removed, true)
  assert.deepEqual(result.cleanup, { status: 'deleted', path: mediaPaths.poster })
  assert.ok(
    fixture.events.indexOf('delete:avatar_video_poster_path')
      < fixture.events.indexOf(`remove:${mediaPaths.poster}`),
  )
  assert.deepEqual(fixture.deletedPaths, [mediaPaths.poster])
})

test('uploads a replacement before updating its reference and only then cleans the old file', async () => {
  const fixture = createFixture({ records: [record('cv_pdf_path', mediaPaths.cvPdf, true)] })

  const result = await fixture.operations.save({
    key: 'cv_pdf_path',
    file: { type: 'application/pdf', size: 400 },
    is_public: false,
  })

  assert.equal(result.record.value, mediaPaths.nextCvPdf)
  assert.equal(result.record.is_public, false)
  assert.deepEqual(result.previousCleanup, { status: 'deleted', path: mediaPaths.cvPdf })
  assert.ok(fixture.events.indexOf('upload:cv-pdf') < fixture.events.indexOf('update:cv_pdf_path'))
  assert.ok(fixture.events.indexOf('update:cv_pdf_path') < fixture.events.indexOf(`remove:${mediaPaths.cvPdf}`))
  assert.deepEqual(fixture.deletedPaths, [mediaPaths.cvPdf])
})

test('keeps a shared old file after successfully replacing its current reference', async () => {
  const fixture = createFixture({
    records: [
      record('cv_pdf_path', mediaPaths.cvPdf, true),
      record('business_card_image_path', mediaPaths.cvPdf, false),
    ],
  })

  const result = await fixture.operations.save({
    key: 'cv_pdf_path',
    file: { type: 'application/pdf', size: 400 },
    is_public: true,
  })

  assert.equal(result.previousCleanup.status, 'shared')
  assert.deepEqual(fixture.deletedPaths, [])
  assert.equal(fixture.rows.find(({ key }) => key === 'business_card_image_path').value, mediaPaths.cvPdf)
})

test('removes the database reference before reference-checked Storage cleanup', async () => {
  const fixture = createFixture({ records: [record('business_card_image_path', mediaPaths.businessCard, true)] })

  const result = await fixture.operations.remove('business_card_image_path')

  assert.equal(result.removed, true)
  assert.deepEqual(result.cleanup, { status: 'deleted', path: mediaPaths.businessCard })
  assert.ok(
    fixture.events.indexOf('delete:business_card_image_path')
      < fixture.events.indexOf(`remove:${mediaPaths.businessCard}`),
  )
  assert.deepEqual(fixture.rows, [])
  assert.deepEqual(fixture.deletedPaths, [mediaPaths.businessCard])
})

test('removes a shared media reference but keeps the shared Storage object', async () => {
  const fixture = createFixture({
    records: [
      record('cv_preview_image_path', mediaPaths.cvPreview, false),
      record('business_card_image_path', mediaPaths.cvPreview, true),
    ],
  })

  const result = await fixture.operations.remove('cv_preview_image_path')

  assert.equal(result.removed, true)
  assert.equal(result.cleanup.status, 'shared')
  assert.deepEqual(fixture.deletedPaths, [])
  assert.equal(fixture.rows[0].key, 'business_card_image_path')
})

test('cleans a newly uploaded replacement after a database update failure and retains the old reference', async () => {
  const fixture = createFixture({
    records: [record('cv_pdf_path', mediaPaths.cvPdf, true)],
    fail: { update: true },
  })

  await assert.rejects(
    fixture.operations.save({
      key: 'cv_pdf_path',
      file: { type: 'application/pdf', size: 400 },
      is_public: false,
    }),
    (error) => error.code === 'database-save-failed'
      && error.cleanup.status === 'deleted'
      && error.path === mediaPaths.nextCvPdf,
  )
  assert.equal(fixture.rows[0].value, mediaPaths.cvPdf)
  assert.deepEqual(fixture.deletedPaths, [mediaPaths.nextCvPdf])
  assert.ok(fixture.events.indexOf('upload:cv-pdf') < fixture.events.indexOf('update:cv_pdf_path'))
  assert.ok(fixture.events.indexOf('update:cv_pdf_path') < fixture.events.indexOf(`remove:${mediaPaths.nextCvPdf}`))
})

test('reports cleanup failures after database failures without deleting referenced files', async () => {
  const fixture = createFixture({
    records: [record('cv_pdf_path', mediaPaths.cvPdf, true)],
    fail: { update: true, reference: true },
  })

  await assert.rejects(
    fixture.operations.save({
      key: 'cv_pdf_path',
      file: { type: 'application/pdf', size: 400 },
      is_public: false,
    }),
    (error) => error.code === 'database-save-failed'
      && error.cleanup.status === 'failed'
      && error.cleanup.path === mediaPaths.nextCvPdf,
  )
  assert.deepEqual(fixture.deletedPaths, [])
  assert.equal(fixture.rows[0].value, mediaPaths.cvPdf)
})

test('does not write a database reference when an upload fails', async () => {
  const fixture = createFixture({ fail: { upload: true } })

  await assert.rejects(
    fixture.operations.save({
      key: 'avatar_video_path',
      file: { type: 'video/mp4', size: 400 },
      is_public: true,
    }),
    { code: 'upload-failed' },
  )
  assert.equal(fixture.rows.length, 0)
  assert.equal(fixture.events.some((event) => event.startsWith('insert:')), false)
})

test('refuses publication changes when no media exists and no file is selected', async () => {
  const fixture = createFixture()

  await assert.rejects(
    fixture.operations.save({ key: 'cv_pdf_path', is_public: true }),
    { code: 'media-required' },
  )
  assert.equal(fixture.rows.length, 0)
})
