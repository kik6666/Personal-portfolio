import { requireSupabase } from './supabase.js'
import { runPublicQuery } from './public-query.js'

export function getPublishedCertificates() {
  return runPublicQuery(
    requireSupabase()
      .from('certificates')
      .select('id, title, issuer, issue_date, credential_url, pdf_path, preview_image_path, sort_order')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('issue_date', { ascending: false, nullsFirst: false }),
    'published certificates',
  )
}
