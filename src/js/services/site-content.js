import { requireSupabase } from './supabase.js'
import { runPublicQuery } from './public-query.js'

export async function getPublicSiteContent() {
  const rows = await runPublicQuery(
    requireSupabase()
      .from('site_content')
      .select('key, value')
      .eq('is_public', true),
    'public site content',
  )

  return Object.fromEntries(rows.map(({ key, value }) => [key, value]))
}
