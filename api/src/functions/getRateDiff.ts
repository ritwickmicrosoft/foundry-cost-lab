import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { isRegionId } from '../contracts.js'
import { rateDiffResponse } from '../http/rateHandlers.js'
import { createRateRepository } from '../storage/rateRepository.js'

export async function getRateDiff(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requested = request.query.get('region') ?? 'canadacentral'
  if (!isRegionId(requested)) {
    return { status: 400, jsonBody: { error: 'Unsupported rate-card region.' } }
  }
  return rateDiffResponse(
    createRateRepository(requested),
    (message, error) => context.error(message, error),
  )
}

app.http('getRateDiff', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rates/diff',
  handler: getRateDiff,
})