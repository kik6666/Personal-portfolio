import Modal from 'bootstrap/js/dist/modal.js'
import { getPublishedProjects } from '../services/projects.js'
import { getPublicAssetUrl } from '../services/storage-urls.js'
import { mountProjectVideoModal } from '../services/project-video-modal.js'
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
  <div id="project-video-modal-root"></div>
  ${backHomeLink()}
`

const container = document.querySelector('#projects-content')
const videoModal = mountProjectVideoModal(
  document.querySelector('#project-video-modal-root'),
  { ModalClass: Modal, resolveAssetUrl: getPublicAssetUrl },
)
window.addEventListener('pagehide', videoModal.dispose, { once: true })

async function loadProjects() {
  renderProjectsLoading(container)
  try {
    const projects = await getPublishedProjects()
    if (renderProjects(container, projects, getPublicAssetUrl, {
      onWatchVideo: (project, trigger) => videoModal.open(project, trigger),
    }) === 0) {
      renderProjectsEmpty(container)
    }
  } catch (error) {
    console.error(error)
    renderProjectsError(container, loadProjects)
  }
}

loadProjects()
