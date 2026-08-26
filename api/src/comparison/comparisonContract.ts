export const BUYER_LENSES = ['executive', 'finance', 'security', 'architecture'] as const
export const COMPETITOR_LENSES = ['none', 'aws', 'google', 'databricks'] as const
export const FACT_CATEGORIES = ['economics', 'coverage', 'architecture', 'driver'] as const
export const SCENARIO_KEYS = ['A', 'B', 'C'] as const

export type BuyerLens = (typeof BUYER_LENSES)[number]
export type CompetitorLens = (typeof COMPETITOR_LENSES)[number]
export type FactCategory = (typeof FACT_CATEGORIES)[number]
export type ScenarioKey = (typeof SCENARIO_KEYS)[number]

export interface ComparisonFactInput {
  id: string
  category: FactCategory
  scenarioKeys: ScenarioKey[]
  text: string
}

export interface ComparisonExplainRequest {
  buyerLens: BuyerLens
  competitorLens: CompetitorLens
  facts: ComparisonFactInput[]
}

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

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && allowed.includes(value as T)

const parseFact = (value: unknown): ComparisonFactInput => {
  if (!value || typeof value !== 'object') throw new Error('Comparison fact is invalid.')
  const fact = value as Partial<ComparisonFactInput>
  if (
    typeof fact.id !== 'string' ||
    !/^[a-zA-Z0-9:._-]{3,120}$/.test(fact.id) ||
    !isOneOf(fact.category, FACT_CATEGORIES) ||
    !Array.isArray(fact.scenarioKeys) ||
    fact.scenarioKeys.length < 1 ||
    fact.scenarioKeys.length > 3 ||
    fact.scenarioKeys.some((key) => !isOneOf(key, SCENARIO_KEYS)) ||
    typeof fact.text !== 'string' ||
    fact.text.length < 5 ||
    fact.text.length > 300
  ) {
    throw new Error('Comparison fact is invalid.')
  }
  return {
    id: fact.id,
    category: fact.category,
    scenarioKeys: [...new Set(fact.scenarioKeys)],
    text: fact.text.replace(/[\r\n\t]+/g, ' ').trim(),
  }
}

export function parseComparisonExplainRequest(value: unknown): ComparisonExplainRequest {
  if (!value || typeof value !== 'object') throw new Error('Comparison request is invalid.')
  const request = value as Partial<ComparisonExplainRequest>
  if (
    !isOneOf(request.buyerLens, BUYER_LENSES) ||
    !isOneOf(request.competitorLens, COMPETITOR_LENSES) ||
    !Array.isArray(request.facts) ||
    request.facts.length < 6 ||
    request.facts.length > 24
  ) {
    throw new Error('Comparison request is invalid.')
  }
  const facts = request.facts.map(parseFact)
  if (new Set(facts.map((fact) => fact.id)).size !== facts.length) {
    throw new Error('Comparison fact IDs must be unique.')
  }
  if (facts.reduce((length, fact) => length + fact.text.length, 0) > 5_000) {
    throw new Error('Comparison request is too large.')
  }
  return { buyerLens: request.buyerLens, competitorLens: request.competitorLens, facts }
}

const parseItems = (
  value: unknown,
  allowedFactIds: ReadonlySet<string>,
  minimum: number,
  maximum: number,
  minimumCitations = 0,
): ComparisonBriefItem[] => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error('Comparison narrative section is invalid.')
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('Comparison narrative item is invalid.')
    const item = candidate as Partial<ComparisonBriefItem>
    if (
      typeof item.text !== 'string' ||
      item.text.length < 5 ||
      item.text.length > 500 ||
      !Array.isArray(item.factIds) ||
      item.factIds.length < minimumCitations ||
      item.factIds.length > 6 ||
      item.factIds.some((id) => typeof id !== 'string' || !allowedFactIds.has(id))
    ) {
      throw new Error('Comparison narrative item is invalid.')
    }
    return { text: item.text.trim(), factIds: [...new Set(item.factIds)] }
  })
}

export function parseComparisonBrief(
  value: unknown,
  request: ComparisonExplainRequest,
  model: string,
): ComparisonBrief {
  if (!value || typeof value !== 'object') throw new Error('Comparison narrative is invalid.')
  const brief = value as Record<string, unknown>
  const allowedFactIds = new Set(request.facts.map((fact) => fact.id))
  const summary = parseItems([brief.summary], allowedFactIds, 1, 1, 1)[0]!
  return {
    summary,
    microsoftWinThemes: parseItems(brief.microsoftWinThemes, allowedFactIds, 1, 4, 1),
    competitiveExposure: parseItems(brief.competitiveExposure, allowedFactIds, 1, 4, 1),
    proofGaps: parseItems(brief.proofGaps, allowedFactIds, 1, 4),
    discoveryQuestions: parseItems(brief.discoveryQuestions, allowedFactIds, 2, 5),
    model,
  }
}