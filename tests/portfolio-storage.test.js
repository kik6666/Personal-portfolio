import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPortfolioAssetPath,
  createPortfolioStorageOperations,
  isSafePortfolioAssetPath,
  PORTFOLIO_ASSET_MAX_BYTES,
  PORTFOLIO_ASSET_PURPOSES,
  PortfolioStorageError,
  validatePortfolioFile,
} from '../src/js/services/portfolio-storage-core.js'

const certificateId = '8c84b1f1-3ddf-4f29-a8db-6bbab6e451a1'
const versionId = '13a7edc8-9133-4ec1-b3a9-80b495e44648'
const pdf = (size = 1024) => ({ name: 'certificate.pdf', type: 'application/pdf', size })
const image = (type = 'image/webp', size = 1024) => ({ name: 'preview.webp', type, size })

function operationsFor(bucket, overrides = {}) {
  let adminChecks = 0
  const service = createPortfolioStorageOperations({
    getBucket: () => bucket,
    ensureAdmin: async () => {
      adminChecks += 1
      if (overrides.authError) throw overrides.authError
    },
    createVersionId: () => versionId,
  })

  return { service, get adminChecks() { return adminChecks } }
}

test('validates only approved MIME types and respects the 50 MiB limit', () => {
  assert.equal(validatePortfolioFile(pdf(), PORTFOLIO_ASSET_PURPOSES.certificatePdf).contentType, 'application/pdf')
  assert.equal(validatePortfolioFile(image('image/jpeg'), PORTFOLIO_ASSET_PURPOSES.certificatePreview).extension, '.jpg')
  assert.equal(validatePortfolioFile(image('image/png'), PORTFOLIO_ASSET_PURPOSES.projectPreview).extension, '.png')
  assert.equal(validatePortfolioFile(image(), PORTFOLIO_ASSET_PURPOSES.cvPreview).extension, '.webp')
  assert.equal(
    validatePortfolioFile({ name: 'avatar.mp4', type: 'video/mp4', size: 1 }, PORTFOLIO_ASSET_PURPOSES.avatarVideo).extension,
    '.mp4',
  )
  assert.equal(validatePortfolioFile(pdf(PORTFOLIO_ASSET_MAX_BYTES), PORTFOLIO_ASSET_PURPOSES.cvPdf).size, PORTFOLIO_ASSET_MAX_BYTES)
})

test('rejects empty, unsupported, purpose-mismatched, and oversized files', () => {
  assert.throws(() => validatePortfolioFile(pdf(0), PORTFOLIO_ASSET_PURPOSES.certificatePdf), { code: 'empty-file' })
  assert.throws(
    () => validatePortfolioFile({ type: 'image/svg+xml', size: 20 }, PORTFOLIO_ASSET_PURPOSES.certificatePreview),
    { code: 'unsupported-file-type' },
  )
  assert.throws(
    () => validatePortfolioFile(pdf(), PORTFOLIO_ASSET_PURPOSES.projectPreview),
    { code: 'unsupported-purpose-type' },
  )
  assert.throws(
    () => validatePortfolioFile(pdf(PORTFOLIO_ASSET_MAX_BYTES + 1), PORTFOLIO_ASSET_PURPOSES.certificatePdf),
    { code: 'file-too-large' },
  )
})

test('creates safe, versioned bucket-relative paths without using user filenames', () => {
  const path = createPortfolioAssetPath({
    purpose: PORTFOLIO_ASSET_PURPOSES.certificatePdf,
    recordId: certificateId,
    file: pdf(),
    versionId,
  })

  assert.equal(path, `certificates/${certificateId}/pdf/${versionId}.pdf`)
  assert.equal(isSafePortfolioAssetPath(path), true)
  assert.equal(
    createPortfolioAssetPath({
      purpose: PORTFOLIO_ASSET_PURPOSES.avatarVideo,
      file: { type: 'video/mp4', size: 1 },
      versionId,
    }),
    `site-content/avatar/video/${versionId}.mp4`,
  )
})

test('rejects unsafe record IDs, version IDs, and storage paths', () => {
  assert.throws(
    () => createPortfolioAssetPath({
      purpose: PORTFOLIO_ASSET_PURPOSES.certificatePdf,
      recordId: '../private',
      file: pdf(),
      versionId,
    }),
    { code: 'invalid-record-id' },
  )
  assert.throws(
    () => createPortfolioAssetPath({
      purpose: PORTFOLIO_ASSET_PURPOSES.certificatePdf,
      recordId: certificateId,
      file: pdf(),
      versionId: '../escape',
    }),
    { code: 'invalid-version-id' },
  )
  for (const path of [
    '/certificates/file.pdf',
    'certificates/../file.pdf',
    'certificates\\file.pdf',
    'certificates/id/file.pdf?download=1',
    'other-assets/file.pdf',
  ]) {
    assert.equal(isSafePortfolioAssetPath(path), false)
  }
})

test('uploads a new version only after the administrator guard succeeds', async () => {
  const calls = []
  const uploadOperations = operationsFor({
    async upload(path, file, options) {
      calls.push({ path, file, options })
      return { data: { path }, error: null }
    },
  })

  const result = await uploadOperations.service.upload({
    purpose: PORTFOLIO_ASSET_PURPOSES.certificatePdf,
    recordId: certificateId,
    file: pdf(),
  })

  assert.equal(uploadOperations.adminChecks, 1)
  assert.equal(result.bucket, 'portfolio-assets')
  assert.equal(result.path, `certificates/${certificateId}/pdf/${versionId}.pdf`)
  assert.equal(calls[0].options.contentType, 'application/pdf')
  assert.equal(calls[0].options.upsert, false)
  assert.equal(calls[0].options.cacheControl, '3600')
})

test('rejects upload errors and ambiguous network outcomes explicitly', async () => {
  const responseFailure = operationsFor({
    async upload() {
      return { data: null, error: new Error('storage rejected upload') }
    },
  })
  await assert.rejects(
    responseFailure.service.upload({
      purpose: PORTFOLIO_ASSET_PURPOSES.certificatePdf,
      recordId: certificateId,
      file: pdf(),
    }),
    (error) => error instanceof PortfolioStorageError && error.code === 'upload-failed',
  )

  const networkFailure = operationsFor({
    async upload() {
      throw new Error('network unavailable')
    },
  })
  await assert.rejects(
    networkFailure.service.upload({
      purpose: PORTFOLIO_ASSET_PURPOSES.certificatePdf,
      recordId: certificateId,
      file: pdf(),
    }),
    (error) => error instanceof PortfolioStorageError
      && error.code === 'upload-outcome-unknown'
      && error.path === `certificates/${certificateId}/pdf/${versionId}.pdf`,
  )
})

test('does not upload invalid files or files without administrator authorization', async () => {
  let uploads = 0
  const invalidFile = operationsFor({ async upload() { uploads += 1 } })
  await assert.rejects(
    invalidFile.service.upload({
      purpose: PORTFOLIO_ASSET_PURPOSES.certificatePdf,
      recordId: certificateId,
      file: image('image/gif'),
    }),
    { code: 'unsupported-file-type' },
  )
  assert.equal(uploads, 0)
  assert.equal(invalidFile.adminChecks, 0)

  const unauthorized = operationsFor(
    { async upload() { uploads += 1 } },
    { authError: new Error('administrator required') },
  )
  await assert.rejects(
    unauthorized.service.upload({
      purpose: PORTFOLIO_ASSET_PURPOSES.certificatePdf,
      recordId: certificateId,
      file: pdf(),
    }),
    /administrator required/,
  )
  assert.equal(uploads, 0)
})

test('requires an unreferenced check and refuses to delete referenced or unsafe paths', async () => {
  let removals = 0
  const path = `certificates/${certificateId}/pdf/${versionId}.pdf`
  const { service } = operationsFor({
    async remove() {
      removals += 1
      return { data: [{ name: path }], error: null }
    },
  })

  await assert.rejects(service.remove({ path }), { code: 'reference-check-required' })
  await assert.rejects(
    service.remove({ path, isAssetReferenced: async () => true }),
    { code: 'asset-in-use' },
  )
  await assert.rejects(
    service.remove({ path: '../unsafe', isAssetReferenced: async () => false }),
    { code: 'unsafe-path' },
  )
  assert.equal(removals, 0)
})

test('deletes an unreferenced object and surfaces reference or Storage failures', async () => {
  const path = `certificates/${certificateId}/pdf/${versionId}.pdf`
  const success = operationsFor({
    async remove(paths) {
      assert.deepEqual(paths, [path])
      return { data: [{ name: path }], error: null }
    },
  })

  assert.deepEqual(
    await success.service.remove({ path, isAssetReferenced: async () => false }),
    { bucket: 'portfolio-assets', path },
  )

  const referenceFailure = operationsFor({ async remove() { throw new Error('must not be called') } })
  await assert.rejects(
    referenceFailure.service.remove({ path, isAssetReferenced: async () => { throw new Error('database unavailable') } }),
    { code: 'reference-check-failed' },
  )

  const deleteFailure = operationsFor({
    async remove() {
      return { data: null, error: new Error('storage rejected delete') }
    },
  })
  await assert.rejects(
    deleteFailure.service.remove({ path, isAssetReferenced: async () => false }),
    { code: 'delete-failed' },
  )
})
