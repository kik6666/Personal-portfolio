import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AdminCertificatesError,
  createAdminCertificatesOperations,
} from '../src/js/services/admin-certificates-core.js'
import {
  CertificateValidationError,
  validateCertificateFiles,
  validateCertificateForm,
} from '../src/js/services/admin-certificates-validation.js'

const certificateId = '8c84b1f1-3ddf-4f29-a8db-6bbab6e451a1'
const secondId = 'e001fe55-70d2-4e65-80bd-7c36e2e2562a'
const versionId = '13a7edc8-9133-4ec1-b3a9-80b495e44648'
const oldVersionId = 'b92bfe14-cc2e-4d54-8a6d-c87e6cfe2143'
const pdfPath = `certificates/${certificateId}/pdf/${oldVersionId}.pdf`
const previewPath = `certificates/${certificateId}/preview/${versionId}.webp`
const credentialUrl = 'https://issuer.example/verify/123'
const pdfFile = { name: 'certificate.pdf', type: 'application/pdf', size: 1024 }
const previewFile = { name: 'preview.webp', type: 'image/webp', size: 2048 }
const validValues = {
  title: 'Secure Web Development',
  issuer: 'Example Academy',
  issueDate: '2026-09-18',
  credentialUrl: '',
  sortOrder: '2',
}

function makeCertificate(fields = {}) {
  return {
    id: certificateId,
    title: 'Existing Certificate',
    issuer: 'Example Academy',
    issue_date: '2025-10-01',
    credential_url: null,
    pdf_path: pdfPath,
    preview_image_path: previewPath,
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
  let cleanupFailurePath = fail.cleanupFailurePath ?? null

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
      if (fail.insert) throw new Error('database insert failed')
      storedRecords.set(record.id, { ...record })
      return { ...record }
    },
    async update(id, fields) {
      events.push('update')
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
          record.pdf_path === path || record.preview_image_path === path
        ))
    },
  }

  const storage = {
    async upload({ purpose, recordId, file }) {
      events.push(`upload:${purpose}`)
      if (fail.uploadPurpose === purpose) {
        const error = new Error('mock upload failed')
        error.path = `certificates/${recordId}/${purpose === 'certificate-pdf' ? 'pdf' : 'preview'}/${versionId}.${file.type === 'application/pdf' ? 'pdf' : 'webp'}`
        throw error
      }
      return {
        bucket: 'portfolio-assets',
        path: `certificates/${recordId}/${purpose === 'certificate-pdf' ? 'pdf' : 'preview'}/${versionId}.${file.type === 'application/pdf' ? 'pdf' : 'webp'}`,
        contentType: file.type,
        size: file.size,
      }
    },
    async remove({ path, isAssetReferenced }) {
      events.push(`remove-check:${path}`)
      if (await isAssetReferenced(path)) {
        const error = new Error('file is referenced')
        error.code = 'asset-in-use'
        throw error
      }
      if (cleanupFailurePath === path) throw new Error('mock cleanup failed')
      removedPaths.push(path)
      events.push(`remove:${path}`)
      return { path }
    },
  }

  const operations = createAdminCertificatesOperations({
    repository,
    storage,
    ensureAdmin: async () => {
      events.push('admin')
      if (unauthorized) throw new Error('administrator required')
    },
    createId: () => certificateId,
  })

  return {
    operations,
    events,
    removedPaths,
    storedRecords,
    setCleanupFailurePath(path) { cleanupFailurePath = path },
  }
}

test('stores a month-only issue date as the first day of the month', () => {
  assert.equal(validateCertificateForm({ ...validValues, issueDate: '2026-04' }).issue_date, '2026-04-01')
  assert.throws(
    () => validateCertificateForm({ ...validValues, issueDate: '2026-13' }),
    { code: 'invalid-issue-date', field: 'issueDate' },
  )
})

test('validates required title, safe credential URL, date, order and publishability', () => {
  assert.throws(
    () => validateCertificateForm({ ...validValues, title: '   ' }),
    { code: 'title-required', field: 'title' },
  )
  assert.throws(
    () => validateCertificateForm({ ...validValues, credentialUrl: 'javascript:alert(1)' }),
    { code: 'invalid-credential-url', field: 'credentialUrl' },
  )
  assert.throws(
    () => validateCertificateForm({ ...validValues, issueDate: '2026-02-30' }),
    { code: 'invalid-issue-date', field: 'issueDate' },
  )
  assert.throws(
    () => validateCertificateForm({ ...validValues, sortOrder: '-1' }),
    { code: 'invalid-sort-order', field: 'sortOrder' },
  )
  assert.throws(
    () => validateCertificateForm(validValues, { publish: true }),
    { code: 'publication-requires-certificate', field: 'pdfFile' },
  )
  assert.equal(
    validateCertificateForm(
      { ...validValues, credentialUrl },
      { publish: true },
    ).credential_url,
    credentialUrl,
  )
  assert.equal(
    validateCertificateForm(validValues, { pdfPath, publish: true }).pdf_path,
    pdfPath,
  )
})

test('validates the certificate-specific PDF and preview MIME types and size limits', () => {
  assert.doesNotThrow(() => validateCertificateFiles(pdfFile, previewFile))
  assert.throws(
    () => validateCertificateFiles({ ...pdfFile, type: 'image/png' }, null),
    { code: 'unsupported-purpose-type' },
  )
  assert.throws(
    () => validateCertificateFiles(null, { ...previewFile, size: 50 * 1024 * 1024 + 1 }),
    { code: 'file-too-large' },
  )
})

test('checks administrator access before listing certificates', async () => {
  const fixture = createFixture({ unauthorized: true })
  await assert.rejects(fixture.operations.list(), /administrator required/)
  assert.deepEqual(fixture.events, ['admin'])
})

test('lists published and draft records without permitting unauthorized mutations', async () => {
  const fixture = createFixture({
    records: [
      makeCertificate({ id: certificateId, is_published: false }),
      makeCertificate({ id: secondId, is_published: true }),
    ],
  })
  const records = await fixture.operations.list()
  assert.equal(records.length, 2)
  assert.equal(records.some((record) => record.is_published), true)
  assert.equal(records.some((record) => !record.is_published), true)

  const denied = createFixture({
    records: [makeCertificate()],
    unauthorized: true,
  })
  await assert.rejects(denied.operations.save({ values: validValues }), /administrator required/)
  await assert.rejects(denied.operations.setPublished(certificateId, false), /administrator required/)
  await assert.rejects(denied.operations.delete(certificateId), /administrator required/)
  assert.deepEqual(denied.events, ['admin', 'admin', 'admin'])
  assert.equal(denied.storedRecords.has(certificateId), true)
})

test('creates new records as drafts and stores uploaded files before the database insert', async () => {
  const fixture = createFixture()
  const result = await fixture.operations.save({
    values: validValues,
    pdfFile,
    previewFile,
  })

  assert.equal(result.certificate.is_published, false)
  assert.equal(result.certificate.pdf_path, `certificates/${certificateId}/pdf/${versionId}.pdf`)
  assert.equal(result.certificate.preview_image_path, `certificates/${certificateId}/preview/${versionId}.webp`)
  assert.equal(fixture.events.indexOf('upload:certificate-pdf') < fixture.events.indexOf('insert'), true)
  assert.equal(fixture.events.indexOf('upload:certificate-preview') < fixture.events.indexOf('insert'), true)
  assert.equal(fixture.removedPaths.length, 0)
})

test('publishes only when an uploaded or existing PDF or credential URL is valid', async () => {
  const fixture = createFixture()
  await assert.rejects(
    fixture.operations.save({ values: validValues, publish: true }),
    { code: 'publication-requires-certificate' },
  )
  assert.equal(fixture.events.includes('insert'), false)

  const result = await fixture.operations.save({
    values: { ...validValues, credentialUrl },
    publish: true,
  })
  assert.equal(result.certificate.is_published, true)
  assert.equal(result.certificate.credential_url, credentialUrl)
})

test('direct publish controls validate the current record before updating status', async () => {
  const incomplete = createFixture({
    records: [makeCertificate({ pdf_path: null, credential_url: null })],
  })
  await assert.rejects(
    incomplete.operations.setPublished(certificateId, true),
    { code: 'publication-requires-certificate' },
  )
  assert.equal(incomplete.events.includes('update'), false)

  const valid = createFixture({
    records: [makeCertificate({ pdf_path: null, credential_url: credentialUrl })],
  })
  const published = await valid.operations.setPublished(certificateId, true)
  assert.equal(published.is_published, true)
  const unpublished = await valid.operations.setPublished(certificateId, false)
  assert.equal(unpublished.is_published, false)
})

test('replaces a file only after upload and database update, then cleans the old unshared file', async () => {
  const fixture = createFixture({ records: [makeCertificate()] })
  const result = await fixture.operations.save({
    id: certificateId,
    values: validValues,
    pdfFile,
    publish: false,
  })

  assert.equal(fixture.events.indexOf('upload:certificate-pdf') < fixture.events.indexOf('update'), true)
  assert.equal(fixture.events.indexOf('update') < fixture.events.indexOf(`remove-check:${pdfPath}`), true)
  assert.deepEqual(fixture.removedPaths, [pdfPath])
  assert.equal(result.certificate.pdf_path, `certificates/${certificateId}/pdf/${versionId}.pdf`)
  assert.equal(result.certificate.preview_image_path, previewPath)
})

test('keeps shared files when replacing or deleting a certificate', async () => {
  const secondRecord = makeCertificate({
    id: secondId,
    pdf_path: pdfPath,
    preview_image_path: previewPath,
  })
  const fixture = createFixture({
    records: [makeCertificate(), secondRecord],
    sharedPaths: [pdfPath],
  })
  const result = await fixture.operations.save({
    id: certificateId,
    values: validValues,
    pdfFile,
  })

  assert.deepEqual(result.cleanup.shared, [pdfPath])
  assert.equal(fixture.removedPaths.includes(pdfPath), false)

  const deleted = await fixture.operations.delete(certificateId)
  assert.deepEqual(deleted.cleanup.shared, [previewPath])
  assert.equal(fixture.storedRecords.get(secondId).pdf_path, pdfPath)
  assert.equal(fixture.storedRecords.has(certificateId), false)
  assert.equal(fixture.storedRecords.has(secondId), true)
})

test('cleans a newly uploaded file after a failed database save without deleting the old reference', async () => {
  const fixture = createFixture({
    records: [makeCertificate()],
    fail: { update: true },
  })
  await assert.rejects(
    fixture.operations.save({
      id: certificateId,
      values: validValues,
      pdfFile,
    }),
    (error) => error instanceof AdminCertificatesError
      && error.code === 'certificate-save-failed'
      && error.databaseOutcomeUnknown
      && error.cleanup.deleted.length === 1
      && error.cleanup.shared.includes(pdfPath),
  )

  assert.deepEqual(fixture.removedPaths, [`certificates/${certificateId}/pdf/${versionId}.pdf`])
  assert.equal(fixture.storedRecords.get(certificateId).pdf_path, pdfPath)
  assert.equal(fixture.events.includes(`remove-check:${pdfPath}`), true)
})

test('reports partial upload and cleanup failures with retryable paths', async () => {
  const fixture = createFixture({
    fail: { uploadPurpose: 'certificate-preview' },
  })
  const expectedRecovery = `certificates/${certificateId}/preview/${versionId}.webp`
  fixture.setCleanupFailurePath(expectedRecovery)
  await assert.rejects(
    fixture.operations.save({
      values: validValues,
      pdfFile,
      previewFile,
    }),
    (error) => error instanceof AdminCertificatesError
      && error.code === 'asset-upload-failed'
      && error.cleanup.failed.some((entry) => entry.path === expectedRecovery)
      && error.recoveryPaths.includes(expectedRecovery),
  )

  fixture.setCleanupFailurePath(null)
  const retried = await fixture.operations.retryCleanup([expectedRecovery])
  assert.deepEqual(retried.deleted, [expectedRecovery])
})

test('deletes the record before checking files and exposes file-cleanup failures', async () => {
  const fixture = createFixture({
    records: [makeCertificate()],
    fail: { cleanupFailurePath: pdfPath },
  })
  const result = await fixture.operations.delete(certificateId)

  assert.equal(fixture.events.indexOf('delete') < fixture.events.indexOf(`remove-check:${pdfPath}`), true)
  assert.equal(fixture.storedRecords.has(certificateId), false)
  assert.deepEqual(result.cleanup.failed.map((entry) => entry.path), [pdfPath])
  assert.deepEqual(result.cleanup.deleted, [previewPath])
})

test('reports ambiguous database deletion and only removes paths proven unreferenced', async () => {
  const fixture = createFixture({
    records: [makeCertificate()],
    fail: { delete: true },
  })
  await assert.rejects(
    fixture.operations.delete(certificateId),
    (error) => error instanceof AdminCertificatesError
      && error.code === 'certificate-delete-failed'
      && error.databaseOutcomeUnknown
      && error.cleanup.shared.includes(pdfPath)
      && error.cleanup.shared.includes(previewPath),
  )
  assert.equal(fixture.removedPaths.length, 0)
  assert.equal(fixture.storedRecords.has(certificateId), true)
})
