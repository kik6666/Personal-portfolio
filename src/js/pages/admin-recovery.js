import {
  getCurrentSession,
  onAuthStateChange,
  signOut,
  updatePassword,
} from '../services/auth.js'
import { mountSite } from '../site.js'

mountSite('admin-login')

document.querySelector('#main-content').innerHTML = `
  <section class="auth-panel" aria-labelledby="recovery-title">
    <p class="eyebrow">Account security</p>
    <h1 id="recovery-title">Set a new password</h1>
    <p class="auth-intro">Use the secure recovery link sent by Supabase to update your administrator password.</p>
    <div id="recovery-feedback" class="auth-feedback" role="alert" aria-live="polite" hidden></div>
    <p id="recovery-checking" class="auth-help" role="status">Checking your recovery link…</p>
    <form id="password-form" class="auth-form" hidden>
      <div class="auth-field">
        <label for="new-password">New password</label>
        <input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="auth-field">
        <label for="confirm-password">Confirm new password</label>
        <input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <button class="btn btn-primary w-100" type="submit">Update password</button>
    </form>
    <p id="recovery-invalid" class="auth-help" hidden>
      This recovery link is missing, expired, or has already been used. Request a new link from
      <a href="/admin/login/">Admin Login</a>.
    </p>
    <p id="recovery-complete" class="auth-help" hidden>
      Your password has been updated. You can now sign in with your new password.
      <a href="/admin/login/">Go to Admin Login</a>.
    </p>
  </section>
`

const feedback = document.querySelector('#recovery-feedback')
const checking = document.querySelector('#recovery-checking')
const passwordForm = document.querySelector('#password-form')
const invalidMessage = document.querySelector('#recovery-invalid')
const completeMessage = document.querySelector('#recovery-complete')
const recoveryParams = new URLSearchParams(window.location.hash.slice(1))
const queryParams = new URLSearchParams(window.location.search)
const recoveryRedirect = recoveryParams.get('type') === 'recovery' || queryParams.has('code')
let recoveryEventReceived = false
const subscription = onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) {
    recoveryEventReceived = true
    showPasswordForm()
  }
})

function showFeedback(message, kind = 'error') {
  feedback.textContent = message
  feedback.dataset.kind = kind
  feedback.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  feedback.hidden = false
}

function showPasswordForm() {
  checking.hidden = true
  invalidMessage.hidden = true
  passwordForm.hidden = false
}

function showInvalidLink() {
  checking.hidden = true
  passwordForm.hidden = true
  invalidMessage.hidden = false
}

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  feedback.hidden = true

  const password = document.querySelector('#new-password').value
  const confirmation = document.querySelector('#confirm-password').value
  if (password !== confirmation) {
    showFeedback('The passwords do not match.')
    return
  }

  const submit = passwordForm.querySelector('button[type="submit"]')
  submit.disabled = true
  submit.textContent = 'Updating…'

  try {
    await updatePassword(password)
  } catch (error) {
    showFeedback(error.message || 'Unable to update the password. Request a new recovery link and try again.')
    submit.disabled = false
    submit.textContent = 'Update password'
    return
  }

  subscription.unsubscribe()
  checking.hidden = true
  passwordForm.hidden = true
  try {
    await signOut()
    completeMessage.hidden = false
  } catch (error) {
    showFeedback('Your password was updated, but this session could not be signed out. Close this page before signing in again.')
    completeMessage.hidden = false
  }
})

async function initializeRecoveryPage() {
  try {
    const session = await getCurrentSession()
    if (session && (recoveryEventReceived || recoveryRedirect)) {
      showPasswordForm()
      return
    }
    showInvalidLink()
  } catch (error) {
    showInvalidLink()
    showFeedback(error.message || 'Unable to verify the recovery link.')
  }
}

initializeRecoveryPage()
