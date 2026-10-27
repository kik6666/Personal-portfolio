import { resolveProjectVideoSource } from './project-video.js'

function element(documentRef, tag, className, text) {
  const node = documentRef.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function createProjectVideoModalController({
  modalElement,
  mediaContainer,
  titleElement,
  errorElement,
  fallbackLink,
  modal,
  resolveAssetUrl,
  documentRef = globalThis.document,
} = {}) {
  if (
    !modalElement
    || !mediaContainer
    || !titleElement
    || !errorElement
    || !fallbackLink
    || !modal
    || typeof modal.show !== 'function'
    || typeof resolveAssetUrl !== 'function'
    || !documentRef
  ) {
    throw new TypeError('The project video modal requires its elements, Bootstrap modal, and asset resolver.')
  }

  let activeMedia = null
  let activeTrigger = null

  function clearMedia() {
    if (activeMedia?.tagName === 'VIDEO') {
      activeMedia.pause()
      activeMedia.removeAttribute('src')
      activeMedia.removeAttribute('poster')
      activeMedia.load()
    }
    activeMedia = null
    mediaContainer.replaceChildren()
    errorElement.hidden = true
    errorElement.textContent = ''
    fallbackLink.hidden = true
    fallbackLink.removeAttribute('href')
    fallbackLink.textContent = ''
  }

  function showUnavailableMessage() {
    errorElement.textContent = 'This video is currently unavailable. Try again later.'
    errorElement.hidden = false
  }

  function open(project, trigger) {
    const source = resolveProjectVideoSource(project, resolveAssetUrl)
    if (!source) return false

    clearMedia()
    activeTrigger = trigger ?? null
    const projectTitle = typeof project.title === 'string' && project.title.trim()
      ? project.title.trim()
      : 'Project'
    titleElement.textContent = `${projectTitle} video`

    if (source.kind === 'mp4') {
      const video = element(documentRef, 'video', 'project-video-native')
      video.controls = true
      video.playsInline = true
      video.preload = 'none'
      video.setAttribute('playsinline', '')
      video.setAttribute('aria-label', `${projectTitle} video`)
      if (source.posterUrl) video.poster = source.posterUrl
      video.addEventListener('error', showUnavailableMessage)
      video.src = source.url
      mediaContainer.append(video)
      activeMedia = video
    } else {
      const iframe = element(documentRef, 'iframe', 'project-video-embed')
      iframe.title = `${projectTitle} video`
      iframe.loading = 'lazy'
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'
      iframe.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen')
      iframe.setAttribute('allowfullscreen', '')
      iframe.src = source.embedUrl
      mediaContainer.append(iframe)
      activeMedia = iframe

      const provider = new URL(source.externalUrl).hostname.includes('vimeo')
        ? 'Vimeo'
        : 'YouTube'
      fallbackLink.href = source.externalUrl
      fallbackLink.textContent = `Open on ${provider}`
      fallbackLink.hidden = false
    }

    modal.show(trigger)
    return true
  }

  function handleHide() {
    clearMedia()
  }

  function handleHidden() {
    const trigger = activeTrigger
    activeTrigger = null
    if (trigger && trigger.isConnected !== false && typeof trigger.focus === 'function') {
      trigger.focus()
    }
  }

  modalElement.addEventListener('hide.bs.modal', handleHide)
  modalElement.addEventListener('hidden.bs.modal', handleHidden)

  return Object.freeze({
    open,
    dispose() {
      modalElement.removeEventListener('hide.bs.modal', handleHide)
      modalElement.removeEventListener('hidden.bs.modal', handleHidden)
      clearMedia()
      modal.dispose?.()
    },
  })
}

export function mountProjectVideoModal(root, {
  ModalClass,
  resolveAssetUrl,
  documentRef = globalThis.document,
} = {}) {
  if (
    !root
    || typeof ModalClass?.getOrCreateInstance !== 'function'
    || typeof resolveAssetUrl !== 'function'
    || !documentRef
  ) {
    throw new TypeError('Mounting the project video modal requires a root, Bootstrap Modal, and asset resolver.')
  }

  const modalElement = element(documentRef, 'div', 'modal fade project-video-modal')
  modalElement.id = 'project-video-modal'
  modalElement.tabIndex = -1
  modalElement.setAttribute('role', 'dialog')
  modalElement.setAttribute('aria-modal', 'true')
  modalElement.setAttribute('aria-labelledby', 'project-video-modal-title')
  modalElement.setAttribute('aria-describedby', 'project-video-modal-description')
  modalElement.setAttribute('aria-hidden', 'true')

  const dialog = element(documentRef, 'div', 'modal-dialog modal-dialog-centered modal-xl modal-fullscreen-sm-down')
  const content = element(documentRef, 'div', 'modal-content')
  const header = element(documentRef, 'div', 'modal-header')
  const title = element(documentRef, 'h2', 'modal-title fs-5', 'Project video')
  title.id = 'project-video-modal-title'
  const closeButton = element(documentRef, 'button', 'btn-close')
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', 'Close video player')
  const body = element(documentRef, 'div', 'modal-body')
  const description = element(
    documentRef,
    'p',
    'visually-hidden',
    'Video playback controls are available in the player. Close this dialog to stop playback.',
  )
  description.id = 'project-video-modal-description'
  const mediaContainer = element(documentRef, 'div', 'ratio ratio-16x9 project-video-player')
  const error = element(documentRef, 'p', 'project-video-error')
  error.setAttribute('role', 'alert')
  error.hidden = true
  const fallbackLink = element(documentRef, 'a', 'project-video-fallback')
  fallbackLink.target = '_blank'
  fallbackLink.rel = 'noopener noreferrer'
  fallbackLink.hidden = true

  header.append(title, closeButton)
  body.append(description, mediaContainer, error, fallbackLink)
  content.append(header, body)
  dialog.append(content)
  modalElement.append(dialog)
  root.replaceChildren(modalElement)

  const modal = ModalClass.getOrCreateInstance(modalElement, {
    backdrop: true,
    focus: true,
    keyboard: true,
  })
  const controller = createProjectVideoModalController({
    modalElement,
    mediaContainer,
    titleElement: title,
    errorElement: error,
    fallbackLink,
    modal,
    resolveAssetUrl,
    documentRef,
  })
  const close = () => modal.hide()
  closeButton.addEventListener('click', close)

  return Object.freeze({
    open: controller.open,
    dispose() {
      closeButton.removeEventListener('click', close)
      controller.dispose()
      modalElement.remove()
    },
  })
}
