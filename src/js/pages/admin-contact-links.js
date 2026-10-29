import {
  AdminContactLinksError,
  deleteAdminContactLink,
  listAdminContactLinks,
  moveAdminContactLink,
  saveAdminContactLink,
  setAdminContactLinkPublished,
} from '../services/admin-contact-links.js'
import {
  CONTACT_ICON_OPTIONS,
  CONTACT_LABEL_MAX_LENGTH,
  CONTACT_LINK_TYPES,
  ContactLinkValidationError,
  contactValueForEditing,
  defaultIconFor,
} from '../services/contact-links-validation.js'

function element(tagName, className = '', text = '') {
  const node = document.createElement(tagName)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function field(id, labelText, control, hint) {
  const wrapper = element('div', 'admin-project-field')
  const label = element('label', '', labelText)
  label.htmlFor = id
  control.id = id
  wrapper.append(label, control)
  if (hint) wrapper.append(element('small', '', hint))
  const error = element('small', 'text-danger')
  error.id = `${id}-error`
  error.setAttribute('role', 'alert')
  control.setAttribute('aria-describedby', error.id)
  wrapper.append(error)
  return { wrapper, error }
}

function typeLabel(value) {
  return CONTACT_LINK_TYPES.find((type) => type.value === value)?.label ?? value
}

export function mountAdminContactLinks(root) {
  root.replaceChildren()
  const manager = element('div', 'admin-project-manager')
  const state = element('p', 'admin-project-list-state', 'Loading contact links…')
  state.setAttribute('role', 'status')
  const feedback = element('div', 'admin-cert-feedback')
  feedback.setAttribute('role', 'status')
  feedback.setAttribute('aria-live', 'polite')
  feedback.hidden = true
  const list = element('div', 'admin-project-list')
  const addButton = element('button', 'btn btn-primary btn-sm', 'Add contact link')
  addButton.type = 'button'
  const toolbar = element('div', 'admin-certificate-toolbar')
  toolbar.append(
    element('p', '', 'Published links appear on Home and feed the Business Card emails and LinkedIn. With none published, Home shows the static email and LinkedIn.'),
    addButton,
  )

  const form = element('form', 'admin-project-form')
  form.noValidate = true
  form.hidden = true
  const formTitle = element('h3', '', 'Add contact link')
  const fields = element('div', 'admin-project-fields')
  const labelInput = element('input', 'form-control')
  labelInput.type = 'text'
  labelInput.maxLength = CONTACT_LABEL_MAX_LENGTH
  labelInput.autocomplete = 'off'
  const typeSelect = element('select', 'form-select')
  for (const type of CONTACT_LINK_TYPES) {
    const option = element('option', '', type.label)
    option.value = type.value
    typeSelect.append(option)
  }
  const valueInput = element('input', 'form-control')
  valueInput.type = 'text'
  valueInput.autocomplete = 'off'
  valueInput.spellcheck = false
  const iconSelect = element('select', 'form-select')
  for (const icon of CONTACT_ICON_OPTIONS) {
    const option = element('option', '', icon)
    option.value = icon
    iconSelect.append(option)
  }

  const labelField = field('contact-link-label', 'Label', labelInput, `Up to ${CONTACT_LABEL_MAX_LENGTH} characters, plain text.`)
  const typeField = field('contact-link-type', 'Type', typeSelect)
  const valueField = field('contact-link-value', 'Email address', valueInput)
  const iconField = field('contact-link-icon', 'Icon', iconSelect)
  fields.append(labelField.wrapper, typeField.wrapper, valueField.wrapper, iconField.wrapper)
  const errorsByName = {
    label: labelField.error,
    link_type: typeField.error,
    value: valueField.error,
    icon_name: iconField.error,
  }

  const formActions = element('div', 'admin-certificate-form-actions')
  const saveButton = element('button', 'btn btn-primary', 'Save as draft')
  saveButton.type = 'submit'
  const cancelButton = element('button', 'btn btn-outline-secondary', 'Cancel')
  cancelButton.type = 'button'
  formActions.append(saveButton, cancelButton)
  form.append(formTitle, fields, formActions)
  manager.append(toolbar, state, feedback, form, list)
  root.append(manager)

  let links = []
  let editingId = null
  let busy = false

  function showFeedback(message, kind = 'success') {
    feedback.textContent = message
    feedback.dataset.kind = kind === 'error' ? 'error' : ''
    feedback.hidden = false
  }

  function clearErrors() {
    Object.values(errorsByName).forEach((node) => { node.textContent = '' })
  }

  function syncValueField() {
    const isEmail = typeSelect.value === 'email'
    valueField.wrapper.querySelector('label').textContent = isEmail ? 'Email address' : 'URL (https only)'
    valueInput.placeholder = isEmail ? 'name@example.com' : 'https://'
    valueInput.inputMode = isEmail ? 'email' : 'url'
  }

  function openForm(link) {
    clearErrors()
    editingId = link?.id ?? null
    formTitle.textContent = link ? 'Edit contact link' : 'Add contact link'
    saveButton.textContent = link ? 'Save changes' : 'Save as draft'
    labelInput.value = link?.label ?? ''
    typeSelect.value = link?.link_type ?? 'email'
    valueInput.value = link ? contactValueForEditing(link) : ''
    iconSelect.value = CONTACT_ICON_OPTIONS.includes(link?.icon_name) ? link.icon_name : defaultIconFor(typeSelect.value)
    syncValueField()
    form.hidden = false
    labelInput.focus()
  }

  function closeForm() {
    form.hidden = true
    editingId = null
    clearErrors()
  }

  function setBusy(value) {
    busy = value
    root.querySelectorAll('button').forEach((button) => { button.disabled = value })
  }

  function reportError(error) {
    if (error instanceof ContactLinkValidationError) {
      clearErrors()
      const target = errorsByName[error.field]
      if (target) {
        target.textContent = error.message
        return
      }
    }
    showFeedback(
      error instanceof AdminContactLinksError || error instanceof ContactLinkValidationError
        ? error.message
        : (error?.message || 'The request failed. Nothing was reported as saved.'),
      'error',
    )
  }

  function renderRow(link, index) {
    const row = element('article', 'admin-project-row')
    const details = element('div', 'admin-project-details')
    const heading = element('div', 'admin-project-row-heading')
    heading.append(
      element('h3', '', link.label),
      element('span', `admin-certificate-status ${link.is_public ? 'is-published' : 'is-draft'}`, link.is_public ? 'Published' : 'Draft'),
    )
    const meta = element('p', 'admin-project-metadata', `${typeLabel(link.link_type)} · ${contactValueForEditing(link)}`)
    meta.style.overflowWrap = 'anywhere'
    details.append(heading, meta)

    const actions = element('div', 'admin-project-actions')
    const buttons = [
      ['edit', 'Edit', 'btn-outline-primary'],
      ['toggle', link.is_public ? 'Unpublish' : 'Publish', 'btn-outline-primary'],
      ['up', 'Move up', 'btn-outline-secondary'],
      ['down', 'Move down', 'btn-outline-secondary'],
      ['delete', 'Delete', 'btn-outline-danger'],
    ]
    for (const [action, text, style] of buttons) {
      const button = element('button', `btn btn-sm ${style}`, text)
      button.type = 'button'
      button.dataset.action = action
      button.setAttribute('aria-label', `${text} ${link.label}`)
      if ((action === 'up' && index === 0) || (action === 'down' && index === links.length - 1)) {
        button.disabled = true
      }
      button.addEventListener('click', () => handleAction(action, link))
      actions.append(button)
    }
    row.append(details, actions)
    return row
  }

  function renderList() {
    if (links.length === 0) {
      state.hidden = false
      state.dataset.kind = ''
      state.textContent = 'No contact links yet. Public pages use the static email and LinkedIn until you publish links.'
    } else {
      state.hidden = true
    }
    list.replaceChildren(...links.map(renderRow))
  }

  async function loadLinks() {
    state.hidden = false
    state.dataset.kind = ''
    state.textContent = 'Loading contact links…'
    try {
      links = await listAdminContactLinks()
      renderList()
    } catch (error) {
      console.error(error)
      links = []
      list.replaceChildren()
      state.hidden = false
      state.dataset.kind = 'error'
      state.textContent = `${error?.message || 'Contact links could not be loaded.'} `
      const retry = element('button', 'btn btn-outline-primary btn-sm', 'Try again')
      retry.type = 'button'
      retry.addEventListener('click', loadLinks)
      state.append(retry)
    }
  }

  async function handleAction(action, link) {
    if (busy) return
    if (action === 'edit') {
      openForm(link)
      return
    }
    if (action === 'delete' && !window.confirm(`Delete “${link.label}”? This removes the contact link and cannot be undone.`)) {
      return
    }

    setBusy(true)
    try {
      if (action === 'toggle') {
        const saved = await setAdminContactLinkPublished(link.id, !link.is_public)
        showFeedback(`“${saved.label}” is now ${saved.is_public ? 'published' : 'a draft'}.`)
      } else if (action === 'delete') {
        await deleteAdminContactLink(link.id, { confirmed: true })
        if (editingId === link.id) closeForm()
        showFeedback(`“${link.label}” was deleted.`)
      } else {
        const result = await moveAdminContactLink(link.id, action)
        if (result.failed.length > 0) {
          showFeedback(
            `The new order was only partly saved. Could not update: ${result.failed.map(({ label }) => label).join(', ')}. The list below shows the current saved order.`,
            'error',
          )
        } else if (result.moved) {
          showFeedback(`“${link.label}” was moved ${action}.`)
        }
      }
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
      await loadLinks()
    }
  }

  addButton.addEventListener('click', () => openForm(null))
  cancelButton.addEventListener('click', closeForm)
  typeSelect.addEventListener('change', () => {
    iconSelect.value = defaultIconFor(typeSelect.value)
    syncValueField()
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (busy) return
    clearErrors()
    setBusy(true)
    try {
      const saved = await saveAdminContactLink({
        id: editingId,
        label: labelInput.value,
        link_type: typeSelect.value,
        value: valueInput.value,
        icon_name: iconSelect.value,
      })
      closeForm()
      showFeedback(editingId ? `“${saved.label}” was updated.` : `“${saved.label}” was saved as a draft.`)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
      await loadLinks()
    }
  })

  loadLinks()
}
