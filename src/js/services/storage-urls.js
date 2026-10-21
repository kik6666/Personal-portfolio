import { requireSupabase } from './supabase.js'
import { safeHttpUrl } from '../utils/safe-url.js'

const PUBLIC_BUCKET = 'portfolio-assets'

export const SITE_MEDIA_KEYS = {
  avatarVideo: 'avatar_video_path',
  cvPdf: 'cv_pdf_path',
  cvPreviewImage: 'cv_preview_image_path',
  businessCardImage: 'business_card_image_path',
}

function isStoragePath(path) {
  if (typeof path !== 'string') return false
  const value = path.trim()
  if (!value || value.startsWith('/') || value.includes('\\') || /[?#\u0000-\u001f]/.test(value)) return false

  return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
}

export function getPublicAssetUrl(path) {
  if (!isStoragePath(path)) return null
  const { data } = requireSupabase().storage.from(PUBLIC_BUCKET).getPublicUrl(path.trim())
  return safeHttpUrl(data?.publicUrl)
}

export function getPublicSiteAssetUrl(siteContent, key) {
  return getPublicAssetUrl(siteContent?.[key])
}
