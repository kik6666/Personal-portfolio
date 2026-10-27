import { getCurrentAdminUser } from './auth.js'
import { requireSupabase } from './supabase.js'
import {
  AdminProjectsError,
  createAdminProjectsOperations,
} from './admin-projects-core.js'

const PROJECT_COLUMNS = 'id, title, slug, description, technologies, preview_image_path, video_path, video_url, live_url, repository_url, completed_at, sort_order, is_published, created_by, created_at, updated_at'

function repository() {
  const client = () => requireSupabase()
  return {
    async list() {
      const { data, error } = await client()
        .from('projects')
        .select(PROJECT_COLUMNS)
        .order('sort_order', { ascending: true })
        .order('completed_at', { ascending: false, nullsFirst: false })
      if (error) throw error
      if (!Array.isArray(data)) {
        throw new AdminProjectsError('invalid-project-response', 'The project list response was invalid.')
      }
      return data
    },

    async getById(id) {
      const { data, error } = await client()
        .from('projects')
        .select(PROJECT_COLUMNS)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async insert(record) {
      const { data, error } = await client()
        .from('projects')
        .insert(record)
        .select(PROJECT_COLUMNS)
        .single()
      if (error) throw error
      if (!data) {
        throw new AdminProjectsError('project-insert-unconfirmed', 'The database did not confirm the new project.')
      }
      return data
    },

    async update(id, fields) {
      const { data, error } = await client()
        .from('projects')
        .update(fields)
        .eq('id', id)
        .select(PROJECT_COLUMNS)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        throw new AdminProjectsError('project-update-unconfirmed', 'The database did not confirm the project update.')
      }
      return data
    },

    async delete(id) {
      const { data, error } = await client()
        .from('projects')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) {
        throw new AdminProjectsError('project-delete-unconfirmed', 'The database did not confirm the project deletion.')
      }
    },

    async isAssetReferenced(path) {
      for (const column of ['preview_image_path', 'video_path']) {
        const { data, error } = await client()
          .from('projects')
          .select('id')
          .eq(column, path)
          .limit(1)
        if (error) throw error
        if (!Array.isArray(data)) {
          throw new AdminProjectsError('invalid-reference-response', 'The project file reference check returned an invalid result.')
        }
        if (data.length > 0) return true
      }
      return false
    },
  }
}

const operations = createAdminProjectsOperations({
  repository: repository(),
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
      throw new AdminProjectsError(
        'authentication-required',
        'Sign in with an administrator account to manage projects.',
      )
    }
    return user
  },
})

export const listAdminProjects = operations.list
export const saveAdminProject = operations.save
export const setAdminProjectPublished = operations.setPublished
export const deleteAdminProject = operations.delete
export const retryAdminProjectCleanup = operations.retryCleanup
