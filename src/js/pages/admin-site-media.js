import {
  cleanupUnreferencedSiteMedia,
  listAdminSiteMedia,
  removeAdminSiteMedia,
  saveAdminSiteMedia,
} from '../services/admin-site-media.js'
import {
  SITE_MEDIA_ITEMS,
  validateSiteMediaFile,
} from '../services/admin-site-media-core.js'
import { getPublicAssetUrl } from '../services/storage-urls.js'

function element(tagName, className = '', text = '') {
  const node = document.createElement(tagName)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function mediaCard(item) {
  const article = element('article', 'admin-site-media-card')
  article.setAttribute('aria-labelledby', `site-media-title-${item.key}`)

  const heading = element('div', 'admin-site-media-heading')
  const title = element('h3', '', item.label)
  title.id = `site-media-title-${item.key}`
  const status = element('span', 'admin-status-badge admin-status-unavailable', 'Not configured')
  status.setAttribute('aria-live', 'polite')
  heading.append(title, status)

  const description = element('p', 'admin-site-media-fallback', item.fallback)
  const preview = element('div', 'admin-site-media-preview')
  const path = element('p', 'admin-site-media-path')
  const controls = element('div', 'admin-site-media-controls')
  const fileLabel = element('label', 'form-label fw-semibold', `Upload or replace ${item.label}`)
  const fileInput = element('input', 'form-control')
  fileInput.type = 'file'
  fileInput.accept = item.accept
  fileInput.setAttribute('aria-describedby', `site-media-help-${item.key} site-media-error-${item.key}`)
  fileLabel.htmlFor = `site-media-file-${item.key}`
  fileInput.id = fileLabel.htmlFor
  const help = element('small', 'form-text text-body-secondary', item.help)
  help.id = `site-media-help-${item.key}`
  const error = element('p', 'admin-site-media-error text-danger')
  error.id = `site-media-error-${item.key}`
  error.setAttribute('role', 'alert')
  const selectedFile = element('small', 'admin-site-media-selected-file')

  const visibilityLabel = element('label', 'form-label mt-2', 'Visibility when saved')
  visibilityLabel.htmlFor = `site-media-visibility-${item.key}`
  const visibility = element('select', 'form-select')
  visibility.id = visibilityLabel.htmlFor
  visibility.setAttribute('aria-label', `${item.label} visibility when saved`)
  for (const [value, text] of [['false', 'Draft'], ['true', 'Published']]) {
    const option = element('option', '', text)
    option.value = value
    visibility.append(option)
  }

  const buttons = element('div', 'admin-site-media-actions')
  const saveButton = element('button', 'btn btn-primary', 'Save media')
  saveButton.type = 'button'
  const removeButton = element('button', 'btn btn-outline-danger', 'Remove media')
  removeButton.type = 'button'
  removeButton.disabled = true
  buttons.append(saveButton, removeButton)
  const feedback = element('p', 'admin-site-media-feedback')
  feedback.setAttribute('role', 'status')
  feedback.setAttribute('aria-live', 'polite')
  const cleanupAction = element('button', 'btn btn-outline-secondary btn-sm', 'Retry safe cleanup')
  cleanupAction.type = 'button'
  cleanupAction.hidden = true
  controls.append(
    fileLabel,
    fileInput,
    help,
    selectedFile,
    error,
    visibilityLabel,
    visibility,
    buttons,
    feedback,
    cleanupAction,
  )

  article.append(heading, description, preview, path, controls)
  return {
    article,
    status,
    preview,
    path,
    fileInput,
    selectedFile,
    error,
    visibility,
    saveButton,
    removeButton,
    feedback,
    cleanupAction,
    record: null,
    pendingCleanupPath: null,
    fileError: '',
    busy: false,
  }
}

function renderCurrentMedia(item, card) {
  card.preview.replaceChildren()
  card.path.textContent = ''
  card.removeButton.disabled = !card.record || card.busy
  if (!card.record || !card.record.value) {
    card.status.className = 'admin-status-badge admin-status-unavailable'
    card.status.textContent = 'Not configured'
    card.preview.append(element('p', 'mb-0 text-body-secondary', 'No file is attached.'))
    card.path.textContent = item.fallback
    return
  }

  card.status.className = `admin-status-badge ${card.record.is_public ? 'admin-status-published' : 'admin-status-draft'}`
  card.status.textContent = card.record.is_public ? 'Published' : 'Draft'
  const url = getPublicAssetUrl(card.record.value)
  if (!url) {
    card.preview.append(element('p', 'mb-0 text-body-secondary', 'The saved Storage path is invalid, so no preview is available.'))
  } else if (item.key === 'avatar_video_path') {
    const video = element('video', 'admin-site-media-video')
    video.controls = true
    video.playsInline = true
    video.preload = 'metadata'
    video.setAttribute('aria-label', 'Preview of the Home introduction video')
    video.src = url
    card.preview.append(video)
  } else if (item.key === 'cv_pdf_path') {
    const link = element('a', 'btn btn-outline-primary', 'Open current CV PDF')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    card.preview.append(link)
  } else {
    const image = element('img', 'admin-site-media-image')
    image.src = url
    image.alt = `Current ${item.label}`
    image.addEventListener('error', () => {
      image.replaceWith(element('p', 'mb-0 text-body-secondary', 'The current image could not be loaded.'))
    }, { once: true })
    card.preview.append(image)
  }
  card.path.textContent = `Storage path: ${card.record.value}`
}

export function mountAdminSiteMedia(root) {
  root.replaceChildren()
  const manager = element('div', 'admin-site-media-manager')
  const state = element('p', 'admin-site-media-state', 'Loading current media…')
  state.setAttribute('role', 'status')
  state.setAttribute('aria-live', 'polite')
  const retryLoad = element('button', 'btn btn-outline-primary btn-sm', 'Reload media')
  retryLoad.type = 'button'
  retryLoad.hidden = true
  const cards = new Map()

  for (const item of SITE_MEDIA_ITEMS) {
    const card = mediaCard(item)
    cards.set(item.key, card)
    manager.append(card.article)
  }
  manager.prepend(state)
  manager.append(retryLoad)
  root.append(manager)

  function isDirty(card) {
    const hasFile = Boolean(card.fileInput.files?.[0])
    return hasFile || Boolean(card.record && card.visibility.value !== String(card.record.is_public))
  }

  function refreshCard(item) {
    const card = cards.get(item.key)
    const targetIsPublic = card.visibility.value === 'true'
    const isCurrentlyPublic = Boolean(card.record?.is_public)
    card.saveButton.textContent = targetIsPublic
      ? (isCurrentlyPublic ? 'Save published media' : 'Publish media')
      : (isCurrentlyPublic ? 'Save as draft' : 'Save draft media')
    card.saveButton.disabled = card.busy || Boolean(card.fileError) || !isDirty(card)
    card.removeButton.disabled = card.busy || !card.record
    card.fileInput.disabled = card.busy
    card.visibility.disabled = card.busy
  }

  function setCardFeedback(card, message, kind = 'success') {
    card.feedback.textContent = message
    card.feedback.dataset.kind = kind
    card.feedback.hidden = !message
  }

  function setCleanupRecovery(card, path) {
    card.pendingCleanupPath = path
    card.cleanupAction.hidden = !path
  }

  function reportCleanup(card, cleanup, context) {
    if (!cleanup || cleanup.status === 'deleted') return
    const message = cleanup.status === 'shared'
      ? `${context} The file was kept because another record still references it.`
      : `${context} Cleanup could not be confirmed for ${cleanup.path}.`
    setCardFeedback(card, message, cleanup.status === 'shared' ? 'warning' : 'error')
    if (cleanup.status === 'failed' || cleanup.status === 'shared') {
      setCleanupRecovery(card, cleanup.path)
    }
  }

  async function load() {
    state.hidden = false
    state.dataset.kind = ''
    state.textContent = 'Loading current media…'
    retryLoad.hidden = true
    for (const card of cards.values()) card.article.hidden = true

    try {
      const records = await listAdminSiteMedia()
      for (const item of SITE_MEDIA_ITEMS) {
        const card = cards.get(item.key)
        card.record = records[item.key] ?? null
        card.fileInput.value = ''
        card.fileError = ''
        card.error.textContent = ''
        card.selectedFile.textContent = ''
        card.visibility.value = String(Boolean(card.record?.is_public))
        card.article.hidden = false
        renderCurrentMedia(item, card)
        refreshCard(item)
      }
      state.textContent = Object.keys(records).length
        ? 'Current media loaded. Draft media is not shown to public visitors.'
        : 'No media records are saved yet. Upload an item to add it; published biography records are not affected.'
    } catch (error) {
      console.error(error)
      state.dataset.kind = 'error'
      state.textContent = error?.message || 'Current media could not be loaded.'
      retryLoad.hidden = false
    }
  }

  async function saveItem(item) {
    const card = cards.get(item.key)
    const file = card.fileInput.files?.[0] ?? null
    card.error.textContent = ''
    card.fileError = ''
    if (file) {
      try {
        validateSiteMediaFile(item.key, file)
      } catch (error) {
        card.fileError = error.message
        card.error.textContent = error.message
        refreshCard(item)
        return
      }
    }

    card.busy = true
    setCardFeedback(card, 'Saving media…', 'info')
    refreshCard(item)
    try {
      const result = await saveAdminSiteMedia({
        key: item.key,
        file,
        is_public: card.visibility.value === 'true',
      })
      card.record = result.record
      card.fileInput.value = ''
      card.selectedFile.textContent = ''
      card.visibility.value = String(result.record.is_public)
      renderCurrentMedia(item, card)
      setCardFeedback(card, `Media saved as ${result.record.is_public ? 'Published' : 'Draft'}.`)
      reportCleanup(card, result.previousCleanup, 'The replacement was saved.')
    } catch (error) {
      console.error(error)
      card.error.textContent = error?.message || 'Media could not be saved.'
      if (error?.cleanup?.status === 'failed') setCleanupRecovery(card, error.cleanup.path)
      const cleanupMessage = error?.cleanup?.status === 'deleted'
        ? ' The unreferenced upload was cleaned up; the existing media remains unchanged.'
        : error?.cleanup?.status === 'shared'
          ? ' The uploaded file was kept because a database record references it.'
          : error?.cleanup?.status === 'failed'
            ? ` Cleanup could not be confirmed for ${error.cleanup.path}.`
            : error?.path
              ? ` Check the Storage path before retrying: ${error.path}.`
              : ''
      setCardFeedback(card, `${error?.message || 'Media could not be saved.'}${cleanupMessage}`, 'error')
    } finally {
      card.busy = false
      refreshCard(item)
    }
  }

  async function removeItem(item) {
    const card = cards.get(item.key)
    if (!card.record) return
    if (!window.confirm(`Remove ${item.label} from site content? The database reference will be removed before safe Storage cleanup.`)) {
      return
    }

    card.busy = true
    setCardFeedback(card, 'Removing media reference…', 'info')
    refreshCard(item)
    try {
      const result = await removeAdminSiteMedia(item.key)
      if (result.removed) {
        card.record = null
        card.fileInput.value = ''
        card.selectedFile.textContent = ''
        card.visibility.value = 'false'
        renderCurrentMedia(item, card)
        setCardFeedback(card, 'The media reference was removed.')
        reportCleanup(card, result.cleanup, 'The site content reference was removed.')
      } else {
        setCardFeedback(card, 'No media reference was found to remove.')
      }
    } catch (error) {
      console.error(error)
      setCardFeedback(card, error?.message || 'The media reference could not be removed.', 'error')
    } finally {
      card.busy = false
      refreshCard(item)
    }
  }

  async function retryCleanup(item) {
    const card = cards.get(item.key)
    if (!card.pendingCleanupPath) return
    card.cleanupAction.disabled = true
    setCardFeedback(card, 'Checking references and retrying safe cleanup…', 'info')
    try {
      const result = await cleanupUnreferencedSiteMedia(card.pendingCleanupPath)
      if (result.status === 'deleted') {
        setCleanupRecovery(card, null)
        setCardFeedback(card, 'The unreferenced file was deleted successfully.')
      } else {
        reportCleanup(card, result, 'The file was retained.')
      }
    } catch (error) {
      console.error(error)
      setCardFeedback(card, error?.message || 'Cleanup could not be retried.', 'error')
    } finally {
      card.cleanupAction.disabled = false
    }
  }

  for (const item of SITE_MEDIA_ITEMS) {
    const card = cards.get(item.key)
    card.fileInput.addEventListener('change', () => {
      const file = card.fileInput.files?.[0] ?? null
      card.error.textContent = ''
      card.fileError = ''
      if (!file) {
        card.selectedFile.textContent = ''
      } else {
        try {
          validateSiteMediaFile(item.key, file)
          card.selectedFile.textContent = `Selected: ${file.name}`
        } catch (error) {
          card.fileError = error.message
          card.error.textContent = error.message
          card.selectedFile.textContent = ''
        }
      }
      refreshCard(item)
    })
    card.visibility.addEventListener('change', () => refreshCard(item))
    card.saveButton.addEventListener('click', () => { void saveItem(item) })
    card.removeButton.addEventListener('click', () => { void removeItem(item) })
    card.cleanupAction.addEventListener('click', () => { void retryCleanup(item) })
  }

  retryLoad.addEventListener('click', () => { void load() })
  void load()
  return Object.freeze({ reload: load })
}
