import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { hasRole, isAuthenticated, parseClientPrincipal } from '../auth/clientPrincipal.js'
import { ComparisonService } from '../comparison/comparisonService.js'
import { createComparisonModelClient } from '../comparison/comparisonModelClient.js'
import { createComparisonUsageLimiter, getComparisonDailyLimit } from '../comparison/comparisonUsageLimiter.js'

const noStore = { 'Cache-Control': 'no-store' }

const response = (status: number, jsonBody: unknown): HttpResponseInit => ({
  status,
  headers: noStore,
  jsonBody,
})

export function comparisonAiStatus(request: HttpRequest): HttpResponseInit {
  const principal = parseClientPrincipal(request)
  if (!isAuthenticated(principal)) return response(401, { error: 'Authentication is required.' })
  if (!hasRole(principal, 'costlab-user')) return response(403, { error: 'Application access is required.' })
  return response(200, {
    enabled: createComparisonModelClient() !== null,
    model: process.env.COMPARISON_AI_DEPLOYMENT?.trim() || null,
    dailyLimit: getComparisonDailyLimit(),
  })
}

export async function explainComparison(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const principal = parseClientPrincipal(request)
  if (!isAuthenticated(principal)) return response(401, { error: 'Authentication is required.' })
  if (!hasRole(principal, 'costlab-user')) return response(403, { error: 'Application access is required.' })
  const modelClient = createComparisonModelClient()
  if (!modelClient) return response(503, { error: 'AI comparison is not enabled.' })

  try {
    const result = await new ComparisonService(
      modelClient,
      createComparisonUsageLimiter(),
    ).explain(`${principal.identityProvider}:${principal.userId}`, await request.json())
    context.log(`COMPARISON_AI_SUCCESS ${JSON.stringify({
      factCount: result.brief.summary.factIds.length,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      remainingToday: result.remainingToday,
    })}`)
    return response(200, result)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null
    const message = error instanceof Error ? error.message : 'Comparison explanation failed.'
    if (code === 'daily-limit') return response(429, { error: message })
    if (message.includes('invalid') || message.includes('too large') || message.includes('unique')) {
      return response(400, { error: message })
    }
    context.error('Comparison explanation failed.', {
      code: code?.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80) || 'comparison-failed',
    })
    return response(503, { error: 'AI explanation is temporarily unavailable. The deterministic comparison remains valid.' })
  }
}

app.http('comparisonAiStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'comparison/explain',
  handler: comparisonAiStatus,
})

app.http('explainComparison', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'comparison/explain',
  handler: explainComparison,
})