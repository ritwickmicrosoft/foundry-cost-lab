import type { ComparisonBrief, ComparisonExplainRequest } from './comparisonContract.js'
import { parseComparisonExplainRequest } from './comparisonContract.js'
import type { ComparisonModelClient } from './comparisonModelClient.js'
import type { ComparisonUsageLimiter } from './comparisonUsageLimiter.js'

export interface ComparisonExplanationResult {
  brief: ComparisonBrief
  remainingToday: number
  promptTokens: number
  completionTokens: number
}

export class ComparisonService {
  constructor(
    private readonly modelClient: ComparisonModelClient,
    private readonly usageLimiter: ComparisonUsageLimiter,
  ) {}

  async explain(userKey: string, value: unknown): Promise<ComparisonExplanationResult> {
    const request: ComparisonExplainRequest = parseComparisonExplainRequest(value)
    const remainingToday = await this.usageLimiter.consume(userKey)
    const result = await this.modelClient.explain(request)
    return { ...result, remainingToday }
  }
}