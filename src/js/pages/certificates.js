import { getPublishedCertificates } from '../services/certificates.js'
import { getPublicAssetUrl } from '../services/storage-urls.js'
import { backHomeLink, mountSite, pageHeading } from '../site.js'
import {
  renderCertificates,
  renderCertificatesEmpty,
  renderCertificatesError,
  renderCertificatesLoading,
} from './certificates-view.js'

mountSite('certificates')

document.querySelector('#main-content').innerHTML = `
  ${pageHeading('Learning & development', 'Certificates', 'A selection of training certificates and recognitions.')}
  <section id="certificates-content" aria-label="Certificates" aria-live="polite"></section>
  ${backHomeLink()}
`

const container = document.querySelector('#certificates-content')

async function loadCertificates() {
  renderCertificatesLoading(container)
  try {
    const certificates = await getPublishedCertificates()
    if (renderCertificates(container, certificates, getPublicAssetUrl) === 0) {
      renderCertificatesEmpty(container)
    }
  } catch (error) {
    console.error(error)
    renderCertificatesError(container, loadCertificates)
  }
}

loadCertificates()
