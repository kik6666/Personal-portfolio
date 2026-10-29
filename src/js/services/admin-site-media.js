import { getCurrentAdminUser } from './auth.js'
import { requireSupabase } from './supabase.js'
import {
  AdminSiteMediaError,
  createAdminSiteMediaOperations,
  SITE_MEDIA_ITEMS,
} from './admin-site-media-core.js'

export { AdminSiteMediaError, SITE_MEDIA_ITEMS }

function repository() {
  const client = () => requireSupabase()
  return {
    async list(keys) {
      const { data, error } = await client()
        .from('site_content')
        .select('key, value, is_public, updated_at')
        .in('key', keys)
      if (error) throw error
      return data
    },

    async get(key) {
      const { data, error } = await client()
        .from('site_content')
        .select('key, value, is_public, updated_at')
        .eq('key', key)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async insert(record) {
      const { data, error } = await client()
        .from('site_content')
        .insert(record)
        .select('key, value, is_public, updated_at')
        .single()
      if (error) throw error
      return data
    },

    async update(current, record) {
      let query = client()
        .from('site_content')
        .update(record)
        .eq('key', current.key)
        .eq('value', JSON.stringify(current.value))
        .eq('is_public', current.is_public)
      if (current.updated_at) query = query.eq('updated_at', current.updated_at)
      const { data, error } = await query
        .select('key, value, is_public, updated_at')
        .maybeSingle()
      if (error) throw error
      if (!data) {
        throw new AdminSiteMediaError(
          'concurrent-update',
          'This media item changed after it was loaded. Reload it before saving to avoid overwriting another update.',
        )
      }
      return data
    },

    async delete(current) {
      let query = client()
        .from('site_content')
        .delete()
        .eq('key', current.key)
        .eq('value', JSON.stringify(current.value))
        .eq('is_public', current.is_public)
      if (current.updated_at) query = query.eq('updated_at', current.updated_at)
      const { data, error } = await query.select('key').maybeSingle()
      if (error) throw error
      return data?.key === current.key
    },

    async isAssetReferenced(path) {
      const { data: siteRows, error: siteError } = await client()
        .from('site_content')
        .select('value')
        .eq('value', JSON.stringify(path))
        .limit(1)
      if (siteError) throw siteError
      if (!Array.isArray(siteRows)) {
        throw new AdminSiteMediaError('reference-check-failed', 'Site media references could not be checked.')
      }
      if (siteRows.length) return true

      for (const [table, columns] of [
        ['projects', ['preview_image_path', 'video_path']],
        ['certificates', ['pdf_path', 'preview_image_path']],
      ]) {
        for (const column of columns) {
          const { data, error } = await client()
            .from(table)
            .select('id')
            .eq(column, path)
            .limit(1)
          if (error) throw error
          if (!Array.isArray(data)) {
            throw new AdminSiteMediaError(
              'reference-check-failed',
              'Portfolio media references could not be checked.',
            )
          }
          if (data.length) return true
        }
      }
      return false
    },
  }
}

const mediaRepository = repository()
const operations = createAdminSiteMediaOperations({
  repository: mediaRepository,
  storage: {
    async upload(options) {
      const { uploadPortfolioAsset } = await import('./portfolio-storage.js')
      return uploadPortfolioAsset(options)
    },
    async remove(options) {
      const { deletePortfolioAsset } = await import('./portfolio-storage.js')
      return deletePortfolioAsset(options)
    },
  },
  ensureAdmin: async () => {
    const user = await getCurrentAdminUser()
    if (!user) {
      throw new AdminSiteMediaError(
        'authentication-required',
        'Sign in with an administrator account to manage site media.',
      )
    }
    return user
  },
})

export const listAdminSiteMedia = operations.list
export const saveAdminSiteMedia = operations.save
export const removeAdminSiteMedia = operations.remove
export const cleanupUnreferencedSiteMedia = operations.cleanupUnreferenced
