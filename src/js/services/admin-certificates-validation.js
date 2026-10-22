import { safeHttpUrl } from '../utils/safe-url.js'
import {
  PORTFOLIO_ASSET_PURPOSES,
  validatePortfolioFile,
} from './portfolio-storage-core.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export class CertificateValidationError extends Error {
  constructor(code, message, field = null) {
    super(message)
    this.name = 'CertificateValidationError'
    this.code = code
    this.field = field
  }
}

function certificatePath(path, extensionPattern, field, label) {
  if (path === null || path === undefined || path === '') return null
  if (
    typeof path !== 'string'
    || path.trim() !== path
    || !path.startsWith('certificates/')
    || path.startsWith('/')
    || path.includes('\\')
    || /[?#\u0000-\u001f]/.test(path)
    || !path.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
    || !extensionPattern.test(path)
  ) {
    throw new CertificateValidationError('invalid-asset-path', `The existing ${label} path is invalid.`, field)
  }

  return path
}

export function validateCertificateForm(
  values,
  {
    pdfPath = null,
    previewImagePath = null,
    hasPdfUpload = false,
    publish = false,
  } = {},
) {
  const title = typeof values?.title === 'string' ? values.title.trim() : ''
  if (!title) {
    throw new CertificateValidationError('title-required', 'Enter a certificate title.', 'title')
  }

  const issuerValue = typeof values?.issuer === 'string' ? values.issuer.trim() : ''
  let issueDateValue = typeof values?.issueDate === 'string' ? values.issueDate.trim() : ''
  // A month picker yields YYYY-MM; store it as the first day of that month.
  if (/^\d{4}-\d{2}$/.test(issueDateValue)) issueDateValue = `${issueDateValue}-01`
  let issueDate = null
  if (issueDateValue) {
    const parsedDate = new Date(`${issueDateValue}T00:00:00.000Z`)
    if (
      !DATE_PATTERN.test(issueDateValue)
      || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== issueDateValue
    ) {
      throw new CertificateValidationError('invalid-issue-date', 'Enter a valid issue date.', 'issueDate')
    }
    issueDate = issueDateValue
  }

  const credentialValue = typeof values?.credentialUrl === 'string' ? values.credentialUrl.trim() : ''
  const credentialUrl = credentialValue ? safeHttpUrl(credentialValue) : null
  if (credentialValue && !credentialUrl) {
    throw new CertificateValidationError(
      'invalid-credential-url',
      'Enter a valid HTTP or HTTPS credential URL.',
      'credentialUrl',
    )
  }

  const orderValue = values?.sortOrder === '' || values?.sortOrder === undefined
    ? 0
    : Number(values?.sortOrder)
  if (!Number.isSafeInteger(orderValue) || orderValue < 0) {
    throw new CertificateValidationError(
      'invalid-sort-order',
      'Display order must be a non-negative whole number.',
      'sortOrder',
    )
  }

  const safePdfPath = certificatePath(pdfPath, /\.pdf$/i, 'pdfFile', 'PDF')
  const safePreviewPath = certificatePath(
    previewImagePath,
    /\.(?:jpe?g|png|webp)$/i,
    'previewFile',
    'preview image',
  )

  if (publish && !hasPdfUpload && !safePdfPath && !credentialUrl) {
    throw new CertificateValidationError(
      'publication-requires-certificate',
      'To publish, attach a valid PDF or provide an official credential URL.',
      'pdfFile',
    )
  }

  return Object.freeze({
    title,
    issuer: issuerValue || null,
    issue_date: issueDate,
    credential_url: credentialUrl,
    sort_order: orderValue,
    pdf_path: safePdfPath,
    preview_image_path: safePreviewPath,
  })
}

export function validateCertificateFiles(pdfFile, previewFile) {
  if (pdfFile) {
    validatePortfolioFile(pdfFile, PORTFOLIO_ASSET_PURPOSES.certificatePdf)
  }
  if (previewFile) {
    validatePortfolioFile(previewFile, PORTFOLIO_ASSET_PURPOSES.certificatePreview)
  }
}
