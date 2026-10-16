import cvPdf from '../../../CV/CV Resume_oct_26.pdf?url'
import cvPreview from '../../../CV/CV Resume_oct_26.jpg?url'
import { backHomeLink, mountSite, pageHeading } from '../site.js'

mountSite('cv')

document.querySelector('#main-content').innerHTML = `
  ${pageHeading('Professional profile', 'Curriculum Vitae', 'A closer look at my experience, education, and ongoing development.')}
  <section class="cv-layout" aria-label="CV document">
    <div class="cv-document">
      <iframe class="cv-pdf" src="${cvPdf}#view=FitH" title="Kristina Panovska CV as a PDF"></iframe>
      <div class="cv-mobile-preview">
        <img src="${cvPreview}" alt="Preview of Kristina Panovska's CV" />
      </div>
    </div>
    <aside class="cv-actions">
      <span class="document-icon"><i class="bi bi-file-earmark-pdf" aria-hidden="true"></i></span>
      <h2>My CV</h2>
      <p>Open the PDF in a new tab or download a copy.</p>
      <a class="btn btn-primary w-100" href="${cvPdf}" target="_blank" rel="noopener noreferrer">
        <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> View CV
      </a>
      <a class="btn btn-outline-primary w-100" href="${cvPdf}" download="Kristina-Panovska-CV.pdf">
        <i class="bi bi-download" aria-hidden="true"></i> Download PDF
      </a>
      <p class="cv-note"><i class="bi bi-info-circle" aria-hidden="true"></i> On phones, use the preview image or open the PDF in your preferred viewer.</p>
    </aside>
  </section>
  ${backHomeLink()}
`
