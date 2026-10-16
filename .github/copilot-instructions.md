# Project instructions

## Project context

Build an English-language, responsive personal portfolio and interactive CV using
HTML, CSS, vanilla JavaScript ES modules, Bootstrap 5, Vite, and Supabase.
The application will have separate pages for Home, CV, Business Card, Projects,
Certificates, Admin Login, and the Admin Panel.

## Development guidelines

- Keep each public page as its own HTML entry point; do not replace multi-page
  navigation with hidden single-page sections.
- Prefer small, reusable JavaScript modules and semantic, accessible HTML.
- Do not use React, Vue, Angular, TypeScript, or other frontend frameworks.
- Use the existing asset folders as source material and do not move or delete
  user-provided files without approval.
- Use clearly marked placeholders; never invent personal history, credentials,
  project claims, contact details, or URLs.
- Keep the visual system consistent with the palette in the project brief:
  `#608ABF`, `#6B21A8`, `#334155`, `#475569`, `#FFFFFF`, and `#F8FAFC`.
- Read and write portfolio data through modular Supabase services. Enforce
  authorization with database Row-Level Security and Storage policies, not only
  frontend checks.
- Read only public Supabase configuration from `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put service-role keys, passwords, or
  other secrets in frontend code or committed files.
- Implement database changes as SQL migrations under `supabase/migrations/`.
- Validate changes with the smallest relevant test or build command.
