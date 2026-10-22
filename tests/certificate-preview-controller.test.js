import assert from 'node:assert/strict'
import test from 'node:test'
import { createCertificatePreviewController } from '../src/js/services/certificate-preview-controller.js'

const firstPdf = { name: 'first.pdf' }
const secondPdf = { name: 'second.pdf' }
const generatedPreview = { name: 'generated.webp' }
const manualPreview = { name: 'manual.png' }

test('manual preview selection overrides an automatically generated preview', async () => {
  const controller = createCertificatePreviewController({
    generatePreview: async () => generatedPreview,
  })

  await controller.selectPdf(firstPdf)
  assert.equal(controller.getState().previewFile, generatedPreview)
  controller.selectManualPreview(manualPreview)
  assert.equal(controller.getState().previewFile, manualPreview)
  assert.equal(controller.getState().previewKind, 'manual')
  assert.equal(controller.getState().canSave, true)
})

test('a rendering failure blocks a mismatched preview but permits a manual override', async () => {
  const controller = createCertificatePreviewController({
    generatePreview: async () => { throw new Error('PDF render failed') },
  })

  await controller.selectPdf(firstPdf)
  assert.equal(controller.getState().error.message, 'PDF render failed')
  assert.equal(controller.getState().canSave, false)
  controller.selectManualPreview(manualPreview)
  assert.equal(controller.getState().previewFile, manualPreview)
  assert.equal(controller.getState().canSave, true)
})

test('rapid PDF replacement only accepts the currently selected file preview', async () => {
  const resolvers = new Map()
  const controller = createCertificatePreviewController({
    generatePreview: (file) => new Promise((resolve) => resolvers.set(file, resolve)),
  })

  const firstSelection = controller.selectPdf(firstPdf)
  const secondSelection = controller.selectPdf(secondPdf)
  resolvers.get(secondPdf)(generatedPreview)
  await secondSelection

  assert.equal(controller.getState().pdfFile, secondPdf)
  assert.equal(controller.getState().previewFile, generatedPreview)
  assert.equal(controller.getState().busy, true)
  assert.equal(controller.getState().canSave, false)

  const stalePreview = { name: 'stale.webp' }
  resolvers.get(firstPdf)(stalePreview)
  await firstSelection

  assert.equal(controller.getState().previewFile, generatedPreview)
  assert.equal(controller.getState().busy, false)
  assert.equal(controller.getState().canSave, true)
})
