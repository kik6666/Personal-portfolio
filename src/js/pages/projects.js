import { getPublishedProjects } from '../services/projects.js'
import { getPublicAssetUrl } from '../services/storage-urls.js'
import { backHomeLink, mountSite, pageHeading } from '../site.js'
import {
  renderProjects,
  renderProjectsEmpty,
  renderProjectsError,
  renderProjectsLoading,
} from './projects-view.js'

mountSite('projects')

document.querySelector('#main-content').innerHTML = `
  ${pageHeading('Selected work', 'Projects', 'A collection of projects and experiments I can share.')}
  <section id="projects-content" aria-label="Projects" aria-live="polite"></section>
  ${backHomeLink()}
`

const container = document.querySelector('#projects-content')

async function loadProjects() {
  renderProjectsLoading(container)
  try {
    const projects = await getPublishedProjects()
    if (renderProjects(container, projects, getPublicAssetUrl) === 0) {
      renderProjectsEmpty(container)
    }
  } catch (error) {
    console.error(error)
    renderProjectsError(container, loadProjects)
  }
}

loadProjects()
