import { backHomeLink, escapeHtml, headlineMarkup, mountSite, pageHeading } from '../site.js'
import { getPublicSiteContent } from '../services/site-content.js'
import { getPublicSiteAssetUrl, SITE_MEDIA_KEYS } from '../services/storage-urls.js'
import { profile } from '../content.js'

mountSite('business-card')

document.querySelector('#main-content').innerHTML = `
  ${pageHeading('Stay in touch', 'Business Card', 'A quick way to connect with me professionally.')}
  <section class="business-card-stage" aria-label="Digital business card">
    <figure class="business-card-artwork" hidden>
      <img alt="Business card artwork" />
    </figure>
    <article class="digital-card">
      <div class="digital-card-top">
        <span class="brand-mark brand-mark-large" aria-hidden="true">KP</span>
        <span class="digital-card-label">PERSONAL PORTFOLIO</span>
      </div>
      <div class="digital-card-content">
        <p class="eyebrow">Marketing · AI · Python</p>
        <h2>${escapeHtml(profile.name)}</h2>
        <p>${headlineMarkup()}</p>
      </div>
      <div class="digital-card-links">
        <a href="mailto:${escapeHtml(profile.email)}"><i class="bi bi-envelope" aria-hidden="true"></i> ${escapeHtml(profile.email)}</a>
        <a href="${escapeHtml(profile.linkedinUrl)}" target="_blank" rel="noopener noreferrer">
          <i class="bi bi-linkedin" aria-hidden="true"></i> LinkedIn profile
        </a>
      </div>
    </article>
    <p class="card-caption"><i class="bi bi-info-circle" aria-hidden="true"></i> This digital version uses the contact details from my CV.</p>
  </section>
  ${backHomeLink()}
`

const artwork = document.querySelector('.business-card-artwork')
const artworkImage = artwork.querySelector('img')
artworkImage.addEventListener('error', () => {
  artwork.hidden = true
})

async function loadBusinessCardArtwork() {
  try {
    const siteContent = await getPublicSiteContent()
    const artworkUrl = getPublicSiteAssetUrl(siteContent, SITE_MEDIA_KEYS.businessCardImage)
    if (!artworkUrl) return
    artworkImage.src = artworkUrl
    artwork.hidden = false
  } catch (error) {
    console.error(error)
  }
}

loadBusinessCardArtwork()
