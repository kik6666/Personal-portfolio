export function isSafePublicAssetPath(path) {
  if (typeof path !== 'string') return false
  const value = path.trim()
  if (!value || value.startsWith('/') || value.includes('\\') || /[?#\u0000-\u001f]/.test(value)) return false

  return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
}
