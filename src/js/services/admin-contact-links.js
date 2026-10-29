import { getCurrentAdminUser } from './auth.js'
import { requireSupabase } from './supabase.js'
import {
  AdminContactLinksError,
  createAdminContactLinksOperations,
} from './admin-contact-links-core.js'

export { AdminContactLinksError }

const COLUMNS = 'id, label, link_type, url, icon_name, sort_order, is_public, created_at, updated_at'

function repository() {
  const client = () => requireSupabase()
  return {
    async list() {
      const { data, error } = await client()
        .from('contact_links')
        .select(COLUMNS)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },

    async insert(record) {
      const { data, error } = await client()
        .from('contact_links')
        .insert(record)
        .select(COLUMNS)
        .single()
      if (error) throw error
      return data
    },

    async update(id, fields) {
      const { data, error } = await client()
        .from('contact_links')
        .update(fields)
        .eq('id', id)
        .select(COLUMNS)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async delete(id) {
      const { data, error } = await client()
        .from('contact_links')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) {
        throw new AdminContactLinksError('delete-unconfirmed', 'The database did not confirm the contact link deletion.')
      }
    },
  }
}

const operations = createAdminContactLinksOperations({
  repository: repository(),
  ensureAdmin: async () => {
    const user = await getCurrentAdminUser()
    if (!user) {
      throw new AdminContactLinksError(
        'authentication-required',
        'Sign in with an administrator account to manage contact links.',
      )
    }
    return user
  },
})

export const listAdminContactLinks = operations.list
export const saveAdminContactLink = operations.save
export const setAdminContactLinkPublished = operations.setPublished
export const moveAdminContactLink = operations.move
export const deleteAdminContactLink = operations.delete
