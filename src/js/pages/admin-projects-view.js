import { safeHttpUrl } from '../utils/safe-url.js'
import { getPublicAssetUrl } from '../services/storage-urls.js'
import { normalizeProjectVideoUrl } from '../services/admin-projects-validation.js'

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

function previewImage(path, alt) {
  const url = safeHttpUrl(getPublicAssetUrl(path))
  if (!url) return null
  const image = element('img', 'admin-project-preview-image')
  image.src = url
  image.alt = alt
  image.loading = 'lazy'
  image.decoding = 'async'
  return image
}

function currentPreview(project) {
  const container = document.querySelector('#admin-project-current-preview')
  container.replaceChildren()
  const image = project?.preview_image_path
    ? previewImage(project.preview_image_path, `Current preview of ${project.title}`)
    : null
  if (image) {
    const link = element('a', 'admin-project-preview-link', 'Open current preview')
    link.href = image.src
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    container.append(image, link)
  } else {
    container.append(element('span', 'admin-certificate-asset-missing', 'No preview image currently attached.'))
  }
}

function currentVideo(project) {
  const container = document.querySelector('#admin-project-current-video')
  container.replaceChildren()
  if (project?.video_path) {
    const url = safeHttpUrl(getPublicAssetUrl(project.video_path))
    container.append(element('span', 'admin-project-metadata', project.video_path))
    if (url) {
      const link = element('a', '', 'Open current MP4')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      container.append(link)
    }
    return
  }
  if (project?.video_url) {
    const normalizedUrl = normalizeProjectVideoUrl(project.video_url)
    if (normalizedUrl) {
      const link = element('a', '', 'Open current YouTube/Vimeo video')
      link.href = normalizedUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      container.append(link)
    } else {
      container.append(element('span', 'admin-project-metadata', 'Saved external URL is not a supported provider link.'))
    }
    container.append(element('span', 'admin-project-metadata', project.video_url))
    return
  }
  container.append(element('span', 'admin-certificate-asset-missing', 'No video source currently attached.'))
}

export function renderAdminProjectManager(root) {
  root.innerHTML = `
    <div class="admin-project-manager">
      <div class="admin-certificate-toolbar">
        <p>Manage draft and published projects. Database and Storage authorization remain enforced by Supabase.</p>
        <button id="admin-project-add" class="btn btn-primary" type="button">
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
          Add Project
        </button>
      </div>

      <div id="admin-project-feedback" class="admin-cert-feedback" role="status" aria-live="polite" hidden></div>
      <section id="admin-project-recovery" class="admin-cert-recovery" aria-labelledby="admin-project-recovery-title" hidden>
        <div>
          <h3 id="admin-project-recovery-title">Project file cleanup needs attention</h3>
          <p>These files could not be confirmed as removed. Retry cleanup after checking project records.</p>
          <ul id="admin-project-recovery-paths"></ul>
        </div>
        <button id="admin-project-retry-cleanup" class="btn btn-outline-primary btn-sm" type="button">Retry cleanup</button>
      </section>

      <form id="admin-project-form" class="admin-project-form" hidden novalidate>
        <div class="admin-certificate-form-heading">
          <div>
            <p class="eyebrow">Project details</p>
            <h3 id="admin-project-form-title">Add Project</h3>
          </div>
          <button id="admin-project-cancel" class="btn btn-outline-secondary btn-sm" type="button">Cancel</button>
        </div>

        <div class="admin-project-fields">
          <div class="admin-project-field admin-project-field-wide">
            <label for="admin-project-title">Title <span aria-hidden="true">*</span></label>
            <input id="admin-project-title" name="title" class="form-control" type="text" required maxlength="250" autocomplete="off" />
          </div>
          <div class="admin-project-field admin-project-field-wide">
            <label for="admin-project-slug">Slug <span aria-hidden="true">*</span></label>
            <input id="admin-project-slug" name="slug" class="form-control" type="text" required maxlength="180" autocomplete="off" spellcheck="false" />
            <small>Suggested from the title when creating a project; editable. Changing an existing slug is optional.</small>
          </div>
          <div class="admin-project-field admin-project-field-wide">
            <label for="admin-project-description">Description <span aria-hidden="true">*</span></label>
            <textarea id="admin-project-description" name="description" class="form-control" rows="4" required></textarea>
          </div>
          <div class="admin-project-field admin-project-field-wide">
            <label for="admin-project-technologies">Technologies</label>
            <input id="admin-project-technologies" name="technologies" class="form-control" type="text" autocomplete="off" />
            <small>Separate technologies with commas.</small>
          </div>
          <div class="admin-project-field">
            <label for="admin-project-completed-at">Completion date</label>
            <input id="admin-project-completed-at" name="completedAt" class="form-control" type="date" />
          </div>
          <div class="admin-project-field">
            <label for="admin-project-sort-order">Display order</label>
            <input id="admin-project-sort-order" name="sortOrder" class="form-control" type="number" min="0" step="1" value="0" />
          </div>
          <div class="admin-project-field">
            <label for="admin-project-live-url">Live Demo URL</label>
            <input id="admin-project-live-url" name="liveUrl" class="form-control" type="url" inputmode="url" autocomplete="url" />
          </div>
          <div class="admin-project-field">
            <label for="admin-project-repository-url">GitHub Repository URL</label>
            <input id="admin-project-repository-url" name="repositoryUrl" class="form-control" type="url" inputmode="url" autocomplete="url" />
          </div>
          <div class="admin-project-field admin-project-field-wide">
            <label for="admin-project-preview-file">Preview image <span class="text-muted">(optional)</span></label>
            <input id="admin-project-preview-file" name="previewFile" class="form-control" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" />
            <small>JPEG, PNG, or WebP; maximum 50 MiB. A selected image replaces the current preview.</small>
          </div>
          <div class="admin-project-field admin-project-field-wide">
            <span class="admin-certificate-label">Current preview</span>
            <div id="admin-project-current-preview" class="admin-project-current-preview"></div>
            <div id="admin-project-selected-preview" class="admin-project-selected-preview" hidden></div>
          </div>
          <div class="admin-project-field admin-project-field-wide">
            <label for="admin-project-video-source">Project video</label>
            <select id="admin-project-video-source" name="videoSource" class="form-select">
              <option value="none">No video</option>
              <option value="upload">Upload an MP4</option>
              <option value="external">YouTube or Vimeo URL</option>
            </select>
            <small>Choose at most one source. Selecting “No video” removes the current source when saved.</small>
          </div>
          <div id="admin-project-video-file-field" class="admin-project-field admin-project-field-wide" hidden>
            <label for="admin-project-video-file">MP4 video</label>
            <input id="admin-project-video-file" name="videoFile" class="form-control" type="file" accept="video/mp4,.mp4" />
            <small>MP4 only, maximum 50 MiB. On an existing MP4 project, leaving this empty keeps the current file.</small>
          </div>
          <div id="admin-project-video-url-field" class="admin-project-field admin-project-field-wide" hidden>
            <label for="admin-project-video-url">YouTube or Vimeo URL</label>
            <input id="admin-project-video-url" name="videoUrl" class="form-control" type="url" inputmode="url" autocomplete="url" />
            <small>Supported formats: YouTube watch, short, embed or Shorts links; Vimeo video and player links. HTTPS only.</small>
          </div>
          <div class="admin-project-field admin-project-field-wide">
            <span class="admin-certificate-label">Current video source</span>
            <div id="admin-project-current-video" class="admin-project-current-video"></div>
          </div>
        </div>

        <div id="admin-project-form-error" class="admin-cert-feedback admin-cert-feedback-error" role="alert" hidden></div>
        <div class="admin-certificate-form-actions">
          <button class="btn btn-outline-primary" type="submit" data-publish="false">Save as Draft</button>
          <button class="btn btn-primary" type="submit" data-publish="true">Publish</button>
        </div>
      </form>

      <div id="admin-project-list-state" class="admin-project-list-state" role="status" aria-live="polite">
        Loading projects…
      </div>
      <div id="admin-project-list" class="admin-project-list"></div>
    </div>
  `

  document.querySelector('#admin-project-add').addEventListener('click', () => {
    showAdminProjectForm(null)
  })
  document.querySelector('#admin-project-cancel').addEventListener('click', hideAdminProjectForm)
}

export function setAdminProjectVideoSource(source) {
  const fileField = document.querySelector('#admin-project-video-file-field')
  const urlField = document.querySelector('#admin-project-video-url-field')
  fileField.hidden = source !== 'upload'
  urlField.hidden = source !== 'external'
}

export function showAdminProjectForm(project) {
  const form = document.querySelector('#admin-project-form')
  form.reset()
  form.dataset.projectId = project?.id ?? ''
  document.querySelector('#admin-project-form-title').textContent = project
    ? 'Edit Project'
    : 'Add Project'
  document.querySelector('#admin-project-title').value = project?.title ?? ''
  const slug = document.querySelector('#admin-project-slug')
  slug.value = project?.slug ?? ''
  slug.dataset.auto = project ? 'false' : 'true'
  document.querySelector('#admin-project-description').value = project?.description ?? ''
  document.querySelector('#admin-project-technologies').value = Array.isArray(project?.technologies)
    ? project.technologies.join(', ')
    : ''
  document.querySelector('#admin-project-completed-at').value = project?.completed_at ?? ''
  document.querySelector('#admin-project-sort-order').value = String(project?.sort_order ?? 0)
  document.querySelector('#admin-project-live-url').value = project?.live_url ?? ''
  document.querySelector('#admin-project-repository-url').value = project?.repository_url ?? ''
  const videoSource = document.querySelector('#admin-project-video-source')
  videoSource.value = project?.video_path
    ? 'upload'
    : project?.video_url
      ? 'external'
      : 'none'
  document.querySelector('#admin-project-video-url').value = project?.video_url ?? ''
  document.querySelector('#admin-project-form-error').hidden = true
  document.querySelector('#admin-project-selected-preview').replaceChildren()
  document.querySelector('#admin-project-selected-preview').hidden = true
  currentPreview(project)
  currentVideo(project)
  setAdminProjectVideoSource(videoSource.value)
  form.hidden = false
  document.querySelector('#admin-project-title').focus()
}

export function hideAdminProjectForm() {
  const form = document.querySelector('#admin-project-form')
  form.hidden = true
  form.reset()
  form.dataset.projectId = ''
}

export function showAdminProjectFormError(message, field = null) {
  const error = document.querySelector('#admin-project-form-error')
  error.textContent = message
  error.hidden = false
  const fields = {
    title: '#admin-project-title',
    slug: '#admin-project-slug',
    description: '#admin-project-description',
    technologies: '#admin-project-technologies',
    completedAt: '#admin-project-completed-at',
    sortOrder: '#admin-project-sort-order',
    liveUrl: '#admin-project-live-url',
    repositoryUrl: '#admin-project-repository-url',
    previewFile: '#admin-project-preview-file',
    videoSource: '#admin-project-video-source',
    videoUrl: '#admin-project-video-url',
    videoFile: '#admin-project-video-file',
  }
  if (field) document.querySelector(fields[field])?.focus()
}

export function setAdminProjectFeedback(message, kind = 'success') {
  const feedback = document.querySelector('#admin-project-feedback')
  feedback.textContent = message
  feedback.dataset.kind = kind
  feedback.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  feedback.hidden = !message
}

export function setAdminProjectListState(message, { hidden = false, error = false } = {}) {
  const state = document.querySelector('#admin-project-list-state')
  state.textContent = message
  state.dataset.kind = error ? 'error' : ''
  state.hidden = hidden
}

export function renderAdminProjects(projects, handlers) {
  const container = document.querySelector('#admin-project-list')
  container.replaceChildren()

  if (projects.length === 0) {
    container.append(element('p', 'admin-project-empty', 'No projects yet. Add a project to create your first draft.'))
    return
  }

  for (const project of projects) {
    const row = element('article', 'admin-project-row')
    const image = previewImage(project.preview_image_path, `Preview of ${project.title}`)
    if (image) row.append(image)

    const details = element('div', 'admin-project-details')
    const heading = element('div', 'admin-project-row-heading')
    heading.append(
      element('h3', '', project.title || 'Untitled project'),
      element(
        'span',
        `admin-certificate-status ${project.is_published ? 'is-published' : 'is-draft'}`,
        project.is_published ? 'Published' : 'Draft',
      ),
    )
    details.append(heading)
    details.append(element('p', 'admin-project-metadata', `/${project.slug}`))

    const completed = project.completed_at
      ? new Intl.DateTimeFormat('en', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${project.completed_at}T00:00:00.000Z`))
      : null
    const metadata = [completed, `Order ${project.sort_order ?? 0}`].filter(Boolean)
    if (Array.isArray(project.technologies) && project.technologies.length) {
      metadata.push(project.technologies.filter((item) => typeof item === 'string').join(', '))
    }
    details.append(element('p', 'admin-project-metadata', metadata.join(' · ')))

    const actions = element('div', 'admin-project-actions')
    const edit = button('edit', 'Edit')
    const toggle = button(
      'toggle-publish',
      project.is_published ? 'Unpublish' : 'Publish',
      project.is_published
        ? 'btn btn-outline-secondary btn-sm'
        : 'btn btn-outline-primary btn-sm',
    )
    const remove = button('delete', 'Delete', 'btn btn-outline-danger btn-sm')
    for (const control of [edit, toggle, remove]) {
      control.dataset.projectId = project.id
      control.addEventListener('click', (event) => handlers.onAction(event, project))
    }
    actions.append(edit, toggle, remove)
    row.append(details, actions)
    container.append(row)
  }
}

export function renderAdminProjectRecovery(paths, onRetry) {
  const section = document.querySelector('#admin-project-recovery')
  const list = document.querySelector('#admin-project-recovery-paths')
  list.replaceChildren(...paths.map((path) => element('li', '', path)))
  section.hidden = paths.length === 0
  const retry = document.querySelector('#admin-project-retry-cleanup')
  retry.replaceWith(retry.cloneNode(true))
  document.querySelector('#admin-project-retry-cleanup').addEventListener('click', onRetry)
}

export function setAdminProjectSelectedPreview(url) {
  const container = document.querySelector('#admin-project-selected-preview')
  container.replaceChildren()
  container.hidden = !url
  if (!url) return

  const image = element('img', 'admin-project-preview-image')
  image.src = url
  image.alt = 'Selected replacement project preview'
  container.append(image, element('span', 'admin-project-metadata', 'Selected image will replace the current preview on save.'))
}
