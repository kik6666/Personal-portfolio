import { backHomeLink, mountSite, pageHeading } from '../site.js'

mountSite('projects')

document.querySelector('#main-content').innerHTML = `
  ${pageHeading('Selected work', 'Projects', 'A collection of projects and experiments I can share.')}
  <section class="empty-state" aria-labelledby="projects-empty-title">
    <span class="empty-state-icon"><i class="bi bi-folder2-open" aria-hidden="true"></i></span>
    <h2 id="projects-empty-title">Projects are on their way</h2>
    <p>This gallery will be updated as project details and preview images are ready to share.</p>
    <a class="btn btn-outline-primary" href="/#contact">Get in touch</a>
  </section>
  ${backHomeLink()}
`
