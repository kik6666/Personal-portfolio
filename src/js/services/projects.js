import { requireSupabase } from './supabase.js'
import { runPublicQuery } from './public-query.js'

export function getPublishedProjects() {
  return runPublicQuery(
    requireSupabase()
      .from('projects')
      .select('id, title, slug, description, technologies, preview_image_path, video_path, video_url, live_url, repository_url, completed_at, sort_order')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('completed_at', { ascending: false, nullsFirst: false }),
    'published projects',
  )
}
