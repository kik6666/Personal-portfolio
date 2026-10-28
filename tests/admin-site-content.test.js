import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AdminSiteContentError,
  createAdminSiteContentOperations,
  SITE_PROFILE_FIELDS,
  validateSiteContentChange,
} from '../src/js/services/admin-site-content-core.js'
import { resolveProfileWithFallback } from '../src/js/pages/home-content.js'
import { profile } from '../src/js/content.js'

function createFixture({ records = [], unauthorized = false, failKeys = [] } = {}) {
  const savedRecords = new Map(records.map((record) => [record.key, { ...record }]))
  const writes = []
  let adminChecks = 0
  const repository = {
    async list() {
      return [...savedRecords.values()].map((record) => ({ ...record }))
    },
    async upsert(record) {
      writes.push({ ...record })
      if (failKeys.includes(record.key)) throw new Error(`Could not save ${record.key}.`)
      const saved = { ...record }
      savedRecords.set(record.key, saved)
      return saved
    },
  }
  const operations = createAdminSiteContentOperations({
    repository,
    ensureAdmin: async () => {
      adminChecks += 1
      if (unauthorized) {
        throw new AdminSiteContentError('not-admin', 'Administrator access is required.')
      }
    },
  })

  return {
    operations,
    writes,
    get adminChecks() { return adminChecks },
    get records() { return [...savedRecords.values()] },
  }
}

test('loads an initially empty site_content table as an empty record map', async () => {
  const fixture = createFixture()

  assert.deepEqual(await fixture.operations.list(), {})
  assert.equal(fixture.adminChecks, 1)
  assert.deepEqual(fixture.writes, [])
})

test('defines only the three supported profile fields with bounded text lengths', () => {
  assert.deepEqual(SITE_PROFILE_FIELDS.map(({ key }) => key), [
    'full_name',
    'headline',
    'introduction',
  ])
  assert.equal(
    validateSiteContentChange({
      key: 'introduction',
      value: '  Plain text biography.  ',
      is_public: false,
    }).value,
    'Plain text biography.',
  )
})

test('rejects unsupported keys, non-text values, oversized values and empty published fields', () => {
  assert.throws(
    () => validateSiteContentChange({ key: 'not_allowed', value: 'Text', is_public: false }),
    { code: 'invalid-key' },
  )
  assert.throws(
    () => validateSiteContentChange({ key: 'full_name', value: { text: 'Name' }, is_public: false }),
    { code: 'invalid-value' },
  )
  assert.throws(
    () => validateSiteContentChange({ key: 'full_name', value: 'N'.repeat(121), is_public: false }),
    { code: 'value-too-long' },
  )
  assert.throws(
    () => validateSiteContentChange({ key: 'headline', value: '  ', is_public: true }),
    { code: 'empty-published-value' },
  )
})

test('requires administrator authorization before listing or writing', async () => {
  const fixture = createFixture({ unauthorized: true })

  await assert.rejects(fixture.operations.list(), { code: 'not-admin' })
  await assert.rejects(
    fixture.operations.save([{ key: 'full_name', value: 'Example', is_public: false }]),
    { code: 'not-admin' },
  )
  assert.equal(fixture.writes.length, 0)
  assert.equal(fixture.adminChecks, 2)
})

test('saves JSON-string-compatible values and draft/public transitions by key', async () => {
  const fixture = createFixture()
  const changes = [
    { key: 'full_name', value: 'Example Person', is_public: true },
    { key: 'headline', value: 'Role | Focus', is_public: false },
  ]

  const result = await fixture.operations.save(changes)

  assert.deepEqual(result, {
    saved: changes,
    failed: [],
  })
  assert.deepEqual(fixture.writes, changes)
  assert.equal(typeof fixture.writes[0].value, 'string')
  assert.deepEqual(await fixture.operations.list(), {
    full_name: changes[0],
    headline: changes[1],
  })
})

test('reports partial database failures while continuing other field saves', async () => {
  const fixture = createFixture({ failKeys: ['headline'] })

  const result = await fixture.operations.save([
    { key: 'full_name', value: 'Example Person', is_public: false },
    { key: 'headline', value: 'Role | Focus', is_public: true },
    { key: 'introduction', value: 'A short introduction.', is_public: true },
  ])

  assert.deepEqual(result.saved.map(({ key }) => key), ['full_name', 'introduction'])
  assert.deepEqual(result.failed, [{
    key: 'headline',
    message: 'Could not save headline.',
  }])
  assert.deepEqual(fixture.writes.map(({ key }) => key), ['full_name', 'headline', 'introduction'])
  assert.deepEqual(fixture.records.map(({ key }) => key), ['full_name', 'introduction'])
})

test('does not perform database writes when no fields were requested', async () => {
  const fixture = createFixture()

  assert.deepEqual(await fixture.operations.save([]), { saved: [], failed: [] })
  assert.deepEqual(fixture.writes, [])
  assert.equal(fixture.adminChecks, 1)
})

test('preserves static Business Card profile fallbacks when public content is missing or unpublished', () => {
  assert.deepEqual(resolveProfileWithFallback({}, profile), {
    name: profile.name,
    headline: profile.headline,
    introduction: profile.introduction,
  })
  assert.deepEqual(resolveProfileWithFallback({
    full_name: 'Published Name',
    headline: 'Published Role | Published Focus',
    introduction: 'Published introduction.',
  }, profile), {
    name: 'Published Name',
    headline: 'Published Role | Published Focus',
    introduction: 'Published introduction.',
  })
})

test('uses static fallback independently for missing published profile fields', () => {
  assert.deepEqual(resolveProfileWithFallback({ full_name: 'Published Name' }, profile), {
    name: 'Published Name',
    headline: profile.headline,
    introduction: profile.introduction,
  })
})
