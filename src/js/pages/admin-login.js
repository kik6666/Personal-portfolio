import { getCurrentAdminUser, sendPasswordRecovery, signInAdmin, signOut } from '../services/auth.js'
import { mountSite } from '../site.js'

mountSite('admin-login')

document.querySelector('#main-content').innerHTML = `
  <section class="auth-panel" aria-labelledby="admin-login-title">
    <p class="eyebrow">Restricted access</p>
    <h1 id="admin-login-title">Admin Login</h1>
    <p class="auth-intro">Sign in with your administrator account to continue.</p>
    <div id="auth-feedback" class="auth-feedback" role="alert" aria-live="polite" hidden></div>

    <form id="login-form" class="auth-form">
      <div class="auth-field">
        <label for="login-email">Email address</label>
        <input id="login-email" name="email" type="email" autocomplete="username" required />
      </div>
      <div class="auth-field">
        <label for="login-password">Password</label>
        <input id="login-password" name="password" type="password" autocomplete="current-password" required />
      </div>
      <button class="btn btn-primary w-100" type="submit">Sign in</button>
      <button id="show-recovery" class="auth-text-button" type="button">Forgot your password?</button>
    </form>

    <form id="recovery-form" class="auth-form" hidden>
      <p class="auth-help">Enter the email address for your administrator account. If eligible, Supabase will send a recovery link.</p>
      <p class="auth-help">The recovery page must be allowed in Supabase Auth Redirect URLs before requesting a link.</p>
      <div class="auth-field">
        <label for="recovery-email">Email address</label>
        <input id="recovery-email" name="email" type="email" autocomplete="email" required />
      </div>
      <button class="btn btn-primary w-100" type="submit">Send recovery link</button>
      <button id="hide-recovery" class="auth-text-button" type="button">Back to sign in</button>
    </form>

    <section id="admin-verified" class="auth-verified" aria-live="polite" hidden>
      <span class="auth-verified-icon"><i class="bi bi-shield-check" aria-hidden="true"></i></span>
      <h2>Administrator access verified</h2>
      <p id="verified-email" class="auth-help"></p>
      <p class="auth-help">The Admin Dashboard will be available in a later step.</p>
      <button id="logout-button" class="btn btn-outline-primary" type="button">Sign out</button>
    </section>
  </section>
`

const feedback = document.querySelector('#auth-feedback')
const loginForm = document.querySelector('#login-form')
const recoveryForm = document.querySelector('#recovery-form')
const verifiedPanel = document.querySelector('#admin-verified')

function showFeedback(message, kind = 'error') {
  feedback.textContent = message
  feedback.dataset.kind = kind
  feedback.hidden = false
  feedback.setAttribute('role', kind === 'error' ? 'alert' : 'status')
}

function clearFeedback() {
  feedback.textContent = ''
  feedback.hidden = true
  delete feedback.dataset.kind
}

function showVerified(user) {
  clearFeedback()
  loginForm.hidden = true
  recoveryForm.hidden = true
  verifiedPanel.hidden = false
  document.querySelector('#verified-email').textContent = user.email ?? ''
}

function setFormPending(form, pending, buttonText) {
  const button = form.querySelector('button[type="submit"]')
  button.disabled = pending
  button.textContent = pending ? 'Please wait…' : buttonText
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  clearFeedback()
  setFormPending(loginForm, true, 'Sign in')

  try {
    const formData = new FormData(loginForm)
    const user = await signInAdmin(formData.get('email'), formData.get('password'))
    showVerified(user)
  } catch (error) {
    showFeedback(error.message || 'Unable to sign in. Please try again.')
  } finally {
    setFormPending(loginForm, false, 'Sign in')
  }
})

document.querySelector('#show-recovery').addEventListener('click', () => {
  clearFeedback()
  document.querySelector('#recovery-email').value = document.querySelector('#login-email').value
  loginForm.hidden = true
  recoveryForm.hidden = false
})

document.querySelector('#hide-recovery').addEventListener('click', () => {
  clearFeedback()
  recoveryForm.hidden = true
  loginForm.hidden = false
})

recoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  clearFeedback()
  setFormPending(recoveryForm, true, 'Send recovery link')

  try {
    const formData = new FormData(recoveryForm)
    await sendPasswordRecovery(formData.get('email'))
    showFeedback(
      'If an account can use password recovery, Supabase will send a link to that email address.',
      'success',
    )
  } catch (error) {
    showFeedback(error.message || 'Unable to request password recovery. Please try again.')
  } finally {
    setFormPending(recoveryForm, false, 'Send recovery link')
  }
})

document.querySelector('#logout-button').addEventListener('click', async () => {
  clearFeedback()
  try {
    await signOut()
    verifiedPanel.hidden = true
    loginForm.hidden = false
    loginForm.reset()
    showFeedback('You have been signed out.', 'success')
  } catch (error) {
    showFeedback(error.message || 'Unable to sign out. Please try again.')
  }
})

async function restoreAdminSession() {
  try {
    const user = await getCurrentAdminUser()
    if (user) showVerified(user)
  } catch (error) {
    showFeedback(error.message || 'Unable to verify administrator access.')
  }
}

restoreAdminSession()
