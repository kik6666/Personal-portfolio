import { requireSupabase } from './supabase.js'
import { safeHttpUrl } from '../utils/safe-url.js'
import { SITE_MEDIA_KEYS } from './site-content-keys.js'
import { isSafePublicAssetPath } from './storage-paths.js'

const PUBLIC_BUCKET = 'portfolio-assets'

export { SITE_MEDIA_KEYS }

export function getPublicAssetUrl(path) {
  if (!isSafePublicAssetPath(path)) return null
  const { data } = requireSupabase().storage.from(PUBLIC_BUCKET).getPublicUrl(path.trim())
  return safeHttpUrl(data?.publicUrl)
}

export function getPublicSiteAssetUrl(siteContent, key) {
  return getPublicAssetUrl(siteContent?.[key])
}
