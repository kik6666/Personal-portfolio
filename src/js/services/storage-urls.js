import { requireSupabase } from './supabase.js'

const PUBLIC_BUCKET = 'portfolio-assets'

// Builds a URL string for a file in the public bucket; it makes no network request.
export function getPublicAssetUrl(path) {
  if (typeof path !== 'string' || !path.trim() || path.includes('..')) return null
  const { data } = requireSupabase().storage.from(PUBLIC_BUCKET).getPublicUrl(path.trim())
  return data?.publicUrl ?? null
}
