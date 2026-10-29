import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AdminContactLinksError,
  createAdminContactLinksOperations,
} from '../src/js/services/admin-contact-links-core.js'
import {
  CONTACT_ICON_OPTIONS,
  normalizeContactEmail,
  normalizeContactUrl,
  validateContactLinkInput,
} from '../src/js/services/contact-links-validation.js'
import { resolveBusinessCardContacts } from '../src/js/services/contact-resolver.js'
import { renderContactCards, safeContactHref } from '../src/js/pages/home-content.js'

function createFixture({ records = [], unauthorized = false, failUpdateIds = [] } = {}) {
  const rows = new Map(records.map((record) => [record.id, { created_at: '2026-01-01', icon_name: 'link-45deg', ...record }]))
  const writes = []
  let adminChecks = 0
  let counter = 0
  const repository = {
    async list() {
      return [...rows.values()].map((row) => ({ ...row }))
    },
    async insert(record) {
      writes.push({ type: 'insert', record: { ...record } })
      if ([...rows.values()].some((row) => row.url === record.url)) {
        const error = new Error('duplicate key value violates unique constraint "contact_links_url_unique"')
        error.code = '23505'
        throw error
      }
      counter += 1
      const row = { id: `new-${counter}`, created_at: '2026-02-01', ...record }
      rows.set(row.id, row)
      return { ...row }
    },
    async update(id, fields) {
      writes.push({ type: 'update', id, fields: { ...fields } })
      if (failUpdateIds.includes(id)) throw new Error(`Could not update ${id}.`)
      const row = rows.get(id)
      if (!row) return null
      if (fields.url && [...rows.values()].some((other) => other.id !== id && other.url === fields.url)) {
        const error = new Error('duplicate key')
        error.code = '23505'
        throw error
      }
      Object.assign(row, fields)
      return { ...row }
    },
    async delete(id) {
      writes.push({ type: 'delete', id })
      if (!rows.delete(id)) throw new Error('not confirmed')
    },
  }
  const operations = createAdminContactLinksOperations({
    repository,
    ensureAdmin: async () => {
      adminChecks += 1
      if (unauthorized) throw new AdminContactLinksError('not-admin', 'Administrator access is required.')
    },
  })
  return { operations, writes, rows, get adminChecks() { return adminChecks } }
}

const link = (id, sort_order, extra = {}) => ({
  id,
  label: id,
  link_type: 'website',
  url: `https://${id}.example.com/`,
  sort_order,
  is_public: false,
  ...extra,
})

test('normalizes emails and rejects unsafe or malformed addresses', () => {
  assert.equal(normalizeContactEmail('  Name@Example.COM '), 'mailto:name@example.com')
  assert.equal(normalizeContactEmail('mailto:a@b.co'), 'mailto:a@b.co')
  for (const bad of ['', 'plain', 'a@b', 'a b@c.com', 'a@c.com?cc=x@y.com', 'a\n@c.com', '<x>@c.com']) {
    assert.throws(() => normalizeContactEmail(bad), { name: 'ContactLinkValidationError' }, bad)
  }
})

test('requires clean https URLs without credentials, control characters or unsafe schemes', () => {
  assert.equal(normalizeContactUrl(' https://example.com/me ', 'website'), 'https://example.com/me')
  const expectations = {
    'http://example.com': 'insecure-url',
    'javascript:alert(1)': 'insecure-url',
    'data:text/html,hi': 'insecure-url',
    'https://user:pw@example.com': 'credentials-in-url',
    'https://exa mple.com': 'invalid-url',
    'https://example.com/\u0007': 'invalid-url',
    'https://localhost': 'invalid-url',
    'not a url': 'invalid-url',
    '': 'value-required',
  }
  for (const [value, code] of Object.entries(expectations)) {
    assert.throws(() => normalizeContactUrl(value, 'website'), { code }, value)
  }
  assert.throws(() => normalizeContactUrl('https://example.com/x', 'linkedin'), { code: 'wrong-host' })
  assert.throws(() => normalizeContactUrl('https://evil-github.com/x', 'github'), { code: 'wrong-host' })
  assert.equal(normalizeContactUrl('https://www.linkedin.com/in/me', 'linkedin'), 'https://www.linkedin.com/in/me')
})

test('validates label, type and icon allowlist with defaults', () => {
  const ok = validateContactLinkInput({ label: ' Mail ', link_type: 'email', value: 'a@b.co' })
  assert.deepEqual({ ...ok }, { label: 'Mail', link_type: 'email', url: 'mailto:a@b.co', icon_name: 'envelope' })
  assert.ok(CONTACT_ICON_OPTIONS.includes('github'))
  assert.throws(() => validateContactLinkInput({ label: 'x', link_type: 'email', value: 'a@b.co', icon_name: 'x" onclick="y' }), { code: 'invalid-icon' })
  assert.throws(() => validateContactLinkInput({ label: '', link_type: 'email', value: 'a@b.co' }), { code: 'label-required' })
  assert.throws(() => validateContactLinkInput({ label: 'a\u0000b', link_type: 'email', value: 'a@b.co' }), { code: 'invalid-label' })
  assert.throws(() => validateContactLinkInput({ label: 'x'.repeat(61), link_type: 'email', value: 'a@b.co' }), { code: 'label-too-long' })
  assert.throws(() => validateContactLinkInput({ label: 'x', link_type: 'phone', value: '1' }), { code: 'invalid-type' })
})

test('requires administrator authorization for every operation and writes nothing when denied', async () => {
  const fixture = createFixture({ records: [link('a', 0)], unauthorized: true })
  const valid = { label: 'Mail', link_type: 'email', value: 'a@b.co' }
  await assert.rejects(fixture.operations.list(), { code: 'not-admin' })
  await assert.rejects(fixture.operations.save(valid), { code: 'not-admin' })
  await assert.rejects(fixture.operations.setPublished('a', true), { code: 'not-admin' })
  await assert.rejects(fixture.operations.move('a', 'down'), { code: 'not-admin' })
  await assert.rejects(fixture.operations.delete('a', { confirmed: true }), { code: 'not-admin' })
  assert.deepEqual(fixture.writes, [])
})

test('lists an initially empty table', async () => {
  const fixture = createFixture()
  assert.deepEqual(await fixture.operations.list(), [])
})

test('creates new links as drafts at the end and edits without changing publication or order', async () => {
  const fixture = createFixture({ records: [link('a', 3, { is_public: true })] })
  const created = await fixture.operations.save({ label: 'Mail', link_type: 'email', value: 'A@B.co', is_public: true })
  assert.equal(created.is_public, false)
  assert.equal(created.sort_order, 4)
  assert.equal(created.url, 'mailto:a@b.co')

  const edited = await fixture.operations.save({ id: 'a', label: 'Site', link_type: 'website', value: 'https://new.example.com' })
  assert.equal(edited.is_public, true)
  const update = fixture.writes.find((write) => write.type === 'update')
  assert.deepEqual(Object.keys(update.fields).sort(), ['icon_name', 'label', 'link_type', 'url'])
})

test('reports duplicate URLs gracefully for create and edit', async () => {
  const fixture = createFixture({ records: [link('a', 0), link('b', 1)] })
  await assert.rejects(
    fixture.operations.save({ label: 'Dup', link_type: 'website', value: 'https://a.example.com/' }),
    { code: 'duplicate-url' },
  )
  await assert.rejects(
    fixture.operations.save({ id: 'b', label: 'Dup', link_type: 'website', value: 'https://a.example.com/' }),
    { code: 'duplicate-url' },
  )
})

test('publishes and unpublishes, refusing to publish unsafe stored links', async () => {
  const fixture = createFixture({ records: [link('a', 0), link('bad', 1, { url: 'http://insecure.example.com/' })] })
  assert.equal((await fixture.operations.setPublished('a', true)).is_public, true)
  assert.equal((await fixture.operations.setPublished('a', false)).is_public, false)
  await assert.rejects(fixture.operations.setPublished('bad', true), { code: 'unsafe-published-link' })
  await assert.rejects(fixture.operations.setPublished('a', 'yes'), { code: 'invalid-publication-state' })
  await assert.rejects(fixture.operations.setPublished('missing', true), { code: 'not-found' })
  assert.equal(fixture.rows.get('bad').is_public, false)
})

test('reorders by swapping neighbours and ignores moves past the ends', async () => {
  const fixture = createFixture({ records: [link('a', 0), link('b', 1), link('c', 2)] })
  const result = await fixture.operations.move('c', 'up')
  assert.equal(result.moved, true)
  assert.deepEqual((await fixture.operations.list()).map(({ id }) => id), ['a', 'c', 'b'])
  assert.deepEqual(await fixture.operations.move('a', 'up'), { moved: false, updated: [], failed: [] })
})

test('resolves tied sort orders into a unique sequence when moving', async () => {
  const fixture = createFixture({ records: [link('a', 0), link('b', 0), link('c', 0)] })
  await fixture.operations.move('a', 'down')
  const orders = (await fixture.operations.list()).map(({ id, sort_order }) => `${id}:${sort_order}`)
  assert.deepEqual(orders, ['b:0', 'a:1', 'c:2'])
})

test('reports partial reorder failures instead of claiming success', async () => {
  const fixture = createFixture({ records: [link('a', 0), link('b', 1)], failUpdateIds: ['b'] })
  const result = await fixture.operations.move('a', 'down')
  assert.equal(result.moved, false)
  assert.deepEqual(result.failed.map(({ id }) => id), ['b'])
  assert.deepEqual(result.updated.map(({ id }) => id), ['a'])
})

test('requires explicit confirmation before deleting', async () => {
  const fixture = createFixture({ records: [link('a', 0), link('b', 1)] })
  await assert.rejects(fixture.operations.delete('a'), { code: 'confirmation-required' })
  assert.equal(fixture.rows.size, 2)
  await fixture.operations.delete('a', { confirmed: true })
  assert.deepEqual([...fixture.rows.keys()], ['b'])
})

test('public rendering only accepts https links and clean mailto addresses', () => {
  assert.equal(safeContactHref({ link_type: 'website', url: 'http://example.com' }), null)
  assert.equal(safeContactHref({ link_type: 'website', url: 'javascript:alert(1)' }), null)
  assert.equal(safeContactHref({ link_type: 'website', url: 'https://u:p@example.com/' }), null)
  assert.equal(safeContactHref({ link_type: 'website', url: 'https://example.com/' }), 'https://example.com/')
  assert.equal(safeContactHref({ link_type: 'email', url: 'mailto:a@b.co?cc=x@y.co' }), null)
  assert.equal(safeContactHref({ link_type: 'email', url: 'mailto:a@b.co' }), 'mailto:a@b.co')
})

const fallback = {
  emails: ['second@static.test', 'main@static.test'],
  linkedinUrl: 'https://www.linkedin.com/in/static',
}

test('Business Card uses static contacts when nothing is published', () => {
  assert.deepEqual(resolveBusinessCardContacts([], fallback), {
    emails: ['second@static.test', 'main@static.test'],
    linkedinUrl: 'https://www.linkedin.com/in/static',
    linkedinLabel: 'linkedin.com/in/static',
  })
})

test('Business Card prefers the first two published emails and first LinkedIn by order', () => {
  const links = [
    { link_type: 'email', url: 'mailto:third@x.test', sort_order: 5 },
    { link_type: 'email', url: 'mailto:first@x.test', sort_order: 1 },
    { link_type: 'linkedin', url: 'https://www.linkedin.com/in/later', sort_order: 9 },
    { link_type: 'linkedin', url: 'https://www.linkedin.com/in/earlier', sort_order: 2 },
    { link_type: 'email', url: 'mailto:second@x.test', sort_order: 2 },
  ]
  const result = resolveBusinessCardContacts(links, fallback)
  assert.deepEqual(result.emails, ['first@x.test', 'second@x.test'])
  assert.equal(result.linkedinUrl, 'https://www.linkedin.com/in/earlier')
})

test('Business Card fills missing slots from static values without duplicates or unsafe rows', () => {
  const links = [
    { link_type: 'email', url: 'mailto:MAIN@static.test', sort_order: 0 },
    { link_type: 'email', url: 'mailto:bad@x.test?cc=y@z.test', sort_order: 1 },
    { link_type: 'linkedin', url: 'http://www.linkedin.com/in/insecure', sort_order: 0 },
  ]
  const result = resolveBusinessCardContacts(links, fallback)
  assert.deepEqual(result.emails, ['MAIN@static.test', 'second@static.test'])
  assert.equal(result.linkedinUrl, fallback.linkedinUrl)
})

class FakeNode {
  constructor(tag) {
    this.tag = tag
    this.children = []
    this.attributes = {}
    this.className = ''
    this.textContent = ''
  }
  append(...items) { this.children.push(...items) }
  replaceChildren(...items) { this.children = items }
  setAttribute(name, value) { this.attributes[name] = value }
}

function renderHome(links) {
  const previous = globalThis.document
  globalThis.document = { createElement: (tag) => new FakeNode(tag) }
  try {
    const container = new FakeNode('div')
    const count = renderContactCards(container, links)
    const cards = container.children.map((column) => column.children[0])
    return { count, cards }
  } finally {
    globalThis.document = previous
  }
}

const publicRow = (label, url, link_type, sort_order, is_public = true) => ({
  label, url, link_type, sort_order, is_public, icon_name: 'link-45deg',
})

test('Home shows nothing (empty state) when no contact links are published', () => {
  assert.equal(renderHome([]).count, 0)
  assert.equal(renderHome([publicRow('Draft', 'https://d.example.com/', 'website', 0, false)]).count, 0)
})

test('Home shows a single published link with safe external attributes', () => {
  const { count, cards } = renderHome([publicRow('GitHub', 'https://github.com/me', 'github', 0)])
  assert.equal(count, 1)
  assert.equal(cards[0].href, 'https://github.com/me')
  assert.equal(cards[0].rel, 'noopener noreferrer')
  assert.equal(cards[0].target, '_blank')
})

test('Home shows exactly the published links in the order supplied and hides drafts', () => {
  const rows = [
    publicRow('Mail', 'mailto:me@example.com', 'email', 0),
    publicRow('Hidden', 'https://hidden.example.com/', 'website', 1, false),
    publicRow('LinkedIn', 'https://www.linkedin.com/in/me', 'linkedin', 2),
  ]
  const { count, cards } = renderHome(rows)
  assert.equal(count, 2)
  assert.deepEqual(cards.map((card) => card.href), ['mailto:me@example.com', 'https://www.linkedin.com/in/me'])
  assert.equal(cards[0].target, undefined)
})

test('Unpublishing a link removes it from Home on the next render', async () => {
  const fixture = createFixture({ records: [link('a', 0, { is_public: true }), link('b', 1, { is_public: true })] })
  assert.equal(renderHome(await fixture.operations.list()).count, 2)
  await fixture.operations.setPublished('a', false)
  const { cards } = renderHome(await fixture.operations.list())
  assert.deepEqual(cards.map((card) => card.href), ['https://b.example.com/'])
})
