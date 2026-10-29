import cvPdf from '../../../CV/CV Resume_oct_26.pdf?url'
import cvPreview from '../../../CV/CV Resume_oct_26.jpg?url'
import { getPublicSiteContent } from '../services/site-content.js'
import { getPublicSiteAssetUrl, SITE_MEDIA_KEYS } from '../services/storage-urls.js'
import { backHomeLink, mountSite, pageHeading } from '../site.js'

mountSite('cv')

document.querySelector('#main-content').innerHTML = `
  ${pageHeading('Professional profile', 'Curriculum Vitae', 'A closer look at my experience, education, and ongoing development.')}
  <section class="cv-layout" aria-label="CV document">
    <div class="cv-document">
      <img class="cv-preview-image" src="${cvPreview}" alt="Full-page preview of Kristina Panovska's CV, including her professional experience and education." />
    </div>
    <div class="cv-actions">
      <a class="btn btn-primary" href="${cvPdf}" target="_blank" rel="noopener noreferrer">
        <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> Preview CV
      </a>
    </div>
  </section>
  ${backHomeLink()}
`

const cvPreviewImage = document.querySelector('.cv-preview-image')
const previewLink = document.querySelector('.cv-actions a')

cvPreviewImage.addEventListener('error', () => {
  if (cvPreviewImage.dataset.usingStorage !== 'true') return
  cvPreviewImage.dataset.usingStorage = 'false'
  cvPreviewImage.src = cvPreview
})

async function loadCvMedia() {
  try {
    const siteContent = await getPublicSiteContent()
    const pdfUrl = getPublicSiteAssetUrl(siteContent, SITE_MEDIA_KEYS.cvPdf)
    const previewUrl = getPublicSiteAssetUrl(siteContent, SITE_MEDIA_KEYS.cvPreviewImage)

    if (pdfUrl) {
      previewLink.href = pdfUrl
    }

    if (previewUrl) {
      cvPreviewImage.dataset.usingStorage = 'true'
      cvPreviewImage.src = previewUrl
    }
  } catch (error) {
    console.error(error)
  }
}

loadCvMedia()
