import type { BuyerLens, ComparisonFact, CompetitorLens } from './scenarioComparison'

export interface ComparisonBriefItem {
  text: string
  factIds: string[]
}

export interface ComparisonBrief {
  summary: ComparisonBriefItem
  microsoftWinThemes: ComparisonBriefItem[]
  competitiveExposure: ComparisonBriefItem[]
  proofGaps: ComparisonBriefItem[]
  discoveryQuestions: ComparisonBriefItem[]
  model: string
}

export interface ComparisonBriefResponse {
  brief: ComparisonBrief
  remainingToday: number
  promptTokens: number
  completionTokens: number
}

export interface ComparisonAiStatus {
  enabled: boolean
  model: string | null
  dailyLimit: number
}

const item = (value: unknown, factIds: ReadonlySet<string>): ComparisonBriefItem => {
  if (!value || typeof value !== 'object') throw new Error('AI brief item is invalid.')
  const candidate = value as Partial<ComparisonBriefItem>
  if (
    typeof candidate.text !== 'string' ||
    !Array.isArray(candidate.factIds) ||
    candidate.factIds.some((id) => typeof id !== 'string' || !factIds.has(id))
  ) {
    throw new Error('AI brief item is invalid.')
  }
  return { text: candidate.text, factIds: candidate.factIds }
}

const items = (value: unknown, factIds: ReadonlySet<string>) => {
  if (!Array.isArray(value)) throw new Error('AI brief section is invalid.')
  return value.map((candidate) => item(candidate, factIds))
}

export function parseComparisonBriefResponse(
  value: unknown,
  facts: readonly ComparisonFact[],
): ComparisonBriefResponse {
  if (!value || typeof value !== 'object') throw new Error('AI brief response is invalid.')
  const response = value as Record<string, unknown>
  const brief = response.brief as Record<string, unknown> | undefined
  if (!brief || typeof response.remainingToday !== 'number') throw new Error('AI brief response is invalid.')
  const factIds = new Set(facts.map((fact) => fact.id))
  return {
    brief: {
      summary: item(brief.summary, factIds),
      microsoftWinThemes: items(brief.microsoftWinThemes, factIds),
      competitiveExposure: items(brief.competitiveExposure, factIds),
      proofGaps: items(brief.proofGaps, factIds),
      discoveryQuestions: items(brief.discoveryQuestions, factIds),
      model: typeof brief.model === 'string' ? brief.model : 'Foundry model',
    },
    remainingToday: response.remainingToday,
    promptTokens: typeof response.promptTokens === 'number' ? response.promptTokens : 0,
    completionTokens: typeof response.completionTokens === 'number' ? response.completionTokens : 0,
  }
}

const hash = (value: string) => {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

export function comparisonBriefCacheKey(
  buyerLens: BuyerLens,
  competitorLens: CompetitorLens,
  facts: readonly ComparisonFact[],
) {
  return `comparison-brief:${hash(JSON.stringify({ buyerLens, competitorLens, facts }))}`
}

export async function readComparisonAiStatus(): Promise<ComparisonAiStatus> {
  const response = await fetch('/api/comparison/explain', { cache: 'no-store' })
  if (!response.ok) throw new Error('AI comparison status is unavailable.')
  return await response.json() as ComparisonAiStatus
}

export async function requestComparisonBrief(
  buyerLens: BuyerLens,
  competitorLens: CompetitorLens,
  facts: readonly ComparisonFact[],
): Promise<ComparisonBriefResponse> {
  const response = await fetch('/api/comparison/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyerLens, competitorLens, facts }),
  })
  const value = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(value.error ?? 'AI explanation is unavailable.')
  return parseComparisonBriefResponse(value, facts)
}