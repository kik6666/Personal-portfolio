import { requireSupabase } from './supabase.js'
import { runPublicQuery } from './public-query.js'

export function getPublicContactLinks() {
  return runPublicQuery(
    requireSupabase()
      .from('contact_links')
      .select('id, label, link_type, url, icon_name, sort_order')
      .eq('is_public', true)
      .order('sort_order', { ascending: true }),
    'public contact links',
  )
}
