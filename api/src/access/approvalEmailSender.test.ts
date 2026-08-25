import { describe, expect, it } from 'vitest'
import { buildApprovalEmailMessage } from './approvalEmailSender.js'

const input = {
  recipient: 'requester@example.com',
  invitationUrl: 'https://foundry.example.test/accept?token=%3Cprivate%3E',
  invitationExpiresOn: '2026-08-24T12:00:00Z',
}

describe('approval email message', () => {
  it('includes automatic-completion guidance, fallback link, expiry, and feedback request', () => {
    const message = buildApprovalEmailMessage(
      input,
      'DoNotReply@example.azurecomm.net',
      'ritwickdutta@microsoft.com',
    )

    expect(message.content.subject).toBe('Welcome to Foundry Cost Lab - Access Approved')
    expect(message.content.plainText).toContain('https://foundry.example.test/')
    expect(message.content.plainText).toContain(input.invitationUrl)
    expect(message.content.plainText).toContain('Aug 24, 2026')
    expect(message.content.plainText).toContain('genuinely value your candid feedback')
    expect(message.content.html).toContain('Complete access')
    expect(message.content.html).not.toContain('<private>')
    expect(message.recipients.to).toEqual([{ address: input.recipient }])
    expect(message.replyTo).toEqual([{
      address: 'ritwickdutta@microsoft.com',
      displayName: 'Ritwick Dutta',
    }])
    expect(message.disableUserEngagementTracking).toBe(true)
  })

  it('rejects non-HTTPS links', () => {
    expect(() => buildApprovalEmailMessage(
      { ...input, invitationUrl: 'http://foundry.example.test/accept' },
      'DoNotReply@example.azurecomm.net',
      null,
    )).toThrow('must use HTTPS')
  })
})