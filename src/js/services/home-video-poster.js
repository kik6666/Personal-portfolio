import { SITE_MEDIA_KEYS } from './site-content-keys.js'

export const DEFAULT_HOME_VIDEO_POSTER = '/assets/avatar-poster.svg'

export function resolveHomeVideoPoster(siteContent, resolveAssetUrl) {
  if (typeof resolveAssetUrl !== 'function') {
    throw new TypeError('Home video poster resolution requires an asset URL resolver.')
  }

  return resolveAssetUrl(siteContent?.[SITE_MEDIA_KEYS.avatarVideoPoster])
    || DEFAULT_HOME_VIDEO_POSTER
}

export function applyHomeVideoPoster(video, siteContent, resolveAssetUrl) {
  if (!video || typeof video !== 'object') {
    throw new TypeError('A video element is required to apply the Home poster.')
  }

  const poster = resolveHomeVideoPoster(siteContent, resolveAssetUrl)
  video.poster = poster
  return poster
}
