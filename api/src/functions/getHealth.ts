import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { buildHealthReport } from '../services/health.js'
import { createCatalogRepository } from '../storage/catalogRepository.js'
import { createRateRepository } from '../storage/rateRepository.js'

export async function getHealth(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const report = await buildHealthReport(
    new Date(),
    (region) => createRateRepository(region).readCurrent(),
    (region) => createCatalogRepository(region).readCurrent(),
  )
  return {
    status: report.status === 'healthy' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
    jsonBody: report,
  }
}

app.http('getHealth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: getHealth,
})