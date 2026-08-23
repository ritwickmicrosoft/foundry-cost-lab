import { Search } from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'
import {
  MODEL_SOURCE_IDS,
  MODEL_SOURCE_LABELS,
  MODEL_DEPLOYMENT_SKU_LABELS,
  availableModelDeploymentSkus,
  defaultDeploymentOption,
  defaultModelDeploymentSku,
  getFoundryModel,
  type ActiveFoundryCatalog,
  type ModelBillingBasis,
  type ModelSourceId,
} from '../domain/foundryCatalog'
import {
  applyModelPriceSelection,
  findModelPriceProfile,
  updateActiveModelPriceProfile,
} from '../domain/modelPriceProfiles'
import type { CostConfig, ModelDeploymentSku } from '../domain/types'
import { NumberField } from './Controls'

type CommercialModelConfig = CostConfig['commercialModel']

interface ModelCatalogConfiguratorProps {
  config: CommercialModelConfig
  catalog: ActiveFoundryCatalog
  update: (change: (config: CommercialModelConfig) => void) => void
}

const billingLabels: Record<ModelBillingBasis, string> = {
  tokens: 'Token API',
  'managed-compute': 'Managed compute',
  usage: 'Usage unit',
}

export function ModelCatalogConfigurator({ config, catalog, update }: ModelCatalogConfiguratorProps) {
  const selectedModel = getFoundryModel(config.modelId, catalog.models) ?? catalog.models[0]!
  const [source, setSource] = useState<ModelSourceId>(selectedModel.source)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase())

  useEffect(() => {
    setSource(selectedModel.source)
  }, [selectedModel.source])

  const visibleModels = catalog.models.filter((model) => {
    if (model.source !== source) return false
    if (!deferredQuery) return true
    return `${model.name} ${model.publisher} ${model.inferenceTasks.join(' ')}`
      .toLocaleLowerCase()
      .includes(deferredQuery)
  })
  const deploymentSkus = availableModelDeploymentSkus(selectedModel)
  const activeProfile = findModelPriceProfile(config)

  const selectModel = (modelId: string) => {
    const model = getFoundryModel(modelId, catalog.models)
    if (!model) return
    const deploymentSku = defaultModelDeploymentSku(model)
    update((draft) => {
      draft.deploymentOption = defaultDeploymentOption(model)
      applyModelPriceSelection(draft, model, deploymentSku)
    })
  }

  const selectDeployment = (deploymentOption: string) => {
    update((draft) => {
      draft.deploymentOption = deploymentOption
      if (deploymentOption === 'Managed Compute') {
        applyModelPriceSelection(draft, selectedModel, 'managed-compute')
      } else if (draft.deploymentSku === 'managed-compute') {
        const nextSku = availableModelDeploymentSkus(selectedModel).find(
          (sku) => sku !== 'managed-compute',
        ) ?? defaultModelDeploymentSku(selectedModel)
        applyModelPriceSelection(draft, selectedModel, nextSku)
      }
    })
  }

  const selectDeploymentSku = (deploymentSku: ModelDeploymentSku) => {
    update((draft) => {
      if (deploymentSku === 'managed-compute') {
        draft.deploymentOption = selectedModel.deploymentOptions.includes('Managed Compute')
          ? 'Managed Compute'
          : draft.deploymentOption
      } else if (draft.deploymentOption === 'Managed Compute') {
        draft.deploymentOption = defaultDeploymentOption(selectedModel)
      }
      applyModelPriceSelection(draft, selectedModel, deploymentSku)
    })
  }

  return (
    <div className="catalog-configurator">
      <div className="catalog-snapshot">
        <span>{catalog.models.length} catalog models</span>
        <span>
          {catalog.liveAsOf
            ? `${catalog.regionConfirmedCount} region-confirmed · ${catalog.bundledOnlyCount} snapshot-only`
            : `Bundled ${catalog.bundledAsOf}`}
        </span>
      </div>
      <div className="catalog-toolbar">
        <label className="field">
          <span className="field__label">Deployment source</span>
          <select value={source} onChange={(event) => setSource(event.target.value as ModelSourceId)}>
            {MODEL_SOURCE_IDS.map((sourceId) => (
              <option key={sourceId} value={sourceId}>{MODEL_SOURCE_LABELS[sourceId]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Find model</span>
          <span className="catalog-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Name, publisher, or task"
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>
        </label>
      </div>

      <div className="catalog-model-list" role="radiogroup" aria-label={`${MODEL_SOURCE_LABELS[source]} models`}>
        {visibleModels.map((model) => (
          <label
            key={model.id}
            className={`catalog-model-row${model.id === config.modelId ? ' catalog-model-row--selected' : ''}`}
          >
            <input
              type="radio"
              name="foundry-model"
              value={model.id}
              checked={model.id === config.modelId}
              onChange={() => selectModel(model.id)}
            />
            <span className="catalog-model-row__identity">
              <strong>{model.name}</strong>
              <small>{model.publisher} · {model.version}</small>
            </span>
            <span className="catalog-model-row__task">
              {model.inferenceTasks[0] ?? 'catalog asset'} · {(model.regionalAvailability ?? []).includes(catalog.region) ? 'region confirmed' : 'not region-confirmed'}
            </span>
          </label>
        ))}
        {visibleModels.length === 0 ? <div className="catalog-empty">No models match this filter.</div> : null}
      </div>

      <div className="catalog-selection">
        <div>
          <strong>{selectedModel.name}</strong>
          <span>{MODEL_SOURCE_LABELS[selectedModel.source]} · {selectedModel.publisher}</span>
        </div>
        <span>
          {selectedModel.inferenceTasks.join(', ') || 'Catalog metadata only'} · {(selectedModel.regionalAvailability ?? []).includes(catalog.region) ? 'Listed by the selected region ARM feed' : `Not listed by the selected region ARM feed; metadata is from the ${catalog.bundledAsOf} snapshot`}
        </span>
      </div>

      <label className="field">
        <span className="field__label">Deployment option</span>
        <select value={config.deploymentOption} onChange={(event) => selectDeployment(event.target.value)}>
          {(selectedModel.deploymentOptions.length > 0 ? selectedModel.deploymentOptions : ['Catalog only']).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <span className="field__hint">Region confirmation still does not guarantee quota, Marketplace acceptance, or subscription eligibility.</span>
      </label>

      <label className="field">
        <span className="field__label">Deployment SKU</span>
        <select
          value={config.deploymentSku}
          onChange={(event) => selectDeploymentSku(event.target.value as ModelDeploymentSku)}
        >
          {deploymentSkus.map((sku) => (
            <option key={sku} value={sku}>{MODEL_DEPLOYMENT_SKU_LABELS[sku]}</option>
          ))}
        </select>
        <span className="field__hint">
          {billingLabels[config.billingBasis]} · {config.purchaseMode.toUpperCase()} · pricing is isolated by model and SKU.
        </span>
      </label>

      {config.billingBasis === 'tokens' ? (
        <div className="catalog-pricing-fields">
          {config.purchaseMode === 'batch' ? (
            <div className="field-grid field-grid--two">
              <NumberField
                label="Batch input fallback"
                value={config.customBatchInputRateCadPerMillion}
                step={0.01}
                suffix="CAD/1M"
                hint="Used only when the CAD rate card has no exact Batch meter"
                onChange={(value) => update((draft) => {
                  updateActiveModelPriceProfile(draft, { batchInputRateCadPerMillion: value })
                })}
              />
              <NumberField
                label="Batch output fallback"
                value={config.customBatchOutputRateCadPerMillion}
                step={0.01}
                suffix="CAD/1M"
                onChange={(value) => update((draft) => {
                  updateActiveModelPriceProfile(draft, { batchOutputRateCadPerMillion: value })
                })}
              />
            </div>
          ) : (
            <div className="field-grid field-grid--three">
              <NumberField
                label="Input rate fallback"
                value={config.customInputRateCadPerMillion}
                step={0.01}
                suffix="CAD/1M"
                hint="Used only when the CAD rate card has no exact model meter"
                onChange={(value) => update((draft) => {
                  updateActiveModelPriceProfile(draft, { inputRateCadPerMillion: value })
                })}
              />
              <NumberField
                label="Cached input fallback"
                value={config.customCachedInputRateCadPerMillion}
                step={0.01}
                suffix="CAD/1M"
                onChange={(value) => update((draft) => {
                  updateActiveModelPriceProfile(draft, { cachedInputRateCadPerMillion: value })
                })}
              />
              <NumberField
                label="Output rate fallback"
                value={config.customOutputRateCadPerMillion}
                step={0.01}
                suffix="CAD/1M"
                onChange={(value) => update((draft) => {
                  updateActiveModelPriceProfile(draft, { outputRateCadPerMillion: value })
                })}
              />
              <NumberField
                label="Cached input share"
                value={config.cachedInputPercent}
                min={0}
                max={100}
                suffix="%"
                onChange={(value) => update((draft) => { draft.cachedInputPercent = value ?? 0 })}
              />
            </div>
          )}
          {config.purchaseMode === 'ptu' ? (
            <div className="field-grid field-grid--three">
              <NumberField
                label="PTU units"
                value={config.ptuUnits}
                min={1}
                onChange={(value) => update((draft) => { draft.ptuUnits = value ?? 1 })}
              />
              <NumberField
                label="Capacity / PTU / month"
                value={config.ptuCapacityTokensPerUnitMonth}
                step={1_000_000}
                suffix="tokens"
                onChange={(value) => update((draft) => { draft.ptuCapacityTokensPerUnitMonth = value })}
              />
              <NumberField
                label="PTU rate fallback"
                value={config.customPtuHourlyRateCad}
                step={0.01}
                suffix="CAD/hr"
                onChange={(value) => update((draft) => {
                  updateActiveModelPriceProfile(draft, { ptuHourlyRateCad: value })
                })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {config.billingBasis === 'managed-compute' ? (
        <div className="field-grid field-grid--three">
          <NumberField
            label="Instances"
            value={config.managedCompute.instances}
            min={1}
            onChange={(value) => update((draft) => { draft.managedCompute.instances = value ?? 1 })}
          />
          <NumberField
            label="Hours / month"
            value={config.managedCompute.hoursPerMonth}
            max={730}
            onChange={(value) => update((draft) => { draft.managedCompute.hoursPerMonth = value ?? 0 })}
          />
          <NumberField
            label="VM rate"
            value={config.managedCompute.instanceHourlyRateCad}
            step={0.01}
            suffix="CAD/hr"
            hint="Use the full VM SKU hourly rate"
            onChange={(value) => update((draft) => {
              updateActiveModelPriceProfile(draft, { managedComputeHourlyRateCad: value })
            })}
          />
        </div>
      ) : null}

      {config.billingBasis === 'usage' ? (
        <div className="field-grid field-grid--two">
          <NumberField
            label={`Monthly ${config.usage.quantityUnit}`}
            value={config.usage.monthlyQuantity}
            step={1}
            onChange={(value) => update((draft) => { draft.usage.monthlyQuantity = value ?? 0 })}
          />
          <NumberField
            label="Unit rate"
            value={config.usage.unitRateCad}
            step={0.01}
            suffix="CAD"
            hint={`CAD per ${config.usage.quantityUnit}`}
            onChange={(value) => update((draft) => {
              updateActiveModelPriceProfile(draft, { usageUnitRateCad: value })
            })}
          />
        </div>
      ) : null}

      <div className="field-grid field-grid--two">
        <label className="field">
          <span className="field__label">Fallback price source</span>
          <input
            type="text"
            value={activeProfile?.source ?? ''}
            placeholder="Marketplace offer or contract"
            onChange={(event) => update((draft) => {
              updateActiveModelPriceProfile(draft, { source: event.target.value })
            })}
          />
        </label>
        <label className="field">
          <span className="field__label">Fallback price as of</span>
          <input
            type="date"
            value={activeProfile?.asOf ?? ''}
            onChange={(event) => update((draft) => {
              updateActiveModelPriceProfile(draft, { asOf: event.target.value })
            })}
          />
        </label>
      </div>
    </div>
  )
}