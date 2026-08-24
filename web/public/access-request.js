(() => {
  const identity = document.querySelector('#identity')
  const status = document.querySelector('#status')
  const form = document.querySelector('#request-form')
  const reason = document.querySelector('#reason')
  const submit = document.querySelector('#submit')
  const accept = document.querySelector('#accept')
  const refresh = document.querySelector('#refresh')

  const setStatus = (message, state) => {
    status.textContent = message
    status.dataset.state = state || ''
    status.hidden = false
  }

  const render = (request) => {
    accept.hidden = true
    form.hidden = request?.status === 'pending' || request?.status === 'approved'
    if (!request) {
      status.hidden = true
      form.hidden = false
      return
    }
    if (request.status === 'pending') {
      setStatus('Your request is pending owner approval. Refresh this page after the owner approves it.', 'pending')
      return
    }
    if (request.status === 'approved' && request.invitationUrl) {
      setStatus(`Approved. Accept the invitation before ${new Date(request.invitationExpiresOn).toLocaleString()}.`, 'approved')
      accept.href = request.invitationUrl
      accept.hidden = false
      return
    }
    setStatus('Your previous request was not approved. You may submit a new request with updated context.', 'rejected')
    form.hidden = false
  }

  const getPrincipal = async () => {
    const response = await fetch('/.auth/me', { cache: 'no-store' })
    if (!response.ok) throw new Error('Unable to read the authenticated account.')
    const payload = await response.json()
    return payload.clientPrincipal
  }

  const load = async () => {
    try {
      const principal = await getPrincipal()
      if (!principal) {
        location.assign('/.auth/login/aad?post_login_redirect_uri=/request-access.html')
        return
      }
      identity.textContent = `Signed in as ${principal.userDetails}`
      if (principal.userRoles?.includes('costlab-user')) {
        location.assign('/')
        return
      }
      const response = await fetch('/api/access/request', { cache: 'no-store' })
      if (response.status === 404) {
        render(null)
        return
      }
      if (!response.ok) throw new Error('Unable to retrieve your access request.')
      render(await response.json())
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Access status is unavailable.', 'error')
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    submit.disabled = true
    try {
      const response = await fetch('/api/access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.value }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Access request failed.')
      render(body)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Access request failed.', 'error')
    } finally {
      submit.disabled = false
    }
  })

  refresh.addEventListener('click', () => void load())
  void load()
  setInterval(() => void load(), 30000)
})()