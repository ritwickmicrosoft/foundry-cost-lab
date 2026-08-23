import { DefaultAzureCredential } from '@azure/identity'
import path from 'node:path'
import { isRegionId, REGION_IDS, type RegionId } from '../contracts.js'
import { fallbackRateCardFor } from '../fallbackRateCard.js'
import { executeCatalogSync } from '../services/catalogSync.js'
import { FoundryCatalogClient } from '../services/foundryCatalogClient.js'
import { RetailPricesClient } from '../services/retailPricesClient.js'
import { executeRateSync } from '../services/rateSync.js'
import { FileCatalogRepository } from '../storage/catalogRepository.js'
import { FileRateRepository } from '../storage/rateRepository.js'

const argumentsSet = new Set(process.argv.slice(2))
const requestedRegion = [...argumentsSet]
  .find((argument) => argument.startsWith('--region='))
  ?.slice('--region='.length)
if (requestedRegion && !isRegionId(requestedRegion)) {
  throw new Error(`Unsupported region: ${requestedRegion}`)
}
if (argumentsSet.has('--rates-only') && argumentsSet.has('--catalog-only')) {
  throw new Error('Choose either --rates-only or --catalog-only, not both.')
}
const regions: RegionId[] = requestedRegion
  ? [requestedRegion as RegionId]
  : [...REGION_IDS]
const synchronizeRates = !argumentsSet.has('--catalog-only')
const synchronizeCatalog = !argumentsSet.has('--rates-only')
const dataDirectory = path.resolve(process.cwd(), 'data')
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID?.trim()
const now = new Date()
const failures: unknown[] = []

if (synchronizeRates) {
  for (const region of regions) {
    try {
      const outcome = await executeRateSync(
        new FileRateRepository(path.join(dataDirectory, region)),
        new RetailPricesClient(),
        now,
        fallbackRateCardFor(region),
      )
      console.log(`${region}: synchronized ${outcome.matchedKeys.length} CAD meters to ${dataDirectory}.`)
    } catch (error) {
      failures.push(error)
      console.error(`${region}: CAD rate synchronization failed.`, error)
    }
  }
}

if (synchronizeCatalog) {
  if (!subscriptionId) {
    console.warn('AZURE_SUBSCRIPTION_ID is unset; model catalogs were not synchronized.')
  } else {
    const catalogClient = new FoundryCatalogClient(subscriptionId, new DefaultAzureCredential())
    for (const region of regions) {
      try {
        const snapshot = await executeCatalogSync(
          new FileCatalogRepository(path.join(dataDirectory, 'catalog', region)),
          catalogClient,
          region,
          now,
        )
        console.log(`${region}: synchronized ${snapshot.models.length} regional models to ${dataDirectory}.`)
      } catch (error) {
        failures.push(error)
        console.error(`${region}: model catalog synchronization failed.`, error)
      }
    }
  }
}

if (failures.length > 0) {
  throw new AggregateError(failures, 'One or more local synchronization operations failed.')
}