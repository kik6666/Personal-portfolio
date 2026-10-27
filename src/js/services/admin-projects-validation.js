import { safeHttpUrl } from '../utils/safe-url.js'
import {
  PORTFOLIO_ASSET_PURPOSES,
  validatePortfolioFile,
} from './portfolio-storage-core.js'
import { normalizeProjectVideoUrl } from './project-video.js'

export { normalizeProjectVideoUrl } from './project-video.js'

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PROJECT_PREVIEW_PATH = new RegExp(
  `^projects/${UUID_PATTERN}/preview/${UUID_PATTERN}\\.(?:jpe?g|png|webp)$`,
  'i',
)
const PROJECT_VIDEO_PATH = new RegExp(
  `^projects/(${UUID_PATTERN})/video/${UUID_PATTERN}\\.mp4$`,
  'i',
)

export class ProjectValidationError extends Error {
  constructor(code, message, field = null) {
    super(message)
    this.name = 'ProjectValidationError'
    this.code = code
    this.field = field
  }
}

export function suggestProjectSlug(title) {
  if (typeof title !== 'string') return ''
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function validateProjectPreviewPath(path) {
  if (path === null || path === undefined || path === '') return null
  if (
    typeof path !== 'string'
    || path.trim() !== path
    || path.includes('\\')
    || /[?#\u0000-\u001f]/.test(path)
    || !PROJECT_PREVIEW_PATH.test(path)
  ) {
    throw new ProjectValidationError(
      'invalid-preview-path',
      'The existing project preview path is invalid.',
      'previewFile',
    )
  }
  return path
}

function validateProjectVideoPath(path, projectId) {
  if (path === null || path === undefined || path === '') return null
  const match = typeof path === 'string' ? PROJECT_VIDEO_PATH.exec(path) : null
  if (
    !match
    || path.trim() !== path
    || path.includes('\\')
    || /[?#\u0000-\u001f]/.test(path)
    || typeof projectId !== 'string'
    || match[1].toLowerCase() !== projectId.toLowerCase()
  ) {
    throw new ProjectValidationError(
      'invalid-video-path',
      'The existing project video path is invalid.',
      'videoFile',
    )
  }
  return path
}

export function validateProjectVideoFile(file) {
  if (!file) return
  try {
    validatePortfolioFile(file, PORTFOLIO_ASSET_PURPOSES.projectVideo)
  } catch (error) {
    throw new ProjectValidationError(
      error?.code || 'invalid-video-file',
      error?.message || 'Choose a valid MP4 video file.',
      'videoFile',
    )
  }
}

function validateProjectVideoSelection(values, {
  projectId,
  currentVideoPath = null,
  hasVideoFile = false,
} = {}) {
  const currentPath = validateProjectVideoPath(currentVideoPath, projectId)
  const source = values?.videoSource ?? 'none'

  if (!['none', 'upload', 'external'].includes(source)) {
    throw new ProjectValidationError(
      'invalid-video-source',
      'Choose no video, an MP4 upload, or an external video URL.',
      'videoSource',
    )
  }
  if (hasVideoFile && source !== 'upload') {
    throw new ProjectValidationError(
      'unexpected-video-file',
      'Choose MP4 upload as the video source to use the selected file.',
      'videoFile',
    )
  }

  if (source === 'upload') {
    if (hasVideoFile) return { video_path: null, video_url: null }
    if (currentPath) return { video_path: currentPath, video_url: null }
    throw new ProjectValidationError(
      'video-file-required',
      'Choose an MP4 file for this video source.',
      'videoFile',
    )
  }

  if (source === 'external') {
    const urlValue = typeof values?.videoUrl === 'string' ? values.videoUrl.trim() : ''
    const videoUrl = normalizeProjectVideoUrl(urlValue)
    if (!videoUrl) {
      throw new ProjectValidationError(
        'invalid-video-url',
        'Enter a supported HTTPS YouTube or Vimeo video URL.',
        'videoUrl',
      )
    }
    return { video_path: null, video_url: videoUrl }
  }

  return { video_path: null, video_url: null }
}

function parseTechnologies(value) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const technologies = []
  const seen = new Set()
  for (const entry of entries) {
    if (typeof entry !== 'string') {
      throw new ProjectValidationError(
        'invalid-technologies',
        'Enter technologies as comma-separated text.',
        'technologies',
      )
    }
    const technology = entry.trim()
    const key = technology.toLowerCase()
    if (technology && !seen.has(key)) {
      technologies.push(technology)
      seen.add(key)
    }
  }
  return technologies
}

export function validateProjectForm(values, {
  previewImagePath = null,
  projectId = null,
  currentVideoPath = null,
  hasVideoFile = false,
} = {}) {
  const title = typeof values?.title === 'string' ? values.title.trim() : ''
  if (!title) {
    throw new ProjectValidationError('title-required', 'Enter a project title.', 'title')
  }

  const slug = typeof values?.slug === 'string' ? values.slug.trim() : ''
  if (!slug) {
    throw new ProjectValidationError('slug-required', 'Enter a project slug.', 'slug')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ProjectValidationError(
      'invalid-slug',
      'Use lowercase letters and numbers separated by single hyphens.',
      'slug',
    )
  }

  const description = typeof values?.description === 'string' ? values.description.trim() : ''
  if (!description) {
    throw new ProjectValidationError(
      'description-required',
      'Enter a project description.',
      'description',
    )
  }

  const liveUrlValue = typeof values?.liveUrl === 'string' ? values.liveUrl.trim() : ''
  const liveUrl = liveUrlValue ? safeHttpUrl(liveUrlValue) : null
  if (liveUrlValue && !liveUrl) {
    throw new ProjectValidationError(
      'invalid-live-url',
      'Enter a valid HTTP or HTTPS Live Demo URL.',
      'liveUrl',
    )
  }

  const repositoryUrlValue = typeof values?.repositoryUrl === 'string'
    ? values.repositoryUrl.trim()
    : ''
  const repositoryUrl = repositoryUrlValue ? safeHttpUrl(repositoryUrlValue) : null
  if (repositoryUrlValue && !repositoryUrl) {
    throw new ProjectValidationError(
      'invalid-repository-url',
      'Enter a valid HTTP or HTTPS GitHub Repository URL.',
      'repositoryUrl',
    )
  }

  const completedAtValue = typeof values?.completedAt === 'string'
    ? values.completedAt.trim()
    : ''
  let completedAt = null
  if (completedAtValue) {
    const parsedDate = new Date(`${completedAtValue}T00:00:00.000Z`)
    if (
      !DATE_PATTERN.test(completedAtValue)
      || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== completedAtValue
    ) {
      throw new ProjectValidationError(
        'invalid-completed-date',
        'Enter a valid completion date.',
        'completedAt',
      )
    }
    completedAt = completedAtValue
  }

  const sortOrderValue = values?.sortOrder === '' || values?.sortOrder === undefined
    ? 0
    : Number(values.sortOrder)
  if (!Number.isSafeInteger(sortOrderValue) || sortOrderValue < 0) {
    throw new ProjectValidationError(
      'invalid-sort-order',
      'Display order must be a non-negative whole number.',
      'sortOrder',
    )
  }

  const safePreviewPath = validateProjectPreviewPath(previewImagePath)
  const video = validateProjectVideoSelection(values, {
    projectId,
    currentVideoPath,
    hasVideoFile,
  })
  return Object.freeze({
    title,
    slug,
    description,
    technologies: parseTechnologies(values?.technologies),
    preview_image_path: safePreviewPath,
    live_url: liveUrl,
    repository_url: repositoryUrl,
    video_path: video.video_path,
    video_url: video.video_url,
    completed_at: completedAt,
    sort_order: sortOrderValue,
  })
}

export function validateProjectPreviewFile(file) {
  if (file) {
    try {
      validatePortfolioFile(file, PORTFOLIO_ASSET_PURPOSES.projectPreview)
    } catch (error) {
      throw new ProjectValidationError(
        error?.code || 'invalid-preview-file',
        error?.message || 'Choose a valid project preview image.',
        'previewFile',
      )
    }
  }
}
