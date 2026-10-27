import { safeHttpUrl } from '../utils/safe-url.js'

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const PROJECT_VIDEO_PATH = new RegExp(
  `^projects/(${UUID_PATTERN})/video/${UUID_PATTERN}\\.mp4$`,
  'i',
)
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d{1,20}$/

export function normalizeProjectVideoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
      return null
    }

    const host = url.hostname.toLowerCase()
    let youtubeId = null
    if (host === 'youtu.be') {
      const match = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)
      youtubeId = match?.[1] ?? null
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') {
        const ids = url.searchParams.getAll('v')
        youtubeId = ids.length === 1 && YOUTUBE_ID.test(ids[0]) ? ids[0] : null
      } else {
        const match = /^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)
        youtubeId = match?.[1] ?? null
      }
    }
    if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
      return `https://www.youtube.com/watch?v=${youtubeId}`
    }

    let vimeoId = null
    if (host === 'vimeo.com' || host === 'www.vimeo.com') {
      const match = /^\/(\d{1,20})\/?$/.exec(url.pathname)
      vimeoId = match?.[1] ?? null
    } else if (host === 'player.vimeo.com') {
      const match = /^\/video\/(\d{1,20})\/?$/.exec(url.pathname)
      vimeoId = match?.[1] ?? null
    }
    return vimeoId && VIMEO_ID.test(vimeoId) ? `https://vimeo.com/${vimeoId}` : null
  } catch {
    return null
  }
}

export function buildProjectVideoEmbedUrl(value) {
  const normalizedUrl = normalizeProjectVideoUrl(value)
  if (!normalizedUrl) return null

  const url = new URL(normalizedUrl)
  if (url.hostname === 'www.youtube.com') {
    const videoId = url.searchParams.get('v')
    return YOUTUBE_ID.test(videoId ?? '')
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : null
  }

  const match = /^\/(\d{1,20})$/.exec(url.pathname)
  return url.hostname === 'vimeo.com' && match && VIMEO_ID.test(match[1])
    ? `https://player.vimeo.com/video/${match[1]}`
    : null
}

export function resolveProjectVideoSource(project, resolveAssetUrl) {
  if (!project || typeof project !== 'object') return null

  const path = project.video_path
  const externalUrl = project.video_url
  const hasPath = typeof path === 'string' && path.length > 0
  const hasExternalUrl = typeof externalUrl === 'string' && externalUrl.length > 0
  if (hasPath === hasExternalUrl) return null

  if (hasPath) {
    const match = PROJECT_VIDEO_PATH.exec(path)
    if (
      !match
      || typeof project.id !== 'string'
      || match[1].toLowerCase() !== project.id.toLowerCase()
      || typeof resolveAssetUrl !== 'function'
    ) {
      return null
    }

    const url = safeHttpUrl(resolveAssetUrl(path))
    if (!url) return null
    const posterUrl = typeof project.preview_image_path === 'string'
      ? safeHttpUrl(resolveAssetUrl(project.preview_image_path))
      : null
    return Object.freeze({ kind: 'mp4', url, posterUrl })
  }

  const normalizedUrl = normalizeProjectVideoUrl(externalUrl)
  const embedUrl = normalizedUrl ? buildProjectVideoEmbedUrl(normalizedUrl) : null
  if (!normalizedUrl || !embedUrl) return null
  return Object.freeze({
    kind: 'external',
    embedUrl,
    externalUrl: normalizedUrl,
  })
}
