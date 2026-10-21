import { requireSupabase } from './supabase.js'

export class AuthServiceError extends Error {
  constructor(code, message, options) {
    super(message, options)
    this.name = 'AuthServiceError'
    this.code = code
  }
}

function authFailure(error, operation) {
  if (error?.status === 429) {
    return new AuthServiceError('rate-limited', 'Too many attempts. Please wait a few minutes and try again.', { cause: error })
  }

  if (error?.code === 'invalid_credentials' || /invalid login credentials/i.test(error?.message ?? '')) {
    return new AuthServiceError('invalid-credentials', 'The email or password is incorrect.', { cause: error })
  }

  return new AuthServiceError('auth-failure', `Unable to ${operation}. Please try again.`, { cause: error })
}

async function clearLocalSession(client) {
  const { error } = await client.auth.signOut({ scope: 'local' })
  if (error) {
    throw new AuthServiceError(
      'session-cleanup-failed',
      'The session could not be cleared. Close this page and try again.',
      { cause: error },
    )
  }
}

async function readRole(client, userId) {
  const { data, error } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new AuthServiceError(
      'role-check-failed',
      'Unable to verify administrator permissions. Please try again.',
      { cause: error },
    )
  }

  return data?.role ?? null
}

async function enforceAdminRole(client, userId) {
  let role
  try {
    role = await readRole(client, userId)
  } catch (error) {
    await clearLocalSession(client)
    throw error
  }

  if (role !== 'admin') {
    await clearLocalSession(client)
    throw new AuthServiceError(
      'not-admin',
      'This account does not have administrator access. You have been signed out.',
    )
  }
}

export async function signInAdmin(email, password) {
  const normalizedEmail = typeof email === 'string' ? email.trim() : ''
  if (!normalizedEmail || typeof password !== 'string' || !password) {
    throw new AuthServiceError('invalid-input', 'Enter your email address and password.')
  }

  const client = requireSupabase()
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (error) throw authFailure(error, 'sign in')
  if (!data.user) {
    await clearLocalSession(client)
    throw new AuthServiceError('auth-failure', 'Authentication did not return a user. Please try again.')
  }

  await enforceAdminRole(client, data.user.id)
  return data.user
}

export async function getCurrentAdminUser() {
  const client = requireSupabase()
  const session = await getCurrentSession()

  const user = session?.user
  if (!user) return null

  await enforceAdminRole(client, user.id)
  return user
}

export async function getCurrentSession() {
  const { data, error } = await requireSupabase().auth.getSession()
  if (error) throw authFailure(error, 'read the current session')
  return data.session
}

export async function signOut() {
  const client = requireSupabase()
  const { error } = await client.auth.signOut({ scope: 'local' })
  if (error) throw authFailure(error, 'sign out')
}

export async function sendPasswordRecovery(email) {
  const normalizedEmail = typeof email === 'string' ? email.trim() : ''
  if (!normalizedEmail) {
    throw new AuthServiceError('invalid-input', 'Enter the email address for your administrator account.')
  }

  const client = requireSupabase()
  const redirectTo = new URL('/admin/recovery/', window.location.origin).toString()
  const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })
  if (error) throw authFailure(error, 'request password recovery')
}

export async function updatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new AuthServiceError('invalid-input', 'Choose a password with at least 8 characters.')
  }

  const client = requireSupabase()
  const { data, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw authFailure(sessionError, 'read the recovery session')
  if (!data.session) {
    throw new AuthServiceError('missing-recovery-session', 'The recovery link is missing or has expired. Request a new one.')
  }

  const { error } = await client.auth.updateUser({ password })
  if (error) throw authFailure(error, 'update the password')
}

export function onAuthStateChange(callback) {
  const { data } = requireSupabase().auth.onAuthStateChange(callback)
  return data.subscription
}
