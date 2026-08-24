import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientPrincipal } from '../auth/clientPrincipal.js'
import { FileAccessRequestRepository } from './accessRequestRepository.js'
import { accessRequestId, AccessRequestService } from './accessRequestService.js'

const cleanupTasks: Array<() => Promise<void>> = []
afterEach(async () => {
  await Promise.all(cleanupTasks.splice(0).map((cleanup) => cleanup()))
})

const principal = (overrides: Partial<ClientPrincipal> = {}): ClientPrincipal => ({
  identityProvider: 'aad',
  userId: 'requester-user-id',
  userDetails: 'Requester@Example.com',
  userRoles: ['anonymous', 'authenticated'],
  ...overrides,
})

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'foundry-cost-access-service-'))
  cleanupTasks.push(() => rm(directory, { recursive: true, force: true }))
  const repository = new FileAccessRequestRepository(directory)
  const createInvitation = vi.fn(async () => ({
    invitationUrl: 'https://foundry.example.test/?invite=token',
    expiresOn: '2026-08-24T12:00:00Z',
  }))
  const service = new AccessRequestService(
    repository,
    { createInvitation },
    () => new Date('2026-08-23T12:00:00Z'),
  )
  return { repository, createInvitation, service }
}

describe('access request workflow', () => {
  it('creates one normalized pending request for an authenticated AAD user', async () => {
    const { repository, service } = await setup()
    const requester = principal()

    await expect(service.submit(requester, '  Architecture   review access  ')).resolves.toEqual({
      status: 'pending',
      reason: 'Architecture review access',
      requestedAt: '2026-08-23T12:00:00.000Z',
      updatedAt: '2026-08-23T12:00:00.000Z',
    })
    await service.submit(requester, 'Repeated request')

    const stored = await repository.read(accessRequestId(requester))
    expect(stored?.userDetails).toBe('requester@example.com')
    expect(stored?.reason).toBe('Architecture review access')
    expect(await repository.list()).toHaveLength(1)
  })

  it('approves with a short-lived invitation visible only to the requester view', async () => {
    const { createInvitation, service } = await setup()
    const requester = principal()
    const administrator = principal({
      userId: 'admin-user-id',
      userDetails: 'admin@example.com',
      userRoles: ['authenticated', 'costlab-user', 'costlab-admin'],
    })
    await service.submit(requester, 'Need access')

    const adminResult = await service.decide(accessRequestId(requester), 'approve', administrator)
    const requesterResult = await service.getOwn(requester)

    expect(createInvitation).toHaveBeenCalledWith('requester@example.com', 'costlab-user', 24)
    expect(adminResult).not.toHaveProperty('invitationUrl')
    expect(requesterResult).toMatchObject({
      status: 'approved',
      invitationUrl: 'https://foundry.example.test/?invite=token',
      invitationExpiresOn: '2026-08-24T12:00:00Z',
    })
    expect((await service.list())[0]).not.toHaveProperty('invitationUrl')
    await service.decide(accessRequestId(requester), 'approve', administrator)
    expect(createInvitation).toHaveBeenCalledTimes(1)
  })

  it('rejects requests and fails closed for non-AAD requesters', async () => {
    const { service } = await setup()
    const requester = principal()
    const administrator = principal({
      userId: 'admin-user-id',
      userRoles: ['authenticated', 'costlab-admin'],
    })
    await service.submit(requester, '')

    await expect(service.decide(accessRequestId(requester), 'reject', administrator)).resolves.toMatchObject({
      status: 'rejected',
    })
    await expect(service.submit(principal({ identityProvider: 'github' }), '')).rejects.toThrow(
      'Only Microsoft Entra ID accounts',
    )
    await expect(service.decide(
      accessRequestId(requester),
      'approve',
      principal({ userRoles: ['authenticated'] }),
    )).rejects.toThrow('Administrator role is required')
  })
})