import {
  PORTFOLIO_ASSET_PURPOSES,
  validatePortfolioFile,
} from './portfolio-storage-core.js'

const MAX_PREVIEW_EDGE = 1800
const MAX_RENDER_SCALE = 2
const WEBP_QUALITY = 0.86

export class CertificatePdfPreviewError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'CertificatePdfPreviewError'
    this.code = code
  }
}

async function loadPdfJs() {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default
  return pdfjs
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(resolve, type, quality)
    } catch (error) {
      reject(error)
    }
  })
}

async function createPreviewBlob(canvas) {
  let webp
  try {
    webp = await canvasBlob(canvas, 'image/webp', WEBP_QUALITY)
  } catch {
    webp = null
  }
  if (webp?.type === 'image/webp' && webp.size > 0) return webp

  const png = await canvasBlob(canvas, 'image/png')
  if (png?.type === 'image/png' && png.size > 0) return png

  throw new CertificatePdfPreviewError(
    'preview-encoding-failed',
    'The browser could not encode the PDF preview as WebP or PNG.',
  )
}

async function release(resource, method) {
  if (typeof resource?.[method] !== 'function') return
  try {
    await resource[method]()
  } catch (error) {
    console.error(`PDF preview ${method} cleanup failed.`, error)
  }
}

export async function generateCertificatePdfPreview(
  file,
  {
    loadPdfLibrary = loadPdfJs,
    createCanvas = () => document.createElement('canvas'),
    createFile = (parts, name, options) => new File(parts, name, options),
  } = {},
) {
  try {
    validatePortfolioFile(file, PORTFOLIO_ASSET_PURPOSES.certificatePdf)
  } catch (error) {
    throw new CertificatePdfPreviewError(
      'invalid-pdf-file',
      error?.message || 'Choose a valid PDF certificate.',
      { cause: error },
    )
  }

  if (typeof file.arrayBuffer !== 'function') {
    throw new CertificatePdfPreviewError(
      'invalid-pdf-file',
      'The selected PDF could not be read by this browser.',
    )
  }

  let loadingTask
  let pdfDocument
  let canvas
  try {
    const pdfjs = await loadPdfLibrary()
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
    })
    pdfDocument = await loadingTask.promise
    if (!Number.isInteger(pdfDocument.numPages) || pdfDocument.numPages < 1) {
      throw new CertificatePdfPreviewError('empty-pdf', 'The selected PDF has no pages to preview.')
    }

    const page = await pdfDocument.getPage(1)
    const pageSize = page.getViewport({ scale: 1 })
    const longestEdge = Math.max(pageSize.width, pageSize.height)
    const scale = Math.min(MAX_RENDER_SCALE, MAX_PREVIEW_EDGE / longestEdge)
    const viewport = page.getViewport({ scale })
    canvas = createCanvas()
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) {
      throw new CertificatePdfPreviewError(
        'canvas-unavailable',
        'This browser could not create a canvas for the PDF preview.',
      )
    }

    await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise
    const blob = await createPreviewBlob(canvas)
    const extension = blob.type === 'image/webp' ? 'webp' : 'png'
    return createFile([blob], `certificate-preview.${extension}`, { type: blob.type })
  } catch (error) {
    if (error instanceof CertificatePdfPreviewError) throw error
    throw new CertificatePdfPreviewError(
      'pdf-render-failed',
      'The PDF could not be rendered. Choose another PDF or upload a preview image manually.',
      { cause: error },
    )
  } finally {
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    if (pdfDocument) {
      await release(pdfDocument, 'destroy')
    } else if (loadingTask) {
      await release(loadingTask, 'destroy')
    }
  }
}
