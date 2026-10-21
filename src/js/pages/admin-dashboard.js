import {
  getCurrentAdminUser,
  onAuthStateChange,
  signOut,
} from '../services/auth.js'
import { getPublishedCertificates } from '../services/certificates.js'
import { getPublishedProjects } from '../services/projects.js'
import { mountSite } from '../site.js'

mountSite('admin-login')

const main = document.querySelector('#main-content')
let currentUserId = null
let authSubscription = null
let redirectingToLogin = false

function showLoading() {
  main.innerHTML = `
    <section class="admin-access-state" role="status" aria-live="polite">
      <span class="admin-loading-indicator" aria-hidden="true"></span>
      <p>Verifying administrator access…</p>
    </section>
  `
}

function showAccessState(title, message) {
  main.innerHTML = `
    <section class="admin-access-state" aria-labelledby="admin-access-title">
      <span class="admin-access-icon" aria-hidden="true"><i class="bi bi-shield-lock"></i></span>
      <p class="eyebrow">Restricted access</p>
      <h1 id="admin-access-title">${title}</h1>
      <p>${message}</p>
      <a class="btn btn-primary" href="/admin/login/">Go to Admin Login</a>
    </section>
  `
}

function redirectToLogin() {
  if (redirectingToLogin) return
  redirectingToLogin = true
  window.location.replace('/admin/login/')
}

function renderDashboard(user) {
  main.innerHTML = `
    <div class="admin-dashboard">
      <header class="admin-dashboard-header">
        <div>
          <p class="eyebrow">Restricted workspace</p>
          <h1>Admin Dashboard</h1>
          <p class="admin-dashboard-intro">Review published portfolio content and administration areas.</p>
        </div>
        <div class="admin-dashboard-account">
          <span id="admin-account-email" class="admin-account-email"></span>
          <button id="admin-logout" class="btn btn-outline-primary" type="button">
            <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
            Sign out
          </button>
        </div>
      </header>

      <div id="admin-dashboard-feedback" class="auth-feedback admin-dashboard-feedback" role="alert" aria-live="polite" hidden></div>

      <div class="admin-dashboard-layout">
        <aside class="admin-dashboard-sidebar">
          <nav class="admin-dashboard-nav" aria-label="Dashboard sections">
            <a href="#overview"><i class="bi bi-grid-1x2" aria-hidden="true"></i> Overview</a>
            <a href="#projects"><i class="bi bi-kanban" aria-hidden="true"></i> Projects</a>
            <a href="#certificates"><i class="bi bi-award" aria-hidden="true"></i> Certificates</a>
            <a href="#site-content"><i class="bi bi-window" aria-hidden="true"></i> Site Content</a>
            <a href="#cv-media"><i class="bi bi-file-earmark-richtext" aria-hidden="true"></i> CV &amp; Media</a>
            <a href="#contact-links"><i class="bi bi-link-45deg" aria-hidden="true"></i> Contact Links</a>
          </nav>
        </aside>

        <div class="admin-dashboard-content">
          <section id="overview" class="admin-dashboard-section" aria-labelledby="overview-title">
            <div class="admin-section-heading">
              <div>
                <p class="eyebrow">Portfolio activity</p>
                <h2 id="overview-title">Overview</h2>
              </div>
              <span class="admin-status-badge admin-status-readonly">Read only</span>
            </div>
            <div id="admin-stats-state" class="admin-stats-state" role="status" aria-live="polite">
              Loading published content statistics…
            </div>
            <div id="admin-stats-grid" class="admin-stats-grid" hidden>
              <article class="admin-stat-card">
                <span class="admin-stat-icon"><i class="bi bi-kanban" aria-hidden="true"></i></span>
                <p>Published projects</p>
                <strong id="published-project-count">—</strong>
                <span>Visible on the public Projects page</span>
              </article>
              <article class="admin-stat-card">
                <span class="admin-stat-icon admin-stat-icon-purple"><i class="bi bi-award" aria-hidden="true"></i></span>
                <p>Published certificates</p>
                <strong id="published-certificate-count">—</strong>
                <span>Visible on the public Certificates page</span>
              </article>
            </div>
            <button id="admin-stats-retry" class="admin-retry-button" type="button" hidden>
              Try loading statistics again
            </button>
          </section>

          <section id="projects" class="admin-dashboard-section admin-management-section" aria-labelledby="projects-title">
            <div class="admin-section-heading">
              <div>
                <p class="eyebrow">Portfolio work</p>
                <h2 id="projects-title">Projects</h2>
              </div>
              <span class="admin-status-badge admin-status-unavailable">Editing unavailable</span>
            </div>
            <p>Project management is not enabled in this dashboard step. Published project totals above are read-only.</p>
            <a class="admin-public-link" href="/projects/">View the public Projects page <i class="bi bi-arrow-up-right" aria-hidden="true"></i></a>
          </section>

          <section id="certificates" class="admin-dashboard-section admin-management-section" aria-labelledby="certificates-title">
            <div class="admin-section-heading">
              <div>
                <p class="eyebrow">Learning &amp; development</p>
                <h2 id="certificates-title">Certificates</h2>
              </div>
              <span class="admin-status-badge admin-status-unavailable">Editing unavailable</span>
            </div>
            <p>Certificate management is not enabled in this dashboard step. Published certificate totals above are read-only.</p>
            <a class="admin-public-link" href="/certificates/">View the public Certificates page <i class="bi bi-arrow-up-right" aria-hidden="true"></i></a>
          </section>

          <section id="site-content" class="admin-dashboard-section admin-management-section" aria-labelledby="site-content-title">
            <div class="admin-section-heading">
              <div>
                <p class="eyebrow">Website settings</p>
                <h2 id="site-content-title">Site Content</h2>
              </div>
              <span class="admin-status-badge admin-status-unavailable">Unavailable in this phase</span>
            </div>
            <p>Editing homepage text and other site content is not available yet.</p>
          </section>

          <section id="cv-media" class="admin-dashboard-section admin-management-section" aria-labelledby="cv-media-title">
            <div class="admin-section-heading">
              <div>
                <p class="eyebrow">Documents &amp; assets</p>
                <h2 id="cv-media-title">CV &amp; Media</h2>
              </div>
              <span class="admin-status-badge admin-status-unavailable">Uploads unavailable</span>
            </div>
            <p>CV and media file replacement or upload actions are not available yet.</p>
          </section>

          <section id="contact-links" class="admin-dashboard-section admin-management-section" aria-labelledby="contact-links-title">
            <div class="admin-section-heading">
              <div>
                <p class="eyebrow">Public contact details</p>
                <h2 id="contact-links-title">Contact Links</h2>
              </div>
              <span class="admin-status-badge admin-status-unavailable">Unavailable in this phase</span>
            </div>
            <p>Contact link editing is not available yet.</p>
          </section>
        </div>
      </div>
    </div>
  `

  document.querySelector('#admin-account-email').textContent = user.email ?? 'Administrator'
  document.querySelector('#admin-logout').addEventListener('click', handleLogout)
  document.querySelector('#admin-stats-retry').addEventListener('click', loadStatistics)
  loadStatistics()
}

function setStatisticsError() {
  const state = document.querySelector('#admin-stats-state')
  state.textContent = 'Published content statistics could not be loaded. Your dashboard access is still verified.'
  state.dataset.kind = 'error'
  document.querySelector('#admin-stats-grid').hidden = true
  document.querySelector('#admin-stats-retry').hidden = false
}

async function loadStatistics() {
  const state = document.querySelector('#admin-stats-state')
  const stats = document.querySelector('#admin-stats-grid')
  const retry = document.querySelector('#admin-stats-retry')
  retry.hidden = true
  stats.hidden = true
  state.hidden = false
  state.dataset.kind = ''
  state.textContent = 'Loading published content statistics…'

  try {
    const [projects, certificates] = await Promise.all([
      getPublishedProjects(),
      getPublishedCertificates(),
    ])
    document.querySelector('#published-project-count').textContent = String(projects.length)
    document.querySelector('#published-certificate-count').textContent = String(certificates.length)
    state.hidden = true
    stats.hidden = false
  } catch (error) {
    console.error(error)
    setStatisticsError()
  }
}

async function handleLogout(event) {
  const button = event.currentTarget
  button.disabled = true
  button.textContent = 'Signing out…'

  try {
    await signOut()
    redirectToLogin()
  } catch (error) {
    console.error(error)
    const feedback = document.querySelector('#admin-dashboard-feedback')
    feedback.textContent = error.message || 'Unable to sign out. Please try again.'
    feedback.dataset.kind = 'error'
    feedback.hidden = false
    button.disabled = false
    button.innerHTML = '<i class="bi bi-box-arrow-right" aria-hidden="true"></i> Sign out'
  }
}

function watchSession(userId) {
  authSubscription?.unsubscribe()
  authSubscription = onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && session?.user.id !== userId)) {
      redirectToLogin()
    }
  })
}

async function initializeDashboard() {
  showLoading()

  try {
    const user = await getCurrentAdminUser()
    if (!user) {
      redirectToLogin()
      return
    }

    currentUserId = user.id
    renderDashboard(user)
    watchSession(currentUserId)
  } catch (error) {
    if (error?.code === 'not-admin') {
      showAccessState('Access denied', 'This account does not have administrator access. Its session has been cleared.')
      return
    }

    console.error(error)
    showAccessState('Unable to verify access', 'Your administrator session could not be verified. Sign in again to continue.')
  }
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    authSubscription?.unsubscribe()
    authSubscription = null
    initializeDashboard()
  }
})

initializeDashboard()
