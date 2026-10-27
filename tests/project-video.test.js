import assert from 'node:assert/strict'
import test from 'node:test'
import { projectCard } from '../src/js/pages/projects-view.js'
import {
  buildProjectVideoEmbedUrl,
  normalizeProjectVideoUrl,
  resolveProjectVideoSource,
} from '../src/js/services/project-video.js'
import { createProjectVideoModalController } from '../src/js/services/project-video-modal.js'

const projectId = '8c84b1f1-3ddf-4f29-a8db-6bbab6e451a1'
const videoPath = `projects/${projectId}/video/13a7edc8-9133-4ec1-b3a9-80b495e44648.mp4`
const previewPath = `projects/${projectId}/preview/b92bfe14-cc2e-4d54-8a6d-c87e6cfe2143.webp`

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.attributes = new Map()
    this.listeners = new Map()
    this.classList = { add: (value) => this.attributes.set('class', value) }
    this.isConnected = true
    this._src = ''
    this._poster = ''
    this.paused = false
    this.loadCount = 0
    this.focusCount = 0
  }

  set src(value) {
    this._src = value
    this.attributes.set('src', value)
  }

  get src() {
    return this._src
  }

  set poster(value) {
    this._poster = value
    this.attributes.set('poster', value)
  }

  get poster() {
    return this._poster
  }

  set textContent(value) {
    this._text = String(value)
    this.children = []
  }

  get textContent() {
    return `${this._text ?? ''}${this.children.map((child) => (
      typeof child === 'string' ? child : child.textContent ?? ''
    )).join('')}`
  }

  append(...children) {
    this.children.push(...children)
  }

  replaceChildren(...children) {
    this.children = children
  }

  setAttribute(name, value) {
    this.attributes.set(name, value)
  }

  removeAttribute(name) {
    this.attributes.delete(name)
    if (name === 'src') this._src = ''
    if (name === 'poster') this._poster = ''
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) ?? []
    callbacks.push(callback)
    this.listeners.set(name, callbacks)
  }

  removeEventListener(name, callback) {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter((listener) => listener !== callback),
    )
  }

  dispatch(name) {
    for (const callback of this.listeners.get(name) ?? []) {
      callback({ type: name, currentTarget: this, target: this })
    }
  }

  pause() {
    this.paused = true
  }

  load() {
    this.loadCount += 1
  }

  focus() {
    this.focusCount += 1
  }

  querySelectorAll(selector) {
    const tagName = selector.toUpperCase()
    return this.children.flatMap((child) => (
      typeof child === 'string'
        ? []
        : [
          ...(child.tagName === tagName ? [child] : []),
          ...child.querySelectorAll(selector),
        ]
    ))
  }
}

function controllerFixture() {
  const modalElement = new FakeElement('div')
  const mediaContainer = new FakeElement('div')
  const titleElement = new FakeElement('h2')
  const errorElement = new FakeElement('p')
  const fallbackLink = new FakeElement('a')
  const modal = {
    calls: [],
    show(trigger) {
      this.calls.push(trigger)
    },
  }
  const controller = createProjectVideoModalController({
    modalElement,
    mediaContainer,
    titleElement,
    errorElement,
    fallbackLink,
    modal,
    resolveAssetUrl: (path) => `https://assets.example/${path}`,
    documentRef: { createElement: (tagName) => new FakeElement(tagName) },
  })
  return {
    controller,
    modalElement,
    mediaContainer,
    titleElement,
    errorElement,
    fallbackLink,
    modal,
  }
}

test('resolves valid MP4 paths through the public asset helper and uses a safe poster', () => {
  const calls = []
  const source = resolveProjectVideoSource({
    id: projectId,
    video_path: videoPath,
    video_url: null,
    preview_image_path: previewPath,
  }, (path) => {
    calls.push(path)
    return `https://assets.example/${path}`
  })

  assert.deepEqual(source, {
    kind: 'mp4',
    url: `https://assets.example/${videoPath}`,
    posterUrl: `https://assets.example/${previewPath}`,
  })
  assert.deepEqual(calls, [videoPath, previewPath])
})

test('returns no player source for projects without a valid video source', () => {
  const resolveAssetUrl = (path) => `https://assets.example/${path}`
  assert.equal(resolveProjectVideoSource({ id: projectId, video_path: null, video_url: null }, resolveAssetUrl), null)
  assert.equal(resolveProjectVideoSource({ id: projectId, video_path: 'unsafe/path.mp4' }, resolveAssetUrl), null)
  assert.equal(
    resolveProjectVideoSource({
      id: projectId,
      video_path: videoPath,
      video_url: 'https://youtu.be/AbCdEf12345',
    }, resolveAssetUrl),
    null,
  )
  assert.equal(
    resolveProjectVideoSource({ id: '00000000-0000-4000-8000-000000000000', video_path: videoPath }, resolveAssetUrl),
    null,
  )
  assert.equal(
    resolveProjectVideoSource({ id: projectId, video_path: videoPath }, () => 'javascript:alert(1)'),
    null,
  )
})

test('builds YouTube and Vimeo embed URLs only from recognized provider IDs', () => {
  assert.equal(
    normalizeProjectVideoUrl('https://youtu.be/AbCdEf12345?t=22'),
    'https://www.youtube.com/watch?v=AbCdEf12345',
  )
  assert.equal(
    buildProjectVideoEmbedUrl('https://www.youtube.com/watch?v=AbCdEf12345'),
    'https://www.youtube-nocookie.com/embed/AbCdEf12345',
  )
  assert.equal(
    buildProjectVideoEmbedUrl('https://player.vimeo.com/video/123456789'),
    'https://player.vimeo.com/video/123456789',
  )
  assert.equal(buildProjectVideoEmbedUrl('https://videos.example.test/embed/abc'), null)
  assert.equal(buildProjectVideoEmbedUrl('javascript:alert(1)'), null)

  const externalSource = resolveProjectVideoSource({
    id: projectId,
    video_path: null,
    video_url: 'https://vimeo.com/123456789',
  })
  assert.deepEqual(externalSource, {
    kind: 'external',
    embedUrl: 'https://player.vimeo.com/video/123456789',
    externalUrl: 'https://vimeo.com/123456789',
  })
})

test('renders Watch Video only for a project with a valid source and keeps ordinary project links', () => {
  const previousDocument = globalThis.document
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) }
  try {
    const onWatchVideo = () => {}
    const withVideo = projectCard({
      id: projectId,
      title: 'Video project',
      description: 'Project description.',
      technologies: ['JavaScript'],
      video_path: videoPath,
      video_url: null,
      live_url: 'https://example.test/demo',
      repository_url: 'https://github.com/example/project',
    }, (path) => path ? `https://assets.example/${path}` : null, onWatchVideo)
    const withoutVideo = projectCard({
      id: projectId,
      title: 'Sourdough Bakery',
      description: 'A project without a video.',
      technologies: ['HTML', 'CSS'],
      video_path: null,
      video_url: null,
      live_url: 'https://example.test/bakery',
      repository_url: 'https://github.com/example/bakery',
    }, () => null, onWatchVideo)

    assert.equal(withVideo.querySelectorAll('button').length, 1)
    assert.match(withVideo.querySelectorAll('button')[0].textContent, /Watch Video/)
    assert.equal(withVideo.querySelectorAll('a').length, 2)
    assert.equal(withoutVideo.querySelectorAll('button').length, 0)
    assert.equal(withoutVideo.querySelectorAll('a').length, 2)
  } finally {
    globalThis.document = previousDocument
  }
})

test('creates native MP4 playback only on open and stops, clears sources, and restores focus on close', () => {
  const fixture = controllerFixture()
  const trigger = new FakeElement('button')
  assert.equal(fixture.mediaContainer.children.length, 0)
  assert.equal(fixture.controller.open({
    id: projectId,
    title: 'Sofia',
    video_path: videoPath,
    video_url: null,
    preview_image_path: previewPath,
  }, trigger), true)

  const video = fixture.mediaContainer.children[0]
  assert.equal(video.tagName, 'VIDEO')
  assert.equal(video.src, `https://assets.example/${videoPath}`)
  assert.equal(video.poster, `https://assets.example/${previewPath}`)
  assert.equal(video.controls, true)
  assert.equal(video.playsInline, true)
  assert.equal(video.preload, 'none')
  assert.equal(video.attributes.has('autoplay'), false)
  assert.deepEqual(fixture.modal.calls, [trigger])
  assert.equal(fixture.titleElement.textContent, 'Sofia video')

  video.dispatch('error')
  assert.equal(fixture.errorElement.hidden, false)
  assert.match(fixture.errorElement.textContent, /unavailable/)

  fixture.modalElement.dispatch('hide.bs.modal')
  fixture.modalElement.dispatch('hidden.bs.modal')
  assert.equal(video.paused, true)
  assert.equal(video.src, '')
  assert.equal(video.loadCount, 1)
  assert.equal(fixture.mediaContainer.children.length, 0)
  assert.equal(fixture.errorElement.hidden, true)
  assert.equal(trigger.focusCount, 1)
})

test('creates the external iframe only on open and removes it when the dialog closes', () => {
  const fixture = controllerFixture()
  const trigger = new FakeElement('button')
  const project = {
    id: projectId,
    title: 'Terra',
    video_path: null,
    video_url: 'https://youtu.be/AbCdEf12345',
  }

  assert.equal(fixture.mediaContainer.children.length, 0)
  assert.equal(fixture.controller.open(project, trigger), true)
  const iframe = fixture.mediaContainer.children[0]
  assert.equal(iframe.tagName, 'IFRAME')
  assert.equal(iframe.src, 'https://www.youtube-nocookie.com/embed/AbCdEf12345')
  assert.equal(iframe.title, 'Terra video')
  assert.equal(iframe.loading, 'lazy')
  assert.equal(iframe.src.includes('autoplay'), false)
  assert.equal(fixture.fallbackLink.hidden, false)
  assert.equal(fixture.fallbackLink.href, 'https://www.youtube.com/watch?v=AbCdEf12345')

  fixture.modalElement.dispatch('hide.bs.modal')
  fixture.modalElement.dispatch('hidden.bs.modal')
  assert.equal(fixture.mediaContainer.children.length, 0)
  assert.equal(fixture.fallbackLink.hidden, true)
  assert.equal(trigger.focusCount, 1)
})

test('does not open the modal for an invalid or missing source', () => {
  const fixture = controllerFixture()
  assert.equal(fixture.controller.open({ id: projectId, title: 'Invalid', video_url: 'https://example.test/embed' }), false)
  assert.equal(fixture.modal.calls.length, 0)
  assert.equal(fixture.mediaContainer.children.length, 0)
})
