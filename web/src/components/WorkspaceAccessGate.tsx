import { useEffect, useRef, useState, type ReactNode } from 'react'
import { activateWorkspace, labStorage } from '../state/useLabStore'
import { clearWorkspaceBrowserData, GUIDED_ESTIMATE_STORAGE_KEY, isLocalWorkspace, setWorkspaceOwner, workspaceKey, workspaceOwnerFromPrincipal, WORKSPACE_STORAGE_KEY } from '../state/workspaceStorage'

export function WorkspaceAccessGate({ children }: { children: ReactNode }) {
  const local = isLocalWorkspace()
  const [status, setStatus] = useState<'checking' | 'ready' | 'legacy' | 'failed'>(local ? 'ready' : 'checking')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const owner = useRef<string | null>(null)
  const readyOwner = useRef<string | null>(null)
  useEffect(() => {
    if (local) return
    let active = true
    let controller: AbortController | undefined
    const verify = async () => {
      controller?.abort()
      const current = new AbortController()
      controller = current
      if (!readyOwner.current) setStatus('checking')
      try {
        const response = await fetch('/.auth/me', { cache: 'no-store', signal: AbortSignal.any([current.signal, AbortSignal.timeout(10_000)]) })
        if (!response.ok) throw new Error('Account verification is unavailable. Saved data remains locked.')
        const payload = await response.json() as { clientPrincipal?: unknown }
        const nextOwner = await workspaceOwnerFromPrincipal(payload.clientPrincipal)
        if (!active || current.signal.aborted) return
        if (owner.current && nextOwner !== owner.current) {
          setStatus('checking')
          window.location.reload()
          return
        }
        owner.current = nextOwner
        if (readyOwner.current === nextOwner) { setStatus('ready'); return }
        setWorkspaceOwner(nextOwner)
        let legacy = false
        try {
          legacy = !window.localStorage.getItem(workspaceKey(WORKSPACE_STORAGE_KEY)) && !!window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
        } catch {}
        if (legacy) { setStatus('legacy'); return }
        await activateWorkspace(nextOwner)
        if (!active || current.signal.aborted) return
        readyOwner.current = nextOwner
        setStatus('ready')
      } catch (failure) {
        if (!active || current.signal.aborted) return
        setError(failure instanceof Error ? failure.message : 'Account verification failed.')
        setStatus('failed')
      }
    }
    const foreground = () => { if (document.visibilityState === 'visible') void verify() }
    void verify()
    window.addEventListener('focus', foreground)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      active = false
      controller?.abort()
      window.removeEventListener('focus', foreground)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [local, retry])

  const continueWorkspace = async (importLegacy: boolean) => {
    setStatus('checking')
    try {
      if (!owner.current) throw new Error('Account verification is required.')
      if (importLegacy) {
        const legacy = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
        if (legacy) window.localStorage.setItem(workspaceKey(WORKSPACE_STORAGE_KEY), legacy)
        const guide = window.localStorage.getItem(GUIDED_ESTIMATE_STORAGE_KEY)
        if (guide) window.localStorage.setItem(workspaceKey(GUIDED_ESTIMATE_STORAGE_KEY), guide)
      }
      await activateWorkspace(owner.current)
      if (importLegacy) {
        if (labStorage.status.mode !== 'browser') throw new Error('Browser storage failed. The unassigned original has been preserved.')
        clearWorkspaceBrowserData(window.localStorage, '')
      }
      readyOwner.current = owner.current
      setStatus('ready')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Workspace restoration failed.')
      setStatus('failed')
    }
  }

  if (status === 'ready') return children
  return <main className="workspace-access" aria-label="Workspace access">
    <h1>Foundry Cost Lab</h1>
    {status === 'checking' ? <p role="status">Checking workspace access...</p> : null}
    {status === 'failed' ? <><p role="alert">{error}</p><button className="button button--primary" onClick={() => setRetry((value) => value + 1)}>Retry verification</button><a href="/.auth/login/aad">Sign in</a></> : null}
    {status === 'legacy' ? <>
      <h2>Unassigned browser workspace</h2>
      <p>Older data is shared across accounts in this browser profile. Import it only if it belongs to you. Imported estimates will be associated with this account; unassigned copies and cached summaries will be removed.</p>
      <button className="button button--primary" onClick={() => void continueWorkspace(false)}>Start separate workspace</button>
      <button className="button button--quiet" onClick={() => void continueWorkspace(true)}>Import my legacy workspace</button>
    </> : null}
  </main>
}