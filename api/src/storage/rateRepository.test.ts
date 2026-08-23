import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fallbackRateCard } from '../fallbackRateCard.js'
import { FileRateRepository } from './rateRepository.js'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('FileRateRepository', () => {
  it('writes history before a separately promoted current card and reads newest history first', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'foundry-cost-rates-'))
    directories.push(directory)
    const repository = new FileRateRepository(directory)
    const first = { ...structuredClone(fallbackRateCard), asOf: '2026-08-19' }
    const second = { ...structuredClone(fallbackRateCard), asOf: '2026-08-20' }

    expect(await repository.readCurrent()).toBeNull()
    await repository.writeSnapshot(first)
    await repository.promote(first)
    await repository.writeSnapshot(second)
    await repository.promote(second)

    expect((await repository.readCurrent())?.asOf).toBe('2026-08-20')
    expect((await repository.readHistory(2)).map((card) => card.asOf)).toEqual(['2026-08-20', '2026-08-19'])
  })
})