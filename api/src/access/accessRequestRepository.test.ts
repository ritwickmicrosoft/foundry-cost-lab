import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileAccessRequestRepository, type AccessRequestRecord } from './accessRequestRepository.js'

const cleanupTasks: Array<() => Promise<void>> = []
afterEach(async () => {
  await Promise.all(cleanupTasks.splice(0).map((cleanup) => cleanup()))
})

const record = (requestId: string, updatedAt: string): AccessRequestRecord => ({
  schemaVersion: 1,
  requestId,
  identityProvider: 'aad',
  userId: `user-${requestId}`,
  userDetails: `${requestId}@example.com`,
  reason: 'Architecture review access',
  status: 'pending',
  requestedAt: updatedAt,
  updatedAt,
})

describe('access request repository', () => {
  it('writes, updates, reads, and lists records newest first', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'foundry-cost-access-'))
    cleanupTasks.push(() => rm(directory, { recursive: true, force: true }))
    const repository = new FileAccessRequestRepository(directory)
    const older = record('aaaaaaaaaaaaaaaaaaaaaaaa', '2026-08-23T10:00:00Z')
    const newer = record('bbbbbbbbbbbbbbbbbbbbbbbb', '2026-08-23T11:00:00Z')

    expect(await repository.read(older.requestId)).toBeNull()
    await repository.write(older)
    await repository.write(newer)
    await repository.write({ ...older, status: 'rejected', updatedAt: '2026-08-23T12:00:00Z' })

    expect((await repository.read(older.requestId))?.status).toBe('rejected')
    expect((await repository.list()).map(({ requestId }) => requestId)).toEqual([
      older.requestId,
      newer.requestId,
    ])
  })
})