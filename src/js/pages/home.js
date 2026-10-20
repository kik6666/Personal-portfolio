import avatarVideo from '../../../virtual_avatar_video_home_page/Avatar Video_1080p.mp4?url'
import { getPublicContactLinks } from '../services/contact-links.js'
import { getPublicSiteContent } from '../services/site-content.js'
import { mountSite } from '../site.js'
import { readProfile, renderContactCards, renderHeadline, statusMessage } from './home-content.js'

mountSite('home')

document.querySelector('#main-content').innerHTML = `
  <section class="home-hero" aria-labelledby="intro-title">
    <p class="eyebrow">Personal portfolio &amp; interactive CV</p>
    <h1 id="intro-title">Welcome</h1>
    <p class="hero-role" hidden></p>
    <p class="hero-description" role="status">Loading profile…</p>
    <figure class="avatar-video-card">
      <video class="avatar-video" controls playsinline preload="metadata" poster="/assets/avatar-poster.svg" aria-label="Introduction video featuring Kristina's virtual avatar">
        <source src="${avatarVideo}" type="video/mp4" />
        Your browser does not support embedded video. You can still explore the CV and contact details below.
      </video>
      <figcaption class="video-caption">
        <i class="bi bi-play-circle" aria-hidden="true"></i>
        A short introduction from my virtual avatar
      </figcaption>
      <p class="video-error" role="status" hidden>
        The introduction video could not be loaded. Please use the other sections to learn more.
      </p>
    </figure>
    <div class="hero-actions">
      <a class="btn btn-primary" href="/cv/">Explore my CV <i class="bi bi-arrow-right" aria-hidden="true"></i></a>
      <a class="btn btn-outline-primary" href="#contact">Get in touch</a>
    </div>
  </section>

  <section class="contact-section" id="contact" aria-labelledby="contact-title">
    <div class="section-heading-row">
      <div>
        <p class="eyebrow">Let's connect</p>
        <h2 id="contact-title">Contact</h2>
      </div>
      <p class="section-note">Choose the channel that works best for you.</p>
    </div>
    <div class="row g-3" id="contact-links" aria-live="polite"></div>
  </section>

  <section class="explore-section" aria-labelledby="explore-title">
    <div class="section-heading-row">
      <div>
        <p class="eyebrow">Explore</p>
        <h2 id="explore-title">A little more about me</h2>
      </div>
    </div>
    <div class="row g-3">
      <div class="col-12 col-md-6">
        <a class="feature-card" href="/cv/">
          <span class="feature-icon"><i class="bi bi-file-earmark-person" aria-hidden="true"></i></span>
          <span><strong>Curriculum Vitae</strong><small>View or download my CV</small></span>
          <i class="bi bi-arrow-up-right feature-arrow" aria-hidden="true"></i>
        </a>
      </div>
      <div class="col-12 col-md-6">
        <a class="feature-card" href="/business-card/">
          <span class="feature-icon"><i class="bi bi-person-vcard" aria-hidden="true"></i></span>
          <span><strong>Business Card</strong><small>My professional contact details</small></span>
          <i class="bi bi-arrow-up-right feature-arrow" aria-hidden="true"></i>
        </a>
      </div>
      <div class="col-12 col-md-6">
        <a class="feature-card" href="/projects/">
          <span class="feature-icon"><i class="bi bi-grid-1x2" aria-hidden="true"></i></span>
          <span><strong>Projects</strong><small>Selected work and experiments</small></span>
          <i class="bi bi-arrow-up-right feature-arrow" aria-hidden="true"></i>
        </a>
      </div>
      <div class="col-12 col-md-6">
        <a class="feature-card" href="/certificates/">
          <span class="feature-icon"><i class="bi bi-award" aria-hidden="true"></i></span>
          <span><strong>Certificates</strong><small>Training and credentials</small></span>
          <i class="bi bi-arrow-up-right feature-arrow" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  </section>
`

const video = document.querySelector('.avatar-video')
video.addEventListener('error', () => {
  document.querySelector('.video-error').hidden = false
})

const title = document.querySelector('#intro-title')
const role = document.querySelector('.hero-role')
const description = document.querySelector('.hero-description')
const contactList = document.querySelector('#contact-links')

function renderIntro(siteContent) {
  const { name, headline, introduction } = readProfile(siteContent)
  title.textContent = name || 'Welcome'
  renderHeadline(role, headline)
  description.removeAttribute('role')
  description.textContent = introduction || (name || headline
    ? ''
    : 'The professional introduction has not been published yet. Please check back soon.')
  description.hidden = !description.textContent
}

function renderIntroError() {
  description.setAttribute('role', 'alert')
  description.replaceChildren('We could not load the introduction right now. ')
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'btn btn-link p-0 align-baseline'
  retry.textContent = 'Try again'
  retry.addEventListener('click', loadHomeContent)
  description.append(retry)
}

function renderContacts(links) {
  if (renderContactCards(contactList, links) === 0) {
    contactList.replaceChildren(statusMessage('Contact details have not been published yet.'))
  }
}

async function loadHomeContent() {
  description.setAttribute('role', 'status')
  description.hidden = false
  description.textContent = 'Loading profile…'
  contactList.replaceChildren(statusMessage('Loading contact details…'))

  const [content, links] = await Promise.allSettled([getPublicSiteContent(), getPublicContactLinks()])

  if (content.status === 'fulfilled') {
    renderIntro(content.value)
  } else {
    console.error(content.reason)
    renderIntroError()
  }

  if (links.status === 'fulfilled') {
    renderContacts(links.value)
  } else {
    console.error(links.reason)
    contactList.replaceChildren(statusMessage('We could not load the contact details right now.', loadHomeContent))
  }
}

loadHomeContent()
