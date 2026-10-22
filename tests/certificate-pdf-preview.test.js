import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CertificatePdfPreviewError,
  generateCertificatePdfPreview,
} from '../src/js/services/certificate-pdf-preview.js'

const pdfFile = {
  name: 'certificate.pdf',
  type: 'application/pdf',
  size: 20,
  async arrayBuffer() {
    return new Uint8Array([1, 2, 3]).buffer
  },
}

function createPdfHarness({ renderError = null, pdfError = null, webp = true } = {}) {
  const events = []
  const canvas = {
    width: 0,
    height: 0,
    getContext(kind, options) {
      events.push(['context', kind, options])
      return {}
    },
    toBlob(callback, type, quality) {
      events.push(['encode', type, quality])
      if (type === 'image/webp' && webp) {
        callback(new Blob(['webp'], { type: 'image/webp' }))
      } else if (type === 'image/png') {
        callback(new Blob(['png'], { type: 'image/png' }))
      } else {
        callback(new Blob(['png'], { type: 'image/png' }))
      }
    },
  }
  const page = {
    getViewport({ scale }) {
      events.push(['viewport', scale])
      return { width: 600 * scale, height: 800 * scale }
    },
    render({ viewport }) {
      events.push(['render', viewport])
      return {
        promise: renderError ? Promise.reject(renderError) : Promise.resolve(),
      }
    },
  }
  const pdfDocument = {
    numPages: 2,
    async getPage(number) {
      events.push(['page', number])
      return page
    },
    async destroy() {
      events.push(['document-destroy'])
    },
  }
  const loadingTask = {
    promise: pdfError ? Promise.reject(pdfError) : Promise.resolve(pdfDocument),
    async destroy() {
      events.push(['loading-task-destroy'])
    },
  }

  return {
    events,
    canvas,
    loadPdfLibrary: async () => ({
      getDocument(options) {
        events.push(['document-options', options])
        return loadingTask
      },
    }),
    createCanvas: () => canvas,
    createFile(parts, name, options) {
      return { parts, name, ...options, size: parts[0].size }
    },
  }
}

test('renders only the first page and returns an optimized WebP preview', async () => {
  const harness = createPdfHarness()
  const result = await generateCertificatePdfPreview(pdfFile, harness)

  assert.equal(result.name, 'certificate-preview.webp')
  assert.equal(result.type, 'image/webp')
  assert.equal(result.size, 4)
  assert.equal(harness.events.some((event) => event[0] === 'page' && event[1] === 1), true)
  assert.equal(harness.events.some((event) => event[0] === 'page' && event[1] !== 1), false)
  assert.equal(harness.events.find((event) => event[0] === 'document-options')[1].isEvalSupported, false)
  assert.equal(harness.events.some((event) => event[0] === 'document-destroy'), true)
  assert.equal(harness.canvas.width, 0)
  assert.equal(harness.canvas.height, 0)
})

test('falls back to PNG when WebP encoding is unavailable', async () => {
  const harness = createPdfHarness({ webp: false })
  const result = await generateCertificatePdfPreview(pdfFile, harness)

  assert.equal(result.name, 'certificate-preview.png')
  assert.equal(result.type, 'image/png')
  assert.equal(harness.events.some((event) => event[0] === 'encode' && event[1] === 'image/png'), true)
})

test('rejects invalid file types before loading PDF.js', async () => {
  let loaded = false
  await assert.rejects(
    generateCertificatePdfPreview({ ...pdfFile, type: 'text/plain' }, {
      loadPdfLibrary: async () => { loaded = true },
    }),
    { name: 'CertificatePdfPreviewError', code: 'invalid-pdf-file' },
  )
  assert.equal(loaded, false)
})

test('reports invalid PDFs and rendering failures', async () => {
  const invalidPdf = createPdfHarness({ pdfError: new Error('not a PDF') })
  await assert.rejects(
    generateCertificatePdfPreview(pdfFile, invalidPdf),
    (error) => error instanceof CertificatePdfPreviewError && error.code === 'pdf-render-failed',
  )
  assert.equal(invalidPdf.events.some((event) => event[0] === 'loading-task-destroy'), true)

  const renderFailure = createPdfHarness({ renderError: new Error('render failed') })
  await assert.rejects(
    generateCertificatePdfPreview(pdfFile, renderFailure),
    (error) => error instanceof CertificatePdfPreviewError && error.code === 'pdf-render-failed',
  )
  assert.equal(renderFailure.events.some((event) => event[0] === 'document-destroy'), true)
})
