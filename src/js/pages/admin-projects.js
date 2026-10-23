import {
  deleteAdminProject,
  listAdminProjects,
  retryAdminProjectCleanup,
  saveAdminProject,
  setAdminProjectPublished,
} from '../services/admin-projects.js'
import {
  ProjectValidationError,
  suggestProjectSlug,
  validateProjectPreviewFile,
} from '../services/admin-projects-validation.js'
import {
  hideAdminProjectForm,
  renderAdminProjectManager,
  renderAdminProjectRecovery,
  renderAdminProjects,
  setAdminProjectFeedback,
  setAdminProjectListState,
  setAdminProjectSelectedPreview,
  showAdminProjectForm,
  showAdminProjectFormError,
} from './admin-projects-view.js'

export function mountAdminProjects(root) {
  renderAdminProjectManager(root)
  let projects = []
  let pendingCleanupPaths = []
  let previewObjectUrl = null
  const form = document.querySelector('#admin-project-form')
  const list = document.querySelector('#admin-project-list')
  const titleInput = document.querySelector('#admin-project-title')
  const slugInput = document.querySelector('#admin-project-slug')
  const previewInput = document.querySelector('#admin-project-preview-file')
  const submitButtons = form.querySelectorAll('button[type="submit"]')
  let isSaving = false

  function clearSelectedPreview() {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
    previewObjectUrl = null
    setAdminProjectSelectedPreview(null)
  }

  window.addEventListener('pagehide', clearSelectedPreview, { once: true })

  titleInput.addEventListener('input', () => {
    if (slugInput.dataset.auto === 'true') {
      slugInput.value = suggestProjectSlug(titleInput.value)
    }
  })
  slugInput.addEventListener('input', () => {
    slugInput.dataset.auto = 'false'
  })
  previewInput.addEventListener('change', () => {
    clearSelectedPreview()
    const file = previewInput.files?.[0]
    if (!file) return
    try {
      validateProjectPreviewFile(file)
    } catch (error) {
      previewInput.value = ''
      showAdminProjectFormError(error.message, 'previewFile')
      return
    }
    previewObjectUrl = URL.createObjectURL(file)
    setAdminProjectSelectedPreview(previewObjectUrl)
  })
  form.addEventListener('reset', clearSelectedPreview)

  function addPendingCleanup(paths) {
    pendingCleanupPaths = [...new Set([...pendingCleanupPaths, ...paths])]
    renderAdminProjectRecovery(pendingCleanupPaths, retryCleanup)
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
      ? ' Shared images were kept because a project still references them.'
      : ''
    const failedMessage = failedCount
      ? ' Some images need cleanup; use the retry control below.'
      : ''
    setAdminProjectFeedback(`${successMessage}${sharedMessage}${failedMessage}`)
  }

  async function loadProjects() {
    setAdminProjectListState('Loading projects…')
    list.replaceChildren()
    try {
      projects = await listAdminProjects()
      setAdminProjectListState('', { hidden: true })
      renderAdminProjects(projects, { onAction: handleRowAction })
    } catch (error) {
      console.error(error)
      setAdminProjectListState(
        error?.message || 'Projects could not be loaded. Check your session and try again.',
        { error: true },
      )
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'btn btn-outline-primary btn-sm ms-2'
      retry.textContent = 'Retry'
      retry.addEventListener('click', loadProjects)
      document.querySelector('#admin-project-list-state').append(retry)
    }
  }

  async function retryCleanup() {
    const paths = [...pendingCleanupPaths]
    if (!paths.length) return

    const retryButton = document.querySelector('#admin-project-retry-cleanup')
    retryButton.disabled = true
    try {
      const cleanup = await retryAdminProjectCleanup(paths)
      pendingCleanupPaths = cleanup.failed.map((entry) => entry.path)
      renderAdminProjectRecovery(pendingCleanupPaths, retryCleanup)
      setAdminProjectFeedback(
        pendingCleanupPaths.length
          ? 'Some images still could not be cleaned up. Retry after checking the project list.'
          : `Image cleanup retry finished; ${cleanup.deleted.length} file(s) removed.`,
        pendingCleanupPaths.length ? 'error' : 'success',
      )
    } catch (error) {
      console.error(error)
      setAdminProjectFeedback(error?.message || 'Image cleanup could not be retried.', 'error')
    } finally {
      const button = document.querySelector('#admin-project-retry-cleanup')
      if (button) button.disabled = false
    }
  }

  function showOperationError(error) {
    if (error?.recoveryPaths?.length) addPendingCleanup(error.recoveryPaths)
    if (error instanceof ProjectValidationError) {
      if (!form.hidden) showAdminProjectFormError(error.message, error.field)
      setAdminProjectFeedback(error.message, 'error')
      return
    }
    const sharedMessage = error?.cleanup?.shared?.length
      ? ' Images still referenced by a project were kept.'
      : ''
    const unknownMessage = error?.databaseOutcomeUnknown
      ? ' Reloading the project list to verify the result.'
      : ''
    setAdminProjectFeedback(
      `${error?.message || 'The operation failed.'}${sharedMessage}${unknownMessage}`,
      'error',
    )
    if (error?.code === 'duplicate-slug') {
      showAdminProjectFormError(error.message, 'slug')
    }
  }

  async function handleRowAction(event, project) {
    const actionButton = event.currentTarget
    const action = actionButton.dataset.action
    setAdminProjectFeedback('')

    if (action === 'edit') {
      showAdminProjectForm(project)
      return
    }

    if (action === 'delete') {
      if (!window.confirm(`Delete “${project.title}”? This removes the project record and cannot be undone.`)) {
        return
      }
      actionButton.disabled = true
      try {
        const result = await deleteAdminProject(project.id)
        reportCleanup(result.cleanup, 'Project deleted.')
        await loadProjects()
      } catch (error) {
        console.error(error)
        showOperationError(error)
        if (error?.databaseOutcomeUnknown) await loadProjects()
      } finally {
        actionButton.disabled = false
      }
      return
    }

    if (action === 'toggle-publish') {
      const publish = !project.is_published
      actionButton.disabled = true
      try {
        await setAdminProjectPublished(project.id, publish)
        setAdminProjectFeedback(publish ? 'Project published.' : 'Project unpublished.')
        await loadProjects()
      } catch (error) {
        console.error(error)
        showOperationError(error)
        if (error?.databaseOutcomeUnknown) await loadProjects()
      } finally {
        actionButton.disabled = false
      }
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (isSaving) return
    const submitter = event.submitter
    const publish = submitter?.dataset.publish === 'true'
    const formData = new FormData(form)
    const projectId = form.dataset.projectId || null
    const values = {
      title: formData.get('title'),
      slug: formData.get('slug'),
      description: formData.get('description'),
      technologies: formData.get('technologies'),
      completedAt: formData.get('completedAt'),
      liveUrl: formData.get('liveUrl'),
      repositoryUrl: formData.get('repositoryUrl'),
      sortOrder: formData.get('sortOrder'),
    }
    const selectedPreview = formData.get('previewFile')
    const previewFile = selectedPreview instanceof File && selectedPreview.size > 0
      ? selectedPreview
      : null
    isSaving = true
    submitButtons.forEach((button) => { button.disabled = true })
    previewInput.disabled = true
    setAdminProjectFeedback('')
    document.querySelector('#admin-project-form-error').hidden = true

    try {
      const result = await saveAdminProject({
        id: projectId,
        values,
        previewFile,
        publish,
      })
      hideAdminProjectForm()
      reportCleanup(
        result.cleanup,
        publish ? 'Project published.' : 'Project saved as a draft.',
      )
      await loadProjects()
    } catch (error) {
      console.error(error)
      showOperationError(error)
      if (error?.databaseOutcomeUnknown) await loadProjects()
    } finally {
      isSaving = false
      submitButtons.forEach((button) => { button.disabled = false })
      previewInput.disabled = false
    }
  })

  loadProjects()
}

