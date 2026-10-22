import { safeHttpUrl } from '../utils/safe-url.js'
import { getPublicAssetUrl } from '../services/storage-urls.js'

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(action, label, className = 'btn btn-outline-primary btn-sm') {
  const node = element('button', className, label)
  node.type = 'button'
  node.dataset.action = action
  return node
}

function assetLink(path, label) {
  const url = safeHttpUrl(getPublicAssetUrl(path))
  if (!url) return element('span', 'admin-certificate-asset-missing', `${label} attached`)

  const link = element('a', 'admin-certificate-asset-link', `View ${label}`)
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  return link
}

function currentAssets(certificate) {
  const container = document.querySelector('#admin-certificate-current-assets')
  container.replaceChildren()

  if (certificate?.pdf_path) container.append(assetLink(certificate.pdf_path, 'current PDF'))
  if (certificate?.preview_image_path) {
    container.append(assetLink(certificate.preview_image_path, 'current preview'))
  }

  if (container.childElementCount === 0) {
    container.append(element('span', 'admin-certificate-asset-missing', 'No files currently attached.'))
  }
}

export function renderAdminCertificateManager(root) {
  root.innerHTML = `
    <div class="admin-certificate-manager">
      <div class="admin-certificate-toolbar">
        <p>Manage draft and published certificates. Changes are protected by Supabase administrator policies.</p>
        <button id="admin-certificate-add" class="btn btn-primary" type="button">
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
          Add Certificate
        </button>
      </div>

      <div id="admin-certificate-feedback" class="admin-cert-feedback" role="status" aria-live="polite" hidden></div>
      <section id="admin-certificate-recovery" class="admin-cert-recovery" aria-labelledby="admin-certificate-recovery-title" hidden>
        <div>
          <h3 id="admin-certificate-recovery-title">File cleanup needs attention</h3>
          <p>These files could not be confirmed as removed. Retry cleanup after checking the certificate list.</p>
          <ul id="admin-certificate-recovery-paths"></ul>
        </div>
        <button id="admin-certificate-retry-cleanup" class="btn btn-outline-primary btn-sm" type="button">Retry cleanup</button>
      </section>

      <form id="admin-certificate-form" class="admin-certificate-form" hidden novalidate>
        <div class="admin-certificate-form-heading">
          <div>
            <p class="eyebrow">Certificate details</p>
            <h3 id="admin-certificate-form-title">Add Certificate</h3>
          </div>
          <button id="admin-certificate-cancel" class="btn btn-outline-secondary btn-sm" type="button">Cancel</button>
        </div>

        <div class="admin-certificate-fields">
          <div class="admin-certificate-field admin-certificate-field-wide">
            <label for="admin-certificate-title">Title <span aria-hidden="true">*</span></label>
            <input id="admin-certificate-title" name="title" class="form-control" type="text" required maxlength="250" autocomplete="off" />
          </div>
          <div class="admin-certificate-field">
            <label for="admin-certificate-issuer">Issuer</label>
            <input id="admin-certificate-issuer" name="issuer" class="form-control" type="text" maxlength="250" autocomplete="organization" />
          </div>
          <div class="admin-certificate-field">
            <label for="admin-certificate-date">Issue date</label>
            <input id="admin-certificate-date" name="issueDate" class="form-control" type="date" />
          </div>
          <div class="admin-certificate-field admin-certificate-field-wide">
            <label for="admin-certificate-credential-url">Official credential URL</label>
            <input id="admin-certificate-credential-url" name="credentialUrl" class="form-control" type="url" inputmode="url" autocomplete="url" />
            <small>Use the issuer's verification or credential page. HTTP and HTTPS links are accepted.</small>
          </div>
          <div class="admin-certificate-field">
            <label for="admin-certificate-order">Display order</label>
            <input id="admin-certificate-order" name="sortOrder" class="form-control" type="number" min="0" step="1" value="0" />
          </div>
          <div class="admin-certificate-field">
            <label for="admin-certificate-pdf">Certificate PDF</label>
            <input id="admin-certificate-pdf" name="pdfFile" class="form-control" type="file" accept="application/pdf,.pdf" />
            <small>Optional for drafts. Maximum 50 MiB. A selected file replaces the current PDF.</small>
          </div>
          <div class="admin-certificate-field admin-certificate-field-wide">
            <label for="admin-certificate-preview">Preview image <span class="text-muted">(optional)</span></label>
            <input id="admin-certificate-preview" name="previewFile" class="form-control" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" />
            <small>JPEG, PNG, or WebP; maximum 50 MiB. A selected image replaces the current preview.</small>
          </div>
          <div class="admin-certificate-field admin-certificate-field-wide">
            <span class="admin-certificate-label">Current files</span>
            <div id="admin-certificate-current-assets" class="admin-certificate-current-assets"></div>
          </div>
        </div>

        <div id="admin-certificate-form-error" class="admin-cert-feedback admin-cert-feedback-error" role="alert" hidden></div>
        <div class="admin-certificate-form-actions">
          <button class="btn btn-outline-primary" type="submit" data-publish="false">Save as Draft</button>
          <button class="btn btn-primary" type="submit" data-publish="true">Publish</button>
        </div>
      </form>

      <div id="admin-certificate-list-state" class="admin-certificate-list-state" role="status" aria-live="polite">
        Loading certificates…
      </div>
      <div id="admin-certificate-list" class="admin-certificate-list"></div>
    </div>
  `

  document.querySelector('#admin-certificate-add').addEventListener('click', () => {
    showAdminCertificateForm(null)
  })
  document.querySelector('#admin-certificate-cancel').addEventListener('click', hideAdminCertificateForm)
}

export function showAdminCertificateForm(certificate) {
  const form = document.querySelector('#admin-certificate-form')
  form.reset()
  form.dataset.certificateId = certificate?.id ?? ''
  document.querySelector('#admin-certificate-form-title').textContent = certificate
    ? 'Edit Certificate'
    : 'Add Certificate'
  document.querySelector('#admin-certificate-title').value = certificate?.title ?? ''
  document.querySelector('#admin-certificate-issuer').value = certificate?.issuer ?? ''
  document.querySelector('#admin-certificate-date').value = certificate?.issue_date ?? ''
  document.querySelector('#admin-certificate-credential-url').value = certificate?.credential_url ?? ''
  document.querySelector('#admin-certificate-order').value = String(certificate?.sort_order ?? 0)
  document.querySelector('#admin-certificate-form-error').hidden = true
  currentAssets(certificate)
  form.hidden = false
  document.querySelector('#admin-certificate-title').focus()
}

export function hideAdminCertificateForm() {
  const form = document.querySelector('#admin-certificate-form')
  form.hidden = true
  form.reset()
  form.dataset.certificateId = ''
}

export function showAdminCertificateFormError(message, field = null) {
  const error = document.querySelector('#admin-certificate-form-error')
  error.textContent = message
  error.hidden = false
  const fields = {
    title: '#admin-certificate-title',
    issueDate: '#admin-certificate-date',
    credentialUrl: '#admin-certificate-credential-url',
    sortOrder: '#admin-certificate-order',
    pdfFile: '#admin-certificate-pdf',
    previewFile: '#admin-certificate-preview',
  }
  if (field) document.querySelector(fields[field])?.focus()
}

export function setAdminCertificateFeedback(message, kind = 'success') {
  const feedback = document.querySelector('#admin-certificate-feedback')
  feedback.textContent = message
  feedback.dataset.kind = kind
  feedback.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  feedback.hidden = !message
}

export function setAdminCertificateListState(message, { hidden = false, error = false } = {}) {
  const state = document.querySelector('#admin-certificate-list-state')
  state.textContent = message
  state.dataset.kind = error ? 'error' : ''
  state.hidden = hidden
}

export function renderAdminCertificates(certificates, handlers) {
  const container = document.querySelector('#admin-certificate-list')
  container.replaceChildren()

  if (certificates.length === 0) {
    container.append(element('p', 'admin-certificate-empty', 'No certificates yet. Add one to create your first draft.'))
    return
  }

  for (const certificate of certificates) {
    const row = element('article', 'admin-certificate-row')
    const details = element('div', 'admin-certificate-details')
    const heading = element('div', 'admin-certificate-row-heading')
    heading.append(
      element('h3', '', certificate.title || 'Untitled certificate'),
      element(
        'span',
        `admin-certificate-status ${certificate.is_published ? 'is-published' : 'is-draft'}`,
        certificate.is_published ? 'Published' : 'Draft',
      ),
    )
    details.append(heading)

    const metadata = [
      certificate.issuer,
      certificate.issue_date
        ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date(`${certificate.issue_date}T00:00:00.000Z`),
        )
        : null,
      `Order ${certificate.sort_order ?? 0}`,
    ].filter(Boolean)
    details.append(element('p', 'admin-certificate-metadata', metadata.join(' · ')))

    const fileStatus = [
      certificate.pdf_path ? 'PDF attached' : 'No PDF',
      certificate.preview_image_path ? 'Preview attached' : 'No preview',
      certificate.credential_url ? 'Credential URL set' : null,
    ].filter(Boolean)
    details.append(element('p', 'admin-certificate-metadata', fileStatus.join(' · ')))

    const actions = element('div', 'admin-certificate-actions')
    const edit = button('edit', 'Edit')
    const toggle = button(
      'toggle-publish',
      certificate.is_published ? 'Unpublish' : 'Publish',
      certificate.is_published ? 'btn btn-outline-secondary btn-sm' : 'btn btn-outline-primary btn-sm',
    )
    const remove = button('delete', 'Delete', 'btn btn-outline-danger btn-sm')
    for (const control of [edit, toggle, remove]) {
      control.dataset.certificateId = certificate.id
      control.addEventListener('click', (event) => handlers.onAction(event, certificate))
    }
    actions.append(edit, toggle, remove)
    row.append(details, actions)
    container.append(row)
  }
}

export function renderAdminCertificateRecovery(paths, onRetry) {
  const section = document.querySelector('#admin-certificate-recovery')
  const list = document.querySelector('#admin-certificate-recovery-paths')
  list.replaceChildren(...paths.map((path) => element('li', '', path)))
  section.hidden = paths.length === 0
  const button = document.querySelector('#admin-certificate-retry-cleanup')
  button.onclick = onRetry
}
