import { backHomeLink, escapeHtml, mountSite, pageHeading } from '../site.js'
import { getPublicSiteContent } from '../services/site-content.js'
import { businessCardContact, profile } from '../content.js'
import nameArt from '../../assets/business-card/name.webp'
import washArt from '../../assets/business-card/wash.webp'
import { renderHeadline, resolveProfileWithFallback } from './home-content.js'
import { getPublicContactLinks } from '../services/contact-links.js'
import { linkedinLabel as toLinkedinLabel, resolveBusinessCardContacts } from '../services/contact-resolver.js'

mountSite('business-card')

const staticContacts = {
  emails: [businessCardContact.secondaryEmail, profile.email],
  linkedinUrl: profile.linkedinUrl,
}
const linkedinLabel = toLinkedinLabel(profile.linkedinUrl)

document.querySelector('#main-content').innerHTML = `
  ${pageHeading('Stay in touch', 'Business Card', 'A quick way to connect with me professionally.')}
  <section class="business-card-stage" aria-label="Digital business card">
    <article class="digital-card" aria-labelledby="business-card-name">
      <div class="digital-card-art" aria-hidden="true">
        <img class="digital-card-wash" src="${washArt}" alt="" width="305" height="687" decoding="async">
      </div>
      <p class="digital-card-label">PERSONAL PORTFOLIO</p>
      <p id="business-card-headline" class="digital-card-headline"></p>
      <h2 class="digital-card-name">
        <span id="business-card-name" class="visually-hidden"></span>
        <img src="${nameArt}" alt="" width="890" height="270" decoding="async">
      </h2>
      <ul class="digital-card-links digital-card-details">
        <li>
          <span class="digital-card-icon" aria-hidden="true"><i class="bi bi-geo-alt"></i></span>
          <span class="digital-card-link-text">${escapeHtml(businessCardContact.address)}</span>
        </li>
        <li>
          <a href="tel:${escapeHtml(businessCardContact.phone.replace(/\s/g, ''))}">
            <span class="digital-card-icon" aria-hidden="true"><i class="bi bi-telephone"></i></span>
            <span class="digital-card-link-text">${escapeHtml(businessCardContact.phone)}</span>
          </a>
        </li>
      </ul>
      <ul class="digital-card-links digital-card-online">
        <li class="digital-card-emails">
          <span class="digital-card-icon" aria-hidden="true"><i class="bi bi-envelope"></i></span>
          <span class="digital-card-link-text">
            <a href="mailto:${escapeHtml(businessCardContact.secondaryEmail)}">${escapeHtml(businessCardContact.secondaryEmail)}</a>
            <span aria-hidden="true" class="digital-card-sep">|</span>
            <a href="mailto:${escapeHtml(profile.email)}">${escapeHtml(profile.email)}</a>
          </span>
        </li>
        <li>
          <a href="${escapeHtml(profile.linkedinUrl)}" target="_blank" rel="noopener noreferrer">
            <span class="digital-card-icon" aria-hidden="true"><i class="bi bi-linkedin"></i></span>
            <span class="digital-card-link-text">${escapeHtml(linkedinLabel)}</span>
          </a>
        </li>
      </ul>
    </article>
    <p class="card-caption"><i class="bi bi-info-circle" aria-hidden="true"></i> This digital version uses the contact details from my CV.</p>
  </section>
  ${backHomeLink()}
`

const cardName = document.querySelector('#business-card-name')
const cardHeadline = document.querySelector('#business-card-headline')

function renderProfile({ name, headline }) {
  cardName.textContent = name
  renderHeadline(cardHeadline, headline)
}

renderProfile(profile)

async function loadPublishedProfile() {
  try {
    const siteContent = await getPublicSiteContent()
    renderProfile(resolveProfileWithFallback(siteContent, profile))
  } catch (error) {
    console.error(error)
  }
}

// Updates only the text and href of the existing links; the card markup is unchanged.
function applyContacts({ emails, linkedinUrl, linkedinLabel: label }) {
  const emailLinks = document.querySelectorAll('.digital-card-emails a')
  emails.slice(0, emailLinks.length).forEach((address, index) => {
    emailLinks[index].href = `mailto:${address}`
    emailLinks[index].textContent = address
  })
  const linkedin = document.querySelector('.digital-card-online li:last-child a')
  linkedin.href = linkedinUrl
  linkedin.querySelector('.digital-card-link-text').textContent = label
}

async function loadPublishedContacts() {
  try {
    applyContacts(resolveBusinessCardContacts(await getPublicContactLinks(), staticContacts))
  } catch (error) {
    console.error(error)
  }
}

loadPublishedProfile()
loadPublishedContacts()
