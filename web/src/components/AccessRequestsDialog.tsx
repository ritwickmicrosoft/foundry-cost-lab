import * as Dialog from '@radix-ui/react-dialog'
import { Check, RefreshCw, ShieldCheck, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ClientPrincipal {
  userDetails: string
  userRoles: string[]
}

interface AccessRequest {
  requestId: string
  userDetails: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: string
  updatedAt: string
  decidedAt?: string
  emailDeliveryStatus?: 'not-configured' | 'pending' | 'sent' | 'failed'
  emailErrorCode?: string
}

const emailStatusLabel = (request: AccessRequest) => {
  if (request.emailDeliveryStatus === 'sent') return 'Approval email sent'
  if (request.emailDeliveryStatus === 'pending') return 'Approval email pending'
  if (request.emailDeliveryStatus === 'failed') {
    return `Approval email failed${request.emailErrorCode ? ` (${request.emailErrorCode})` : ''}; the requester page can still complete access`
  }
  if (request.emailDeliveryStatus === 'not-configured') return 'Approval email not configured; the requester page can still complete access'
  return null
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Access request API returned ${response.status}.`)
  return body as T
}

export function AccessRequestsDialog() {
  const [administrator, setAdministrator] = useState(false)
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const payload = await readJson<{ requests: AccessRequest[] }>(
        await fetch('/api/access/requests', { cache: 'no-store' }),
      )
      setRequests(payload.requests)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Access requests are unavailable.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const loadPrincipal = async () => {
      try {
        const response = await fetch('/.auth/me', { cache: 'no-store' })
        if (!response.ok) return
        const payload = await response.json() as { clientPrincipal?: ClientPrincipal | null }
        const isAdmin = payload.clientPrincipal?.userRoles?.includes('costlab-admin') ?? false
        if (!active) return
        setAdministrator(isAdmin)
        if (isAdmin) await refresh()
      } catch {
        if (active) setAdministrator(false)
      }
    }
    void loadPrincipal()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!administrator) return
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(timer)
  }, [administrator])

  if (!administrator) return null

  const pendingCount = requests.filter((request) => request.status === 'pending').length
  const decide = async (requestId: string, decision: 'approve' | 'reject') => {
    setDecidingId(requestId)
    try {
      await readJson(await fetch(`/api/access/requests/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      }))
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Access request decision failed.')
    } finally {
      setDecidingId(null)
    }
  }

  return (
    <Dialog.Root onOpenChange={(open) => { if (open) void refresh() }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="icon-button access-requests-trigger"
          aria-label={`Access requests${pendingCount ? `, ${pendingCount} pending` : ''}`}
          title="Access requests"
        >
          <ShieldCheck aria-hidden="true" />
          {pendingCount > 0 ? <span className="access-requests-trigger__count">{pendingCount}</span> : null}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog access-dialog" aria-describedby="access-requests-description">
          <div className="dialog__header">
            <div>
              <span className="eyebrow">Owner approval</span>
              <Dialog.Title>Access requests</Dialog.Title>
            </div>
            <div className="access-dialog__header-actions">
              <button
                type="button"
                className="icon-button"
                aria-label="Refresh access requests"
                title="Refresh"
                onClick={() => void refresh()}
              >
                <RefreshCw className={loading ? 'spin' : ''} aria-hidden="true" />
              </button>
              <Dialog.Close asChild>
                <button type="button" className="icon-button" aria-label="Close access requests">
                  <X aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
          </div>
          <Dialog.Description id="access-requests-description">
            Approval creates <code>costlab-user</code> access. The requester page completes the invitation automatically.
          </Dialog.Description>
          {error ? <div className="notice notice--warning">{error}</div> : null}
          <div className="access-request-list" aria-label="Access request queue">
            {requests.length === 0 && !loading ? (
              <div className="empty-state">No access requests.</div>
            ) : requests.map((request) => (
              <article className="access-request-row" key={request.requestId}>
                <div>
                  <strong>{request.userDetails}</strong>
                  <span>{request.reason || 'No business reason supplied.'}</span>
                  <small>
                    Requested {new Date(request.requestedAt).toLocaleString()} | {request.status}
                  </small>
                  {emailStatusLabel(request) ? <small>{emailStatusLabel(request)}</small> : null}
                </div>
                {request.status === 'pending' ? (
                  <div className="access-request-row__actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Approve ${request.userDetails}`}
                      title="Approve"
                      disabled={decidingId === request.requestId}
                      onClick={() => void decide(request.requestId, 'approve')}
                    >
                      <Check aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      aria-label={`Reject ${request.userDetails}`}
                      title="Reject"
                      disabled={decidingId === request.requestId}
                      onClick={() => void decide(request.requestId, 'reject')}
                    >
                      <XCircle aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <span className={`access-request-status access-request-status--${request.status}`}>
                    {request.status}
                  </span>
                )}
              </article>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}