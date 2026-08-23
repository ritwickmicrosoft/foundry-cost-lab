import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { isRegionId } from '../contracts.js'
import { fallbackRateCardFor } from '../fallbackRateCard.js'
import { ratesResponse } from '../http/rateHandlers.js'
import { createRateRepository } from '../storage/rateRepository.js'

export async function getRates(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requested = request.query.get('region') ?? 'canadacentral'
  if (!isRegionId(requested)) {
    return { status: 400, jsonBody: { error: 'Unsupported rate-card region.' } }
  }
  return ratesResponse(
    createRateRepository(requested),
    (message, error) => context.error(message, error),
    fallbackRateCardFor(requested),
  )
}

app.http('getRates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rates',
  handler: getRates,
})