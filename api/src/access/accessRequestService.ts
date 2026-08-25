import { createHash } from 'node:crypto'
import type { ClientPrincipal } from '../auth/clientPrincipal.js'
import type {
  AccessRequestRecord,
  AccessRequestRepository,
  AccessRequestStatus,
} from './accessRequestRepository.js'
import type { AccessInvitation } from './staticWebAppInvitationClient.js'
import type { ApprovalEmailSender } from './approvalEmailSender.js'

export interface RequesterAccessStatus {
  status: AccessRequestStatus
  reason: string
  requestedAt: string
  updatedAt: string
  invitationUrl?: string
  invitationExpiresOn?: string
  emailDeliveryStatus?: 'not-configured' | 'pending' | 'sent' | 'failed'
}

export interface AdminAccessRequest {
  requestId: string
  userDetails: string
  reason: string
  status: AccessRequestStatus
  requestedAt: string
  updatedAt: string
  decidedAt?: string
  emailDeliveryStatus?: 'not-configured' | 'pending' | 'sent' | 'failed'
  emailErrorCode?: string
}

export interface InvitationIssuer {
  createInvitation(userDetails: string, roles?: string, hoursToExpiration?: number): Promise<AccessInvitation>
}

export function accessRequestId(principal: ClientPrincipal): string {
  return createHash('sha256')
    .update(`${principal.identityProvider}:${principal.userId}`)
    .digest('hex')
    .slice(0, 24)
}

const normalizeReason = (reason: unknown) =>
  typeof reason === 'string' ? reason.trim().replace(/\s+/g, ' ').slice(0, 500) : ''

const requesterView = (record: AccessRequestRecord): RequesterAccessStatus => ({
  status: record.status,
  reason: record.reason,
  requestedAt: record.requestedAt,
  updatedAt: record.updatedAt,
  ...(record.status === 'approved' && record.invitationUrl && record.invitationExpiresOn
    ? {
        invitationUrl: record.invitationUrl,
        invitationExpiresOn: record.invitationExpiresOn,
        ...(record.emailDeliveryStatus ? { emailDeliveryStatus: record.emailDeliveryStatus } : {}),
      }
    : {}),
})

const adminView = (record: AccessRequestRecord): AdminAccessRequest => ({
  requestId: record.requestId,
  userDetails: record.userDetails,
  reason: record.reason,
  status: record.status,
  requestedAt: record.requestedAt,
  updatedAt: record.updatedAt,
  ...(record.decidedAt ? { decidedAt: record.decidedAt } : {}),
  ...(record.emailDeliveryStatus ? { emailDeliveryStatus: record.emailDeliveryStatus } : {}),
  ...(record.emailErrorCode ? { emailErrorCode: record.emailErrorCode } : {}),
})

export class AccessRequestService {
  constructor(
    private readonly repository: AccessRequestRepository,
    private readonly invitationIssuer: InvitationIssuer,
    private readonly now: () => Date = () => new Date(),
    private readonly approvalEmailSender: ApprovalEmailSender | null = null,
  ) {}

  private validateRequester(principal: ClientPrincipal) {
    if (principal.identityProvider !== 'aad') {
      throw new Error('Only Microsoft Entra ID accounts can request access.')
    }
    if (!principal.userDetails.includes('@') || principal.userDetails.length > 320) {
      throw new Error('The authenticated account did not provide an eligible email address.')
    }
  }

  async getOwn(principal: ClientPrincipal): Promise<RequesterAccessStatus | null> {
    const record = await this.repository.read(accessRequestId(principal))
    return record ? requesterView(record) : null
  }

  async submit(principal: ClientPrincipal, reason: unknown): Promise<RequesterAccessStatus> {
    this.validateRequester(principal)
    const requestId = accessRequestId(principal)
    const existing = await this.repository.read(requestId)
    if (existing?.status === 'pending') return requesterView(existing)
    if (
      existing?.status === 'approved' &&
      existing.invitationExpiresOn &&
      new Date(existing.invitationExpiresOn) > this.now()
    ) {
      return requesterView(existing)
    }

    const timestamp = this.now().toISOString()
    const record: AccessRequestRecord = {
      schemaVersion: 1,
      requestId,
      identityProvider: 'aad',
      userId: principal.userId,
      userDetails: principal.userDetails.trim().toLocaleLowerCase(),
      reason: normalizeReason(reason),
      status: 'pending',
      requestedAt: timestamp,
      updatedAt: timestamp,
    }
    await this.repository.write(record)
    return requesterView(record)
  }

  async list(): Promise<AdminAccessRequest[]> {
    return (await this.repository.list()).map(adminView)
  }

  async decide(
    requestId: string,
    decision: 'approve' | 'reject',
    administrator: ClientPrincipal,
  ): Promise<AdminAccessRequest> {
    if (!administrator.userRoles.includes('costlab-admin')) {
      throw new Error('Administrator role is required.')
    }
    if (!/^[a-f0-9]{24}$/.test(requestId)) throw new Error('Access request ID is invalid.')
    const record = await this.repository.read(requestId)
    if (!record) throw new Error('Access request was not found.')
    const timestamp = this.now().toISOString()

    if (decision === 'approve') {
      if (
        record.status === 'approved' &&
        record.invitationExpiresOn &&
        new Date(record.invitationExpiresOn) > this.now()
      ) {
        return adminView(record)
      }
      const hours = Number(process.env.ACCESS_INVITATION_HOURS ?? 24)
      const invitation = await this.invitationIssuer.createInvitation(
        record.userDetails,
        'costlab-user',
        Number.isFinite(hours) ? hours : 24,
      )
      Object.assign(record, {
        status: 'approved' as const,
        updatedAt: timestamp,
        decidedAt: timestamp,
        decidedByUserId: administrator.userId,
        invitationUrl: invitation.invitationUrl,
        invitationExpiresOn: invitation.expiresOn,
        emailDeliveryStatus: this.approvalEmailSender ? 'pending' as const : 'not-configured' as const,
        emailSentAt: undefined,
        emailOperationId: undefined,
        emailErrorCode: undefined,
      })
      await this.repository.write(record)
      if (this.approvalEmailSender) {
        try {
          const operationId = await this.approvalEmailSender.sendApprovalEmail({
            recipient: record.userDetails,
            invitationUrl: invitation.invitationUrl,
            invitationExpiresOn: invitation.expiresOn,
          })
          Object.assign(record, {
            emailDeliveryStatus: 'sent' as const,
            emailSentAt: this.now().toISOString(),
            emailOperationId: operationId,
            emailErrorCode: undefined,
          })
        } catch (error) {
          record.emailDeliveryStatus = 'failed'
          record.emailErrorCode =
            typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
              ? error.code.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80) || 'email-delivery-failed'
              : 'email-delivery-failed'
        }
      }
    } else {
      Object.assign(record, {
        status: 'rejected' as const,
        updatedAt: timestamp,
        decidedAt: timestamp,
        decidedByUserId: administrator.userId,
        invitationUrl: undefined,
        invitationExpiresOn: undefined,
        emailDeliveryStatus: undefined,
        emailSentAt: undefined,
        emailOperationId: undefined,
        emailErrorCode: undefined,
      })
    }
    await this.repository.write(record)
    return adminView(record)
  }
}