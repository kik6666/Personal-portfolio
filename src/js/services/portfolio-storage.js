import { getCurrentAdminUser } from './auth.js'
import { requireSupabase } from './supabase.js'
import {
  createPortfolioStorageOperations,
  PortfolioStorageError,
  PORTFOLIO_ASSET_MAX_BYTES,
  PORTFOLIO_ASSET_PURPOSES,
  validatePortfolioFile,
  createPortfolioAssetPath,
  isSafePortfolioAssetPath,
} from './portfolio-storage-core.js'

export {
  PortfolioStorageError,
  PORTFOLIO_ASSET_MAX_BYTES,
  PORTFOLIO_ASSET_PURPOSES,
  validatePortfolioFile,
  createPortfolioAssetPath,
  isSafePortfolioAssetPath,
}

const storageOperations = createPortfolioStorageOperations({
  getBucket: () => requireSupabase().storage.from('portfolio-assets'),
  ensureAdmin: async () => {
    const user = await getCurrentAdminUser()
    if (!user) {
      throw new PortfolioStorageError(
        'authentication-required',
        'Sign in with an administrator account before managing portfolio files.',
      )
    }
  },
})

export const uploadPortfolioAsset = storageOperations.upload
export const deletePortfolioAsset = storageOperations.remove
