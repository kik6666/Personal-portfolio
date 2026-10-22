import { getCurrentAdminUser } from './auth.js'
import { requireSupabase } from './supabase.js'
import {
  AdminCertificatesError,
  createAdminCertificatesOperations,
} from './admin-certificates-core.js'

const CERTIFICATE_COLUMNS = 'id, title, issuer, issue_date, credential_url, pdf_path, preview_image_path, sort_order, is_published, created_at, updated_at'

function repository() {
  const client = () => requireSupabase()
  return {
    async list() {
      const { data, error } = await client()
        .from('certificates')
        .select(CERTIFICATE_COLUMNS)
        .order('sort_order', { ascending: true })
        .order('issue_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      if (!Array.isArray(data)) {
        throw new AdminCertificatesError('invalid-certificate-response', 'The certificate list response was invalid.')
      }
      return data
    },

    async getById(id) {
      const { data, error } = await client()
        .from('certificates')
        .select(CERTIFICATE_COLUMNS)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async insert(record) {
      const { data, error } = await client()
        .from('certificates')
        .insert(record)
        .select(CERTIFICATE_COLUMNS)
        .single()
      if (error) throw error
      if (!data) {
        throw new AdminCertificatesError('certificate-insert-unconfirmed', 'The database did not confirm the new certificate.')
      }
      return data
    },

    async update(id, fields) {
      const { data, error } = await client()
        .from('certificates')
        .update(fields)
        .eq('id', id)
        .select(CERTIFICATE_COLUMNS)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        throw new AdminCertificatesError('certificate-update-unconfirmed', 'The database did not confirm the certificate update.')
      }
      return data
    },

    async delete(id) {
      const { data, error } = await client()
        .from('certificates')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) {
        throw new AdminCertificatesError('certificate-delete-unconfirmed', 'The database did not confirm the certificate deletion.')
      }
    },

    async isAssetReferenced(path) {
      for (const column of ['pdf_path', 'preview_image_path']) {
        const { data, error } = await client()
          .from('certificates')
          .select('id')
          .eq(column, path)
          .limit(1)
        if (error) throw error
        if (!Array.isArray(data)) {
          throw new AdminCertificatesError('invalid-reference-response', 'The file reference check returned an invalid result.')
        }
        if (data.length > 0) return true
      }
      return false
    },
  }
}

const operations = createAdminCertificatesOperations({
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
      throw new AdminCertificatesError(
        'authentication-required',
        'Sign in with an administrator account to manage certificates.',
      )
    }
    return user
  },
})

export const listAdminCertificates = operations.list
export const saveAdminCertificate = operations.save
export const setAdminCertificatePublished = operations.setPublished
export const deleteAdminCertificate = operations.delete
export const retryAdminCertificateCleanup = operations.retryCleanup
