# Supabase setup

This project keeps its database schema and access policies in
`supabase/migrations/`. Apply migrations with the Supabase CLI; do not make
unrecorded schema or policy changes in the Dashboard.

## Configure the project

1. Create a Supabase project and copy its project reference.
2. Install or run the Supabase CLI, then authenticate and link this repository:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` using the project's public client settings.
   Never use a service-role key in a Vite environment variable.

## Provision the first administrator

Create or invite the intended administrator through Supabase Auth first. Then
run this SQL in the Supabase SQL Editor, replacing the email with the exact
address of that account:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where email = 'ADMIN_EMAIL'
on conflict (user_id) do update
set role = excluded.role;
```

The `user_roles` table has no client write grants or insert/update/delete
policies. The initial role assignment is deliberately an operator-only action;
an authenticated user cannot grant themselves administrator access.

## Access model

- Anonymous visitors can read only public site-content/contact-link rows and
  published projects/certificates.
- Authenticated non-admin users receive the same public reads and cannot modify
  portfolio content or upload files.
- Administrators are checked against `public.user_roles` by the
  `private.is_admin()` security-definer function. The `private` schema is not
  exposed through the Supabase Data API.
- The `portfolio-assets` bucket is public so published portfolio media can be
  displayed without sign-in. Its upload, replacement and deletion policies
  require the administrator role. Do not store private drafts or confidential
  files in this bucket.
- Uploads are limited to 50 MiB and JPEG, PNG, WebP, PDF or MP4 MIME types.

## Public media references

The `portfolio-assets` bucket is public for reading. Store bucket-relative
object paths in content records, not full Storage URLs. The frontend resolves
those paths with `getPublicAssetUrl()`; it does not upload files.

The `site_content` table has a generic `key`/JSONB `value` shape rather than
dedicated media columns. These public keys use string values containing paths
relative to the bucket:

| `site_content.key` | Media |
| --- | --- |
| `avatar_video_path` | Home-page avatar video |
| `avatar_video_poster_path` | Home-page introduction video poster |
| `cv_pdf_path` | CV PDF |
| `cv_preview_image_path` | CV preview image |
| `business_card_image_path` | Optional business-card artwork |

Set `is_public` to `true` for references intended for visitors. If a reference
is absent, the pages retain their bundled/local media or existing UI fallback.

Projects use `projects.preview_image_path`. Certificates use
`certificates.pdf_path` and `certificates.preview_image_path`; the PDF or
`credential_url` supplies the “View Certificate” target. A preview image is an
optional separate JPEG, PNG or WebP made from the certificate PDF's first page.
Without it, the gallery displays its award-icon fallback.

To publish the existing local certificates later, upload each original PDF to
the bucket (for example, `certificates/<certificate-name>.pdf`), optionally
upload a separate first-page thumbnail under `certificates/previews/`, then
create its metadata row with the corresponding paths and `is_published` set to
`true` only when it is ready for public display. Use the existing administrator
write policies for uploads and records; never use a service-role key in the
frontend. No files or records are uploaded by the current media integration.
