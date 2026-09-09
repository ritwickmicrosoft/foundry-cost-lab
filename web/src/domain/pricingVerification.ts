import type { CostLine, CostResult, RateCard, RateVerification } from './types'

export function getRateVerification(rateCard: RateCard, rateKey: string): RateVerification | undefined {
  const rate = rateCard.rates[rateKey]
  if (!rate) return undefined
  if (rate.verification && rate.verification.status !== 'verified') return rate.verification
  if (rate.maintenance === 'synced' && (
    rateCard.unmatchedKeys?.includes(rateKey) || rate.asOf < rateCard.asOf
  )) {
    return {
      status: 'unmatched',
      checkedAt: rateCard.generatedAt ?? `${rateCard.asOf}T00:00:00Z`,
      reason: 'This snapshot retained an earlier Retail rate without a current verified match.',
    }
  }
  return rate.verification
}

export function usesLastKnownRate(line: CostLine): boolean {
  const status = line.provenance.verification?.status
  return line.amount !== null && line.provenance.maintenance === 'synced' &&
    (status === 'unmatched' || status === 'ambiguous')
}

export function getLastKnownRateLines(result: Pick<CostResult, 'lines'>): CostLine[] {
  return result.lines.filter(usesLastKnownRate)
}

export function getPricingCoverageSummary(result: Pick<CostResult, 'lines'>): string {
  const unpriced = result.lines.filter((line) => line.amount === null).length
  const lastKnown = getLastKnownRateLines(result).length
  const concerns = [
    ...(unpriced ? [`${unpriced} unpriced line${unpriced === 1 ? '' : 's'}`] : []),
    ...(lastKnown ? [`${lastKnown} last-known price line${lastKnown === 1 ? '' : 's'}`] : []),
  ]
  return concerns.length ? concerns.join('; ') : 'All active lines priced'
}