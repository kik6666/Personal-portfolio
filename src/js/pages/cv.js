import cvPdf from '../../../CV/CV Resume_oct_26.pdf?url'
import cvPreview from '../../../CV/CV Resume_oct_26.jpg?url'
import { backHomeLink, mountSite, pageHeading } from '../site.js'

mountSite('cv')

document.querySelector('#main-content').innerHTML = `
  ${pageHeading('Professional profile', 'Curriculum Vitae', 'A closer look at my experience, education, and ongoing development.')}
  <section class="cv-layout" aria-label="CV document">
    <div class="cv-document">
      <iframe class="cv-pdf" src="${cvPdf}#toolbar=0&navpanes=0&view=FitH" title="Kristina Panovska CV as a PDF"></iframe>
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
