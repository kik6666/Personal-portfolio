import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyHomeVideoPoster,
  DEFAULT_HOME_VIDEO_POSTER,
  resolveHomeVideoPoster,
} from '../src/js/services/home-video-poster.js'
import { isSafePublicAssetPath } from '../src/js/services/storage-paths.js'

const posterPath = 'site-content/avatar/poster/13a7edc8-9133-4ec1-b3a9-80b495e44648.webp'

function safeAssetUrl(path) {
  return isSafePublicAssetPath(path) ? `https://assets.example/${path}` : null
}

test('resolves only safe bucket-relative Home poster paths', () => {
  assert.equal(isSafePublicAssetPath(posterPath), true)
  assert.equal(
    resolveHomeVideoPoster({ avatar_video_poster_path: posterPath }, safeAssetUrl),
    `https://assets.example/${posterPath}`,
  )
  for (const path of [
    '../private/poster.webp',
    '/site-content/avatar/poster/poster.webp',
    'site-content\\avatar\\poster\\poster.webp',
    'site-content/avatar/poster/poster.webp?download=1',
  ]) {
    assert.equal(isSafePublicAssetPath(path), false)
    assert.equal(
      resolveHomeVideoPoster({ avatar_video_poster_path: path }, safeAssetUrl),
      DEFAULT_HOME_VIDEO_POSTER,
    )
  }
})

test('uses the bundled poster when the published poster is missing or unresolved', () => {
  assert.equal(resolveHomeVideoPoster({}, safeAssetUrl), DEFAULT_HOME_VIDEO_POSTER)
  assert.equal(
    resolveHomeVideoPoster({ avatar_video_poster_path: posterPath }, () => null),
    DEFAULT_HOME_VIDEO_POSTER,
  )
})

test('applies the fallback poster without changing video source or playback controls', () => {
  const video = {
    poster: '',
    src: '/assets/bundled-introduction.mp4',
    controls: true,
    playsInline: true,
  }

  assert.equal(applyHomeVideoPoster(video, {}, safeAssetUrl), DEFAULT_HOME_VIDEO_POSTER)
  assert.equal(video.poster, DEFAULT_HOME_VIDEO_POSTER)
  assert.equal(video.src, '/assets/bundled-introduction.mp4')
  assert.equal(video.controls, true)
  assert.equal(video.playsInline, true)
})

test('does not alter the bundled video when a published poster is applied', () => {
  const video = {
    poster: DEFAULT_HOME_VIDEO_POSTER,
    src: '/assets/bundled-introduction.mp4',
    controls: true,
    playsInline: true,
  }

  applyHomeVideoPoster({ ...video }, {}, safeAssetUrl)
  const published = { ...video }
  applyHomeVideoPoster(published, { avatar_video_poster_path: posterPath }, safeAssetUrl)

  assert.equal(published.poster, `https://assets.example/${posterPath}`)
  assert.equal(published.src, video.src)
  assert.equal(published.controls, true)
  assert.equal(published.playsInline, true)
})
