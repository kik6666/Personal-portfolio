import {
  deleteAdminCertificate,
  listAdminCertificates,
  retryAdminCertificateCleanup,
  saveAdminCertificate,
  setAdminCertificatePublished,
} from '../services/admin-certificates.js'
import { CertificateValidationError } from '../services/admin-certificates-validation.js'
import {
  hideAdminCertificateForm,
  renderAdminCertificateManager,
  renderAdminCertificateRecovery,
  renderAdminCertificates,
  setAdminCertificateFeedback,
  setAdminCertificateListState,
  showAdminCertificateForm,
  showAdminCertificateFormError,
} from './admin-certificates-view.js'

export function mountAdminCertificates(root) {
  renderAdminCertificateManager(root)
  let certificates = []
  let pendingCleanupPaths = []
  const form = document.querySelector('#admin-certificate-form')
  const list = document.querySelector('#admin-certificate-list')

  function addPendingCleanup(paths) {
    pendingCleanupPaths = [...new Set([...pendingCleanupPaths, ...paths])]
    renderAdminCertificateRecovery(pendingCleanupPaths, retryCleanup)
  }

  function applyCleanupResult(cleanup) {
    if (!cleanup) return []
    addPendingCleanup(cleanup.failed.map((entry) => entry.path))
    return cleanup.shared
  }

  function reportCleanup(cleanup, successMessage) {
    const shared = applyCleanupResult(cleanup)
    const failedCount = cleanup?.failed.length ?? 0
    const sharedMessage = shared.length
      ? ' Shared files were kept because another certificate still references them.'
      : ''
    const failedMessage = failedCount
      ? ' Some files need cleanup; use the retry control below.'
      : ''
    setAdminCertificateFeedback(`${successMessage}${sharedMessage}${failedMessage}`)
  }

  async function loadCertificates() {
    setAdminCertificateListState('Loading certificates…')
    list.replaceChildren()
    try {
      certificates = await listAdminCertificates()
      setAdminCertificateListState('', { hidden: true })
      renderAdminCertificates(certificates, { onAction: handleRowAction })
    } catch (error) {
      console.error(error)
      setAdminCertificateListState(
        error?.message || 'Certificates could not be loaded. Check your session and try again.',
        { error: true },
      )
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'btn btn-outline-primary btn-sm ms-2'
      retry.textContent = 'Retry'
      retry.addEventListener('click', loadCertificates)
      document.querySelector('#admin-certificate-list-state').append(retry)
    }
  }

  async function retryCleanup() {
    const paths = [...pendingCleanupPaths]
    if (!paths.length) return

    const retryButton = document.querySelector('#admin-certificate-retry-cleanup')
    retryButton.disabled = true
    try {
      const cleanup = await retryAdminCertificateCleanup(paths)
      pendingCleanupPaths = cleanup.failed.map((entry) => entry.path)
      renderAdminCertificateRecovery(pendingCleanupPaths, retryCleanup)
      const message = pendingCleanupPaths.length
        ? 'Some files still could not be cleaned up. Keep this dashboard open and retry later.'
        : `File cleanup retry finished; ${cleanup.deleted.length} file(s) removed.`
      setAdminCertificateFeedback(message, pendingCleanupPaths.length ? 'error' : 'success')
    } catch (error) {
      console.error(error)
      setAdminCertificateFeedback(error?.message || 'File cleanup could not be retried.', 'error')
    } finally {
      const button = document.querySelector('#admin-certificate-retry-cleanup')
      if (button) button.disabled = false
    }
  }

  async function handleRowAction(event, certificate) {
    const actionButton = event.currentTarget
    const action = actionButton.dataset.action
    setAdminCertificateFeedback('')

    if (action === 'edit') {
      showAdminCertificateForm(certificate)
      return
    }

    if (action === 'delete') {
      const confirmed = window.confirm(
        `Delete “${certificate.title}”? This removes the certificate record and cannot be undone.`,
      )
      if (!confirmed) return

      actionButton.disabled = true
      try {
        const result = await deleteAdminCertificate(certificate.id)
        reportCleanup(result.cleanup, 'Certificate deleted.')
        await loadCertificates()
      } catch (error) {
        console.error(error)
        if (error?.recoveryPaths?.length) addPendingCleanup(error.recoveryPaths)
        const cleanup = error?.cleanup
        const sharedMessage = cleanup?.shared?.length
          ? ' Files still referenced by a certificate were kept.'
          : ''
        setAdminCertificateFeedback(
          `${error?.message || 'Certificate deletion failed.'}${sharedMessage}`,
          'error',
        )
        if (error?.databaseOutcomeUnknown) await loadCertificates()
      } finally {
        actionButton.disabled = false
      }
      return
    }

    if (action === 'toggle-publish') {
      const publish = !certificate.is_published
      actionButton.disabled = true
      try {
        await setAdminCertificatePublished(certificate.id, publish)
        setAdminCertificateFeedback(publish ? 'Certificate published.' : 'Certificate unpublished.')
        await loadCertificates()
      } catch (error) {
        console.error(error)
        showOperationError(error)
        if (error?.databaseOutcomeUnknown) await loadCertificates()
      } finally {
        actionButton.disabled = false
      }
    }
  }

  function showOperationError(error) {
    if (error?.recoveryPaths?.length) addPendingCleanup(error.recoveryPaths)
    if (error instanceof CertificateValidationError) {
      if (!form.hidden) showAdminCertificateFormError(error.message, error.field)
      setAdminCertificateFeedback(error.message, 'error')
      return
    }
    const sharedMessage = error?.cleanup?.shared?.length
      ? ' Files still referenced by a certificate were kept.'
      : ''
    const unknownMessage = error?.databaseOutcomeUnknown
      ? ' Reloading the certificate list to verify the result.'
      : ''
    setAdminCertificateFeedback(
      `${error?.message || 'The operation failed.'}${sharedMessage}${unknownMessage}`,
      'error',
    )
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const submitter = event.submitter
    const publish = submitter?.dataset.publish === 'true'
    const formData = new FormData(form)
    const id = form.dataset.certificateId || null
    const values = {
      title: formData.get('title'),
      issuer: formData.get('issuer'),
      issueDate: formData.get('issueDate'),
      credentialUrl: formData.get('credentialUrl'),
      sortOrder: formData.get('sortOrder'),
    }
    const pdfFile = formData.get('pdfFile')
    const previewFile = formData.get('previewFile')
    const files = form.querySelectorAll('button[type="submit"]')
    files.forEach((button) => { button.disabled = true })
    setAdminCertificateFeedback('')
    document.querySelector('#admin-certificate-form-error').hidden = true

    try {
      const result = await saveAdminCertificate({
        id,
        values,
        pdfFile: pdfFile instanceof File && pdfFile.size > 0 ? pdfFile : null,
        previewFile: previewFile instanceof File && previewFile.size > 0 ? previewFile : null,
        publish,
      })
      hideAdminCertificateForm()
      reportCleanup(
        result.cleanup,
        publish ? 'Certificate published.' : 'Certificate saved as a draft.',
      )
      await loadCertificates()
    } catch (error) {
      console.error(error)
      showOperationError(error)
      if (error?.databaseOutcomeUnknown) await loadCertificates()
    } finally {
      files.forEach((button) => { button.disabled = false })
    }
  })

  loadCertificates()
}
