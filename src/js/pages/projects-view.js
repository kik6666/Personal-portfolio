import { safeHttpUrl } from '../utils/safe-url.js'

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function icon(name) {
  const node = element('i', `bi bi-${name}`)
  node.setAttribute('aria-hidden', 'true')
  return node
}

function formatCompletion(value) {
  const date = new Date(value)
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) return null
  return {
    label: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
    iso: value,
  }
}

function externalButton(href, label, iconName, variant) {
  const link = element('a', `btn btn-${variant} btn-sm`)
  link.href = href
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.append(icon(iconName), ` ${label}`)
  return link
}

export function projectCard(project, resolveImageUrl = () => null) {
  const title = typeof project?.title === 'string' ? project.title.trim() : ''
  if (!title) return null

  const card = element('article', 'project-card')

  const media = element('div', 'project-media')
  const imageUrl = safeHttpUrl(resolveImageUrl(project.preview_image_path))
  if (imageUrl) {
    const image = element('img')
    image.src = imageUrl
    image.alt = `Preview of the project ${title}`
    image.loading = 'lazy'
    image.decoding = 'async'
    image.addEventListener('error', () => {
      image.remove()
      media.classList.add('project-media-empty')
      media.append(icon('image'))
    })
    media.append(image)
  } else {
    media.classList.add('project-media-empty')
    media.append(icon('image'))
  }

  const body = element('div', 'project-body')
  const completed = formatCompletion(project.completed_at)
  if (completed) {
    const time = element('time', 'project-date', completed.label)
    time.dateTime = completed.iso
    body.append(time)
  }
  body.append(element('h2', '', title))

  if (typeof project.description === 'string' && project.description.trim()) {
    body.append(element('p', 'project-description', project.description.trim()))
  }

  const technologies = Array.isArray(project.technologies)
    ? project.technologies.filter((item) => typeof item === 'string' && item.trim())
    : []
  if (technologies.length > 0) {
    const list = element('ul', 'project-tags')
    list.setAttribute('aria-label', 'Technologies used')
    technologies.forEach((item) => list.append(element('li', '', item.trim())))
    body.append(list)
  }

  const liveUrl = safeHttpUrl(project.live_url)
  const repositoryUrl = safeHttpUrl(project.repository_url)
  if (liveUrl || repositoryUrl) {
    const actions = element('div', 'project-actions')
    if (liveUrl) actions.append(externalButton(liveUrl, 'View Live Project', 'box-arrow-up-right', 'primary'))
    if (repositoryUrl) actions.append(externalButton(repositoryUrl, 'View GitHub', 'github', 'outline-primary'))
    body.append(actions)
  }

  card.append(media, body)
  return card
}

export function renderProjects(container, projects, resolveImageUrl) {
  const cards = projects.map((project) => projectCard(project, resolveImageUrl)).filter(Boolean)
  if (cards.length === 0) return 0

  const grid = element('div', 'project-grid')
  cards.forEach((card) => {
    const item = element('div', 'project-grid-item')
    item.append(card)
    grid.append(item)
  })
  container.replaceChildren(grid)
  return cards.length
}

export function renderProjectsLoading(container) {
  const status = element('div', 'data-status', 'Loading projects…')
  status.setAttribute('role', 'status')
  container.replaceChildren(status)
}

export function renderProjectsEmpty(container) {
  const section = element('div', 'empty-state')
  const iconWrap = element('span', 'empty-state-icon')
  iconWrap.append(icon('folder2-open'))
  const link = element('a', 'btn btn-outline-primary', 'Get in touch')
  link.href = '/#contact'
  section.append(
    iconWrap,
    element('h2', '', 'Projects coming soon'),
    element('p', '', 'This gallery will be updated as project details and preview images are ready to share.'),
    link,
  )
  container.replaceChildren(section)
}

export function renderProjectsError(container, onRetry) {
  const box = element('div', 'data-status data-status-error')
  box.setAttribute('role', 'alert')
  const retry = element('button', 'btn btn-outline-primary btn-sm', 'Try again')
  retry.type = 'button'
  retry.addEventListener('click', onRetry)
  box.append(element('span', '', 'We could not load the projects right now.'), retry)
  container.replaceChildren(box)
}
