import {
  listAdminSiteContent,
  saveAdminSiteContent,
  SITE_PROFILE_FIELDS,
} from '../services/admin-site-content.js'

function element(tagName, className = '', text = '') {
  const node = document.createElement(tagName)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function fieldControl(field) {
  const section = element('section', 'admin-site-content-field')
  section.setAttribute('aria-labelledby', `site-content-label-${field.key}`)

  const heading = element('div', 'admin-site-content-field-heading')
  const label = element('label', 'form-label fw-semibold', field.label)
  label.htmlFor = `site-content-input-${field.key}`
  label.id = `site-content-label-${field.key}`
  const status = element('span', 'admin-status-badge admin-status-unavailable')
  status.id = `site-content-status-${field.key}`
  status.setAttribute('aria-live', 'polite')
  heading.append(label, status)
  section.append(heading)

  const control = field.key === 'introduction'
    ? element('textarea', 'form-control')
    : element('input', 'form-control')
  control.id = `site-content-input-${field.key}`
  control.name = field.key
  control.maxLength = field.maxLength
  control.required = false
  control.setAttribute('aria-describedby', `site-content-hint-${field.key} site-content-error-${field.key}`)
  if (field.key === 'introduction') {
    control.rows = 4
  } else {
    control.type = 'text'
    control.autocomplete = field.key === 'full_name' ? 'name' : 'off'
  }

  const hint = element(
    'small',
    'form-text text-body-secondary',
    `Plain text, up to ${field.maxLength} characters.`,
  )
  hint.id = `site-content-hint-${field.key}`
  const error = element('small', 'admin-site-content-error text-danger')
  error.id = `site-content-error-${field.key}`
  error.setAttribute('role', 'alert')

  const visibilityLabel = element('label', 'form-label mt-2', 'Visibility when saved')
  visibilityLabel.htmlFor = `site-content-visibility-${field.key}`
  const visibility = element('select', 'form-select')
  visibility.id = `site-content-visibility-${field.key}`
  visibility.name = `${field.key}-visibility`
  visibility.setAttribute('aria-label', `${field.label} visibility when saved`)
  for (const [value, text] of [['false', 'Draft'], ['true', 'Published']]) {
    const option = element('option', '', text)
    option.value = value
    visibility.append(option)
  }

  section.append(control, hint, error, visibilityLabel, visibility)
  return { section, control, status, error, visibility }
}

function setStatus(fieldState, record, isDirty) {
  const { status } = fieldState
  status.className = 'admin-status-badge'
  if (isDirty) {
    const current = record
      ? (record.is_public ? 'Published' : 'Draft')
      : 'Not saved'
    status.classList.add('admin-status-unavailable')
    status.textContent = `Unsaved changes · currently ${current}`
    return
  }
  if (!record) {
    status.classList.add('admin-status-unavailable')
    status.textContent = 'Not saved · Draft'
    return
  }
  status.classList.add(record.is_public ? 'admin-status-published' : 'admin-status-draft')
  status.textContent = record.is_public ? 'Published' : 'Draft'
}

export function mountAdminSiteContent(root) {
  root.replaceChildren()
  const manager = element('div', 'admin-site-content-manager')
  const state = element('p', 'admin-site-content-state', 'Loading biography fields…')
  state.setAttribute('role', 'status')
  state.setAttribute('aria-live', 'polite')
  const alert = element('div', 'admin-site-content-feedback')
  alert.setAttribute('role', 'status')
  alert.setAttribute('aria-live', 'polite')
  alert.hidden = true
  const form = element('form', 'admin-site-content-form')
  form.hidden = true
  const fields = new Map()
  const stored = {}

  for (const field of SITE_PROFILE_FIELDS) {
    const control = fieldControl(field)
    fields.set(field.key, control)
    form.append(control.section)
  }

  const actions = element('div', 'admin-site-content-actions')
  const saveButton = element('button', 'btn btn-primary', 'Save changes')
  saveButton.type = 'submit'
  const retryButton = element('button', 'btn btn-outline-primary', 'Reload biography fields')
  retryButton.type = 'button'
  retryButton.hidden = true
  actions.append(saveButton, retryButton)
  form.append(actions)
  manager.append(state, alert, form)
  root.append(manager)

  function isDirty(key) {
    const field = fields.get(key)
    const record = stored[key] ?? null
    return field.control.value !== (record?.value ?? '')
      || (field.visibility.value === 'true') !== Boolean(record?.is_public)
  }

  function refreshField(key) {
    const field = fields.get(key)
    setStatus(field, stored[key] ?? null, isDirty(key))
    saveButton.disabled = [...fields.keys()].every((fieldKey) => !isDirty(fieldKey))
  }

  function showFeedback(message, kind = 'success') {
    alert.textContent = message
    alert.dataset.kind = kind
    alert.setAttribute('role', kind === 'error' || kind === 'partial' ? 'alert' : 'status')
    alert.hidden = false
  }

  async function load() {
    retryButton.hidden = true
    form.hidden = true
    alert.hidden = true
    state.hidden = false
    state.dataset.kind = ''
    state.textContent = 'Loading biography fields…'

    try {
      const records = await listAdminSiteContent()
      for (const field of SITE_PROFILE_FIELDS) {
        const record = records[field.key] ?? null
        if (record) stored[field.key] = record
        else delete stored[field.key]
        const control = fields.get(field.key)
        control.control.value = record?.value ?? ''
        control.visibility.value = String(Boolean(record?.is_public))
        control.error.textContent = ''
        setStatus(control, record, false)
      }
      state.hidden = false
      state.textContent = Object.keys(records).length
        ? 'Biography fields loaded.'
        : 'No biography fields are saved yet. Add the values you want to manage; unsaved fields remain unchanged.'
      form.hidden = false
      saveButton.disabled = true
    } catch (error) {
      console.error(error)
      state.dataset.kind = 'error'
      state.textContent = error?.message || 'Biography fields could not be loaded.'
      retryButton.hidden = false
    }
  }

  for (const [key, field] of fields) {
    field.control.addEventListener('input', () => {
      field.error.textContent = ''
      refreshField(key)
    })
    field.visibility.addEventListener('change', () => {
      field.error.textContent = ''
      refreshField(key)
    })
  }
  retryButton.addEventListener('click', () => { void load() })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const changes = []
    for (const field of SITE_PROFILE_FIELDS) {
      const current = fields.get(field.key)
      current.error.textContent = ''
      if (!isDirty(field.key)) continue
      const isPublic = current.visibility.value === 'true'
      if (isPublic && !current.control.value.trim()) {
        current.error.textContent = `${field.label} needs a value before it can be published.`
        continue
      }
      changes.push({
        key: field.key,
        value: current.control.value,
        is_public: isPublic,
      })
    }

    if (SITE_PROFILE_FIELDS.some(({ key }) => fields.get(key).error.textContent)) {
      showFeedback('Review the highlighted fields before saving.', 'error')
      return
    }
    if (changes.length === 0) {
      showFeedback('There are no unsaved changes.', 'success')
      return
    }

    saveButton.disabled = true
    retryButton.disabled = true
    for (const field of fields.values()) {
      field.control.disabled = true
      field.visibility.disabled = true
    }
    state.hidden = false
    state.textContent = `Saving ${changes.length} ${changes.length === 1 ? 'field' : 'fields'}…`
    alert.hidden = true

    try {
      const result = await saveAdminSiteContent(changes)
      for (const record of result.saved) {
        stored[record.key] = record
        const field = fields.get(record.key)
        field.control.value = record.value
        field.visibility.value = String(record.is_public)
      }
      for (const failure of result.failed) {
        fields.get(failure.key).error.textContent = failure.message
      }

      if (result.failed.length) {
        const savedCount = result.saved.length
        showFeedback(
          `${savedCount} of ${changes.length} fields saved. ${result.failed.length} failed; review the field errors and retry. Successful fields are saved and failed fields remain unsaved.`,
          'partial',
        )
        state.textContent = 'Some biography fields were saved; others need attention.'
      } else {
        showFeedback(`${result.saved.length} ${result.saved.length === 1 ? 'field' : 'fields'} saved successfully.`)
        state.textContent = 'All requested biography fields were saved.'
      }
    } catch (error) {
      console.error(error)
      showFeedback(error?.message || 'Biography fields could not be saved. No success was confirmed.', 'error')
      state.textContent = 'Biography fields could not be saved.'
    } finally {
      for (const field of fields.values()) {
        field.control.disabled = false
        field.visibility.disabled = false
      }
      retryButton.disabled = false
      for (const key of fields.keys()) refreshField(key)
    }
  })

  void load()
  return Object.freeze({ reload: load })
}
