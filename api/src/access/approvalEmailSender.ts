import { EmailClient, KnownEmailSendStatus, type EmailMessage } from '@azure/communication-email'
import type { TokenCredential } from '@azure/identity'
import { productionCredential } from '../storage/rateRepository.js'

export interface ApprovalEmailInput {
  recipient: string
  invitationUrl: string
  invitationExpiresOn: string
}

export interface ApprovalEmailSender {
  sendApprovalEmail(input: ApprovalEmailInput): Promise<string>
}

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

export function buildApprovalEmailMessage(
  input: ApprovalEmailInput,
  senderAddress: string,
  replyToAddress: string | null,
): EmailMessage {
  const invitationUrl = new URL(input.invitationUrl)
  if (invitationUrl.protocol !== 'https:') throw new Error('Approval email links must use HTTPS.')
  const applicationUrl = new URL('/', invitationUrl)
  const expiry = new Date(input.invitationExpiresOn)
  if (Number.isNaN(expiry.getTime())) throw new Error('Approval invitation expiry is invalid.')
  const formattedExpiry = expiry.toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Toronto',
    timeZoneName: 'short',
  })
  const safeInvitationUrl = escapeHtml(invitationUrl.toString())
  const safeAppUrl = escapeHtml(applicationUrl.toString())
  const subject = 'Welcome to Foundry Cost Lab - Access Approved'
  const plainText = [
    'Hello,',
    '',
    'Welcome to Foundry Cost Lab. Your access request has been approved.',
    '',
    'If the request page is still open, it will complete access automatically.',
    '',
    `Otherwise, complete access before ${formattedExpiry}:`,
    invitationUrl.toString(),
    '',
    'After completion, open Foundry Cost Lab:',
    applicationUrl.toString(),
    '',
    "I'd genuinely value your candid feedback - what works well, what feels confusing, and what could be improved. Your perspective will help me learn and continue improving the app so it better supports our team and Microsoft's success.",
    '',
    'Thank you for trying it out.',
    '',
    'Best,',
    'Ritwick',
  ].join('\n')
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f5f5f5;font-family:Segoe UI,Arial,sans-serif;color:#242424">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #dedede">
        <tr><td style="padding:24px 28px;border-top:4px solid #b11f4b">
          <div style="font-size:20px;font-weight:700;margin-bottom:4px">Foundry Cost Lab</div>
          <div style="font-size:11px;color:#5c5c5c;text-transform:uppercase">Estimate, not quote</div>
        </td></tr>
        <tr><td style="padding:4px 28px 28px">
          <h1 style="font-size:24px;margin:12px 0">Your access is approved</h1>
          <p style="line-height:1.55">Welcome to <strong>Foundry Cost Lab</strong>. Your access request has been approved.</p>
          <p style="line-height:1.55">If the request page is still open, it will complete access automatically. Otherwise, use this link before <strong>${escapeHtml(formattedExpiry)}</strong>.</p>
          <p style="margin:24px 0"><a href="${safeInvitationUrl}" style="display:inline-block;background:#b11f4b;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:4px;font-weight:700">Complete access</a></p>
          <p style="line-height:1.55">After completion, <a href="${safeAppUrl}" style="color:#8a1538">open Foundry Cost Lab</a>.</p>
          <p style="line-height:1.55">I'd genuinely value your candid feedback - what works well, what feels confusing, and what could be improved. Your perspective will help me learn and continue improving the app so it better supports our team and Microsoft's success.</p>
          <p style="line-height:1.55">Thank you for trying it out.</p>
          <p style="line-height:1.55">Best,<br>Ritwick</p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f5f5f5;color:#5c5c5c;font-size:12px">Use the same Microsoft account that submitted the access request.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  return {
    senderAddress,
    content: { subject, plainText, html },
    recipients: { to: [{ address: input.recipient }] },
    ...(replyToAddress
      ? { replyTo: [{ address: replyToAddress, displayName: 'Ritwick Dutta' }] }
      : {}),
    disableUserEngagementTracking: true,
  }
}

export class AcsApprovalEmailSender implements ApprovalEmailSender {
  private readonly client: EmailClient

  constructor(
    endpoint: string,
    private readonly senderAddress: string,
    private readonly replyToAddress: string | null,
    credential: TokenCredential = productionCredential(),
    private readonly sendTimeoutMs = 30_000,
  ) {
    this.client = new EmailClient(endpoint, credential)
  }

  async sendApprovalEmail(input: ApprovalEmailInput): Promise<string> {
    const poller = await this.client.beginSend(
      buildApprovalEmailMessage(
        input,
        this.senderAddress,
        this.replyToAddress,
      ),
      {
        abortSignal: AbortSignal.timeout(this.sendTimeoutMs),
        updateIntervalInMs: 2_000,
      },
    )
    const result = await poller.pollUntilDone()
    if (result.status !== KnownEmailSendStatus.Succeeded) {
      throw new Error(`Approval email delivery finished with status ${result.status}.`)
    }
    return result.id
  }
}

export function createApprovalEmailSender(): ApprovalEmailSender | null {
  const endpoint = process.env.ACCESS_EMAIL_ENDPOINT?.trim()
  const senderAddress = process.env.ACCESS_EMAIL_SENDER_ADDRESS?.trim()
  if (!endpoint || !senderAddress) return null
  return new AcsApprovalEmailSender(
    endpoint,
    senderAddress,
    process.env.ACCESS_EMAIL_REPLY_TO?.trim() || null,
  )
}