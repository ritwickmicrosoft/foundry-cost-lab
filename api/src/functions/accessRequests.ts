import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { AccessRequestService } from '../access/accessRequestService.js'
import { createAccessRequestRepository } from '../access/accessRequestRepository.js'
import { createStaticWebAppInvitationClient } from '../access/staticWebAppInvitationClient.js'
import { accessRequestId } from '../access/accessRequestService.js'
import { createApprovalEmailSender } from '../access/approvalEmailSender.js'
import { hasRole, isAuthenticated, parseClientPrincipal } from '../auth/clientPrincipal.js'

const noStore = { 'Cache-Control': 'no-store' }

const response = (status: number, jsonBody: unknown): HttpResponseInit => ({
  status,
  headers: noStore,
  jsonBody,
})

const service = () => new AccessRequestService(
  createAccessRequestRepository(),
  {
    createInvitation: (...arguments_) =>
      createStaticWebAppInvitationClient().createInvitation(...arguments_),
  },
  undefined,
  createApprovalEmailSender(),
)

export async function getOwnAccessRequest(request: HttpRequest): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(request)
  if (!isAuthenticated(principal)) return response(401, { error: 'Authentication is required.' })
  const record = await service().getOwn(principal)
  return record ? response(200, record) : response(404, { error: 'No access request exists.' })
}

export async function submitAccessRequest(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(request)
  if (!isAuthenticated(principal)) return response(401, { error: 'Authentication is required.' })
  try {
    const body = await request.json() as { reason?: unknown }
    const record = await service().submit(principal, body.reason)
    context.log(`ACCESS_REQUEST_PENDING ${JSON.stringify({ requestId: accessRequestId(principal), asOf: record.updatedAt })}`)
    return response(202, record)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Access request is invalid.'
    if (message.startsWith('Only Microsoft Entra ID') || message.startsWith('The authenticated account')) {
      return response(400, { error: message })
    }
    context.error('Access request persistence is unavailable.', error)
    return response(503, { error: 'Access request service is temporarily unavailable.' })
  }
}

export async function listAccessRequests(request: HttpRequest): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(request)
  if (!isAuthenticated(principal)) return response(401, { error: 'Authentication is required.' })
  if (!hasRole(principal, 'costlab-admin')) return response(403, { error: 'Administrator role is required.' })
  return response(200, { requests: await service().list() })
}

export async function decideAccessRequest(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(request)
  if (!isAuthenticated(principal)) return response(401, { error: 'Authentication is required.' })
  if (!hasRole(principal, 'costlab-admin')) return response(403, { error: 'Administrator role is required.' })
  try {
    const body = await request.json() as { decision?: unknown }
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      return response(400, { error: 'Decision must be approve or reject.' })
    }
    const requestId = request.params.requestId ?? ''
    const record = await service().decide(requestId, body.decision, principal)
    context.log(`ACCESS_REQUEST_DECIDED ${JSON.stringify({ requestId, decision: body.decision, asOf: record.updatedAt })}`)
    return response(200, record)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Access request decision failed.'
    if (message.includes('not found')) return response(404, { error: message })
    if (message.includes('ID is invalid')) return response(400, { error: message })
    context.error('Access request decision failed.', error)
    return response(503, { error: 'Unable to complete the access decision. Try again shortly.' })
  }
}

app.http('getOwnAccessRequest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'access/request',
  handler: getOwnAccessRequest,
})

app.http('submitAccessRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'access/request',
  handler: submitAccessRequest,
})

app.http('listAccessRequests', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'access/requests',
  handler: listAccessRequests,
})

app.http('decideAccessRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'access/requests/{requestId}',
  handler: decideAccessRequest,
})