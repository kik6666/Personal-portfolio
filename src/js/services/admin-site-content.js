import { getCurrentAdminUser } from './auth.js'
import { requireSupabase } from './supabase.js'
import {
  AdminSiteContentError,
  createAdminSiteContentOperations,
  SITE_PROFILE_FIELDS,
} from './admin-site-content-core.js'

export { AdminSiteContentError, SITE_PROFILE_FIELDS }

function repository() {
  return {
    async list() {
      const { data, error } = await requireSupabase()
        .from('site_content')
        .select('key, value, is_public')
        .in('key', SITE_PROFILE_FIELDS.map(({ key }) => key))
      if (error) throw error
      return data
    },

    async upsert(record) {
      const { data, error } = await requireSupabase()
        .from('site_content')
        .upsert(record, { onConflict: 'key' })
        .select('key, value, is_public')
        .single()
      if (error) throw error
      return data
    },
  }
}

const operations = createAdminSiteContentOperations({
  repository: repository(),
  ensureAdmin: async () => {
    const user = await getCurrentAdminUser()
    if (!user) {
      throw new AdminSiteContentError(
        'authentication-required',
        'Sign in with an administrator account to manage site content.',
      )
    }
    return user
  },
})

export const listAdminSiteContent = operations.list
export const saveAdminSiteContent = operations.save
