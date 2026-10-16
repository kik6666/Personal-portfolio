import aiAdoption from '../../../CERTIFICATES/AI Adoption - February 2025 - Certificate.pdf?url'
import aiBasics from '../../../CERTIFICATES/AI Basics - October 2024 - Honorable mention.pdf?url'
import introProgrammingAi from '../../../CERTIFICATES/Introduction to Programming with AI - February 2026 - Certificate.pdf?url'
import programmingBasics from '../../../CERTIFICATES/Programming Basics - March 2025 - Certificate.pdf?url'
import programmingAi from '../../../CERTIFICATES/Programming Fundamentals with AI - April 2026 - Certificate.pdf?url'
import programmingPython from '../../../CERTIFICATES/Programming Fundamentals with Python - May 2025 - Certificate.pdf?url'
import promptEngineering from '../../../CERTIFICATES/Prompt Engineering & AI Tools - November 2024 - Certificate.pdf?url'
import vibeCoding from '../../../CERTIFICATES/Vibe Coding Basics - September 2025 - Honorable mention (1).pdf?url'
import { backHomeLink, mountSite, pageHeading } from '../site.js'

const certificates = [
  { title: 'AI Adoption', date: 'February 2025', recognition: 'Certificate', file: aiAdoption },
  { title: 'AI Basics', date: 'October 2024', recognition: 'Honorable mention', file: aiBasics },
  { title: 'Introduction to Programming with AI', date: 'February 2026', recognition: 'Certificate', file: introProgrammingAi },
  { title: 'Programming Basics', date: 'March 2025', recognition: 'Certificate', file: programmingBasics },
  { title: 'Programming Fundamentals with AI', date: 'April 2026', recognition: 'Certificate', file: programmingAi },
  { title: 'Programming Fundamentals with Python', date: 'May 2025', recognition: 'Certificate', file: programmingPython },
  { title: 'Prompt Engineering & AI Tools', date: 'November 2024', recognition: 'Certificate', file: promptEngineering },
  { title: 'Vibe Coding Basics', date: 'September 2025', recognition: 'Honorable mention', file: vibeCoding },
]

mountSite('certificates')

document.querySelector('#main-content').innerHTML = `
  ${pageHeading('Learning & development', 'Certificates', 'A selection of training certificates and recognitions.')}
  <section class="certificate-grid" aria-label="Certificates">
    ${certificates.map(({ title, date, recognition, file }) => `
      <article class="certificate-card">
        <div class="certificate-icon"><i class="bi bi-award" aria-hidden="true"></i></div>
        <div class="certificate-content">
          <p class="certificate-date">${date}</p>
          <h2>${title}</h2>
          <p class="certificate-recognition">${recognition}</p>
        </div>
        <a class="certificate-link" href="${file}" target="_blank" rel="noopener noreferrer" aria-label="Open ${title} PDF">
          <span>View certificate</span><i class="bi bi-arrow-up-right" aria-hidden="true"></i>
        </a>
      </article>
    `).join('')}
  </section>
  ${backHomeLink()}
`
