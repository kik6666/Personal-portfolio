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
      <iframe class="cv-pdf" src="${cvPdf}#toolbar=0&amp;navpanes=0&amp;view=FitH" title="Kristina Panovska CV as a PDF"></iframe>
      <div class="cv-mobile-preview">
        <img src="${cvPreview}" alt="Preview of Kristina Panovska's CV" />
      </div>
    </div>
    <div class="cv-actions">
      <a class="btn btn-primary" href="${cvPdf}" target="_blank" rel="noopener noreferrer">
        <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> Preview CV
      </a>
    </div>
  </section>
  ${backHomeLink()}
`

const pdfFrame = document.querySelector('.cv-pdf')
const pdfPreview = document.querySelector('.cv-mobile-preview img')
const previewLink = document.querySelector('.cv-actions a')

function useLocalPdf() {
  if (pdfFrame.dataset.usingStorage !== 'true') return
  pdfFrame.dataset.usingStorage = 'false'
  pdfFrame.src = `${cvPdf}#toolbar=0&navpanes=0&view=FitH`
  previewLink.href = cvPdf
}

pdfFrame.addEventListener('error', useLocalPdf)
pdfPreview.addEventListener('error', () => {
  if (pdfPreview.dataset.usingStorage !== 'true') return
  pdfPreview.dataset.usingStorage = 'false'
  pdfPreview.src = cvPreview
})

async function loadCvMedia() {
  try {
    const siteContent = await getPublicSiteContent()
    const pdfUrl = getPublicSiteAssetUrl(siteContent, SITE_MEDIA_KEYS.cvPdf)
    const previewUrl = getPublicSiteAssetUrl(siteContent, SITE_MEDIA_KEYS.cvPreviewImage)

    if (pdfUrl) {
      pdfFrame.dataset.usingStorage = 'true'
      pdfFrame.src = `${pdfUrl}#toolbar=0&navpanes=0&view=FitH`
      previewLink.href = pdfUrl
    }

    if (previewUrl) {
      pdfPreview.dataset.usingStorage = 'true'
      pdfPreview.src = previewUrl
    }
  } catch (error) {
    console.error(error)
  }
}

loadCvMedia()
