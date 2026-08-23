import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { isRegionId } from '../contracts.js'
import { createCatalogRepository } from '../storage/catalogRepository.js'

export async function getCatalog(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requested = request.query.get('region') ?? 'canadacentral'
  if (!isRegionId(requested)) {
    return { status: 400, jsonBody: { error: 'Unsupported model-catalog region.' } }
  }
  try {
    const snapshot = await createCatalogRepository(requested).readCurrent()
    if (!snapshot) {
      return {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { error: 'No synchronized model catalog is available yet.' },
      }
    }
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: snapshot,
    }
  } catch (error) {
    context.error('Model catalog storage is unavailable.', error)
    return {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { error: 'Model catalog storage is unavailable.' },
    }
  }
}

app.http('getCatalog', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'catalog',
  handler: getCatalog,
})