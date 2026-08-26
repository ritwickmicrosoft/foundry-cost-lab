import { ChevronDown, Cloud, Search, Server, SlidersHorizontal } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import {
  MODEL_SOURCE_IDS,
  MODEL_SOURCE_LABELS,
  MODEL_DEPLOYMENT_SKU_LABELS,
  availableModelDeploymentSkus,
  defaultDeploymentOption,
  defaultModelDeploymentSku,
  getFoundryModel,
  supportsManagedCompute,
  supportsTokenBilling,
  type ActiveFoundryCatalog,
  type FoundryModelCatalogEntry,
  type ModelBillingBasis,
  type ModelSourceId,
} from '../domain/foundryCatalog'
import {
  applyModelPriceSelection,
  findModelPriceProfile,
  updateActiveModelPriceProfile,
} from '../domain/modelPriceProfiles'
import type { CostConfig, ModelDeploymentSku } from '../domain/types'
import { formatMoney } from '../utils/format'
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

type HostingMethod = 'pay-per-use' | 'dedicated'
type ProviderFilter = ModelSourceId | 'all'
type AvailabilityPreset = 'always' | 'business' | 'custom'

const MODEL_SHORTLIST_SIZE = 5
const ALWAYS_ON_HOURS = 730
const BUSINESS_HOURS = 176
const DEDICATED_RECOMMENDATION_ORDER = [
  'qwen--qwen3.6-27b',
  'qwen--qwen3.8-27b',
  'zai-org--glm-5.2-fp8',
  'nvidia--cosmos3-nano',
  'nvidia--cosmos3-edge',
  'nvidia--cosmos3-super',
  'unsloth--kimi-k2.6-gguf--ud-q4_k_xl',
  'unsloth--kimi-k2.7-code-gguf--ud-q4_k_xl',
]

const taskLabel = (task: string) => task
  .split('-')
  .map((part) => `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`)
  .join(' ')

const supportsHosting = (model: FoundryModelCatalogEntry, method: HostingMethod) =>
  method === 'dedicated'
    ? supportsManagedCompute(model)
    : supportsTokenBilling(model) || !supportsManagedCompute(model)

const dedicatedRecommendationRank = (model: FoundryModelCatalogEntry) => {
  const index = DEDICATED_RECOMMENDATION_ORDER.indexOf(model.name)
  return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

export function ModelCatalogConfigurator({ config, catalog, update }: ModelCatalogConfiguratorProps) {
  const selectedModel = getFoundryModel(config.modelId, catalog.models) ?? catalog.models[0]!
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState<ProviderFilter>('all')
  const [task, setTask] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [showAllModels, setShowAllModels] = useState(false)
  const [showDeploymentDetails, setShowDeploymentDetails] = useState(false)
  const [showPricingDetails, setShowPricingDetails] = useState(false)
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase())
  const hostingMethod: HostingMethod = config.billingBasis === 'managed-compute'
    ? 'dedicated'
    : 'pay-per-use'
  const hostingModels = catalog.models.filter((model) => supportsHosting(model, hostingMethod))
  const availableProviders = MODEL_SOURCE_IDS.filter((sourceId) =>
    hostingModels.some((model) => model.source === sourceId),
  )
  const taskOptions = [...new Set(hostingModels.flatMap((model) => model.inferenceTasks))].sort()
  const filteredModels = hostingModels
    .filter((model) => provider === 'all' || model.source === provider)
    .filter((model) => task === 'all' || model.inferenceTasks.includes(task))
    .filter((model) => !deferredQuery || `${model.name} ${model.publisher} ${model.inferenceTasks.join(' ')}`
      .toLocaleLowerCase()
      .includes(deferredQuery))
    .sort((left, right) => {
      if (left.id === selectedModel.id) return -1
      if (right.id === selectedModel.id) return 1
      const leftRegional = (left.regionalAvailability ?? []).includes(catalog.region)
      const rightRegional = (right.regionalAvailability ?? []).includes(catalog.region)
      if (leftRegional !== rightRegional) return leftRegional ? -1 : 1
      if (hostingMethod === 'dedicated') {
        const rank = dedicatedRecommendationRank(left) - dedicatedRecommendationRank(right)
        if (rank !== 0) return rank
      }
      return left.name.localeCompare(right.name)
    })
  const visibleModels = deferredQuery || showAllModels
    ? filteredModels
    : filteredModels.slice(0, MODEL_SHORTLIST_SIZE)
  const deploymentSkus = availableModelDeploymentSkus(selectedModel)
  const activeProfile = findModelPriceProfile(config)
  const activeFilterCount = Number(provider !== 'all') + Number(task !== 'all')
  const availabilityPreset: AvailabilityPreset = config.managedCompute.hoursPerMonth === ALWAYS_ON_HOURS
    ? 'always'
    : config.managedCompute.hoursPerMonth === BUSINESS_HOURS
      ? 'business'
      : 'custom'
  const estimatedManagedCompute = config.managedCompute.instanceHourlyRateCad === null
    ? null
    : config.managedCompute.instances *
      config.managedCompute.hoursPerMonth *
      config.managedCompute.instanceHourlyRateCad

  const skuForHosting = (model: typeof selectedModel, method: HostingMethod) => method === 'dedicated'
    ? 'managed-compute'
    : availableModelDeploymentSkus(model).find((sku) => sku !== 'managed-compute') ?? defaultModelDeploymentSku(model)

  const changeHostingMethod = (method: HostingMethod) => {
    if (method === hostingMethod) return
    const model = supportsHosting(selectedModel, method)
      ? selectedModel
      : [...catalog.models]
        .filter((candidate) => supportsHosting(candidate, method))
        .sort((left, right) => method === 'dedicated'
          ? dedicatedRecommendationRank(left) - dedicatedRecommendationRank(right) || left.name.localeCompare(right.name)
          : left.name.localeCompare(right.name))[0]
    if (!model) return
    update((draft) => {
      draft.deploymentOption = method === 'dedicated' ? 'Managed Compute' : defaultDeploymentOption(model)
      applyModelPriceSelection(draft, model, skuForHosting(model, method))
    })
    setQuery('')
    setProvider('all')
    setTask('all')
    setShowFilters(false)
    setShowAllModels(false)
    setShowDeploymentDetails(false)
    setShowPricingDetails(false)
  }

  const selectModel = (modelId: string) => {
    const model = getFoundryModel(modelId, catalog.models)
    if (!model) return
    const deploymentSku = skuForHosting(model, hostingMethod)
    update((draft) => {
      draft.deploymentOption = hostingMethod === 'dedicated'
        ? 'Managed Compute'
        : defaultDeploymentOption(model)
      applyModelPriceSelection(draft, model, deploymentSku)
    })
    setShowDeploymentDetails(false)
    setShowPricingDetails(false)
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

  const selectAvailability = (preset: AvailabilityPreset) => {
    update((draft) => {
      if (preset === 'always') draft.managedCompute.hoursPerMonth = ALWAYS_ON_HOURS
      if (preset === 'business') draft.managedCompute.hoursPerMonth = BUSINESS_HOURS
      if (preset === 'custom' && availabilityPreset !== 'custom') {
        draft.managedCompute.hoursPerMonth = 100
      }
    })
  }

  return (
    <div className="catalog-configurator">
      <section className="model-stage" aria-labelledby="hosting-method-title">
        <div className="model-stage__heading">
          <strong id="hosting-method-title">Hosting method</strong>
        </div>
        <div className="model-hosting-options" role="group" aria-label="Hosting method">
          <button
            type="button"
            className={hostingMethod === 'pay-per-use' ? 'model-hosting-option model-hosting-option--active' : 'model-hosting-option'}
            aria-pressed={hostingMethod === 'pay-per-use'}
            onClick={() => changeHostingMethod('pay-per-use')}
          >
            <Cloud aria-hidden="true" />
            <span><strong>Pay per use</strong><small>Usage-based billing</small></span>
          </button>
          <button
            type="button"
            className={hostingMethod === 'dedicated' ? 'model-hosting-option model-hosting-option--active' : 'model-hosting-option'}
            aria-pressed={hostingMethod === 'dedicated'}
            onClick={() => changeHostingMethod('dedicated')}
          >
            <Server aria-hidden="true" />
            <span><strong>Dedicated endpoint</strong><small>GPU instance-hours</small></span>
          </button>
        </div>
      </section>

      <section className="model-stage" aria-labelledby="model-picker-title">
        <div className="model-stage__heading">
          <strong id="model-picker-title">Model</strong>
          <span>{filteredModels.length} available</span>
        </div>
        <div className="model-search-row">
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
          <button
            type="button"
            className="button button--quiet model-filter-button"
            aria-expanded={showFilters}
            aria-controls="model-filter-panel"
            onClick={() => setShowFilters((visible) => !visible)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
      </div>

        {showFilters ? (
          <div id="model-filter-panel" className="model-filter-panel" role="region" aria-label="Model filters">
            <label className="field">
              <span className="field__label">Provider</span>
              <select value={provider} onChange={(event) => {
                setProvider(event.target.value as ProviderFilter)
                setShowAllModels(false)
              }}>
                <option value="all">All providers</option>
                {availableProviders.map((sourceId) => (
                  <option key={sourceId} value={sourceId}>{MODEL_SOURCE_LABELS[sourceId]}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Use case</span>
              <select value={task} onChange={(event) => {
                setTask(event.target.value)
                setShowAllModels(false)
              }}>
                <option value="all">All use cases</option>
                {taskOptions.map((option) => <option key={option} value={option}>{taskLabel(option)}</option>)}
              </select>
            </label>
            <div className="catalog-snapshot">
              <span>{catalog.models.length} catalog models</span>
              <span>{catalog.liveAsOf ? `${catalog.regionConfirmedCount} listed by this region` : `Snapshot ${catalog.bundledAsOf}`}</span>
            </div>
          </div>
        ) : null}

      <div className="catalog-model-list" role="radiogroup" aria-label={`${hostingMethod === 'dedicated' ? 'Dedicated endpoint' : 'Pay per use'} models`}>
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
              {taskLabel(model.inferenceTasks[0] ?? 'catalog asset')} · {(model.regionalAvailability ?? []).includes(catalog.region) ? 'Available in region' : 'Availability to confirm'}
            </span>
          </label>
        ))}
        {visibleModels.length === 0 ? <div className="catalog-empty">No models match this filter.</div> : null}
      </div>

        {!deferredQuery && filteredModels.length > MODEL_SHORTLIST_SIZE ? (
          <button
            type="button"
            className="button button--quiet model-show-all"
            onClick={() => setShowAllModels((showingAll) => !showingAll)}
          >
            {showAllModels ? 'Show shortlist' : `Show all ${filteredModels.length} models`}
          </button>
        ) : null}

      <div className="catalog-selection">
        <div>
          <strong>{selectedModel.name}</strong>
          <span>{MODEL_SOURCE_LABELS[selectedModel.source]} · {selectedModel.publisher}</span>
        </div>
        <span>
          {selectedModel.inferenceTasks.map(taskLabel).join(', ') || 'Catalog metadata only'} · {(selectedModel.regionalAvailability ?? []).includes(catalog.region) ? 'Listed in the selected region' : `Catalog snapshot ${catalog.bundledAsOf}`}
        </span>
      </div>
      </section>

      {hostingMethod === 'pay-per-use' ? (
        <section className="model-stage model-stage--disclosure">
          <button
            type="button"
            className="model-disclosure-button"
            aria-expanded={showDeploymentDetails}
            aria-controls="model-deployment-details"
            onClick={() => setShowDeploymentDetails((visible) => !visible)}
          >
            <span><strong>Deployment details</strong><small>{MODEL_DEPLOYMENT_SKU_LABELS[config.deploymentSku]} · {billingLabels[config.billingBasis]}</small></span>
            <ChevronDown aria-hidden="true" />
          </button>
          {showDeploymentDetails ? (
            <div id="model-deployment-details" className="model-disclosure-panel" role="region" aria-label="Deployment details">
              <label className="field">
                <span className="field__label">Deployment option</span>
                <select value={config.deploymentOption} onChange={(event) => selectDeployment(event.target.value)}>
                  {(selectedModel.deploymentOptions.length > 0 ? selectedModel.deploymentOptions : ['Catalog only']).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
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
              </label>
              <span className="field__hint">Quota, provider terms, and regional eligibility still require validation.</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {config.billingBasis === 'managed-compute' ? (
        <section className="model-stage" aria-labelledby="capacity-title">
          <div className="model-stage__heading"><strong id="capacity-title">Capacity</strong></div>
          <div className="segmented-field">
            <span className="field__label">Availability</span>
            <div className="segmented" role="group" aria-label="Availability">
              {([
                ['always', 'Always on'],
                ['business', 'Business hours'],
                ['custom', 'Custom'],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={`segmented__button${availabilityPreset === value ? ' segmented__button--active' : ''}`}
                  aria-label={`${label} availability`}
                  aria-pressed={availabilityPreset === value}
                  onClick={() => selectAvailability(value)}
                >{label}</button>
              ))}
            </div>
          </div>
          <div className="field-grid field-grid--two">
            <NumberField
              label="Instances"
              value={config.managedCompute.instances}
              min={1}
              onChange={(value) => update((draft) => { draft.managedCompute.instances = value ?? 1 })}
            />
            {availabilityPreset === 'custom' ? (
              <NumberField
                label="Hours / month"
                value={config.managedCompute.hoursPerMonth}
                max={730}
                onChange={(value) => update((draft) => { draft.managedCompute.hoursPerMonth = value ?? 0 })}
              />
            ) : (
              <div className="model-capacity-stat"><span>Hours / month</span><strong>{config.managedCompute.hoursPerMonth}</strong></div>
            )}
            <NumberField
              label="VM hourly rate"
              value={config.managedCompute.instanceHourlyRateCad}
              step={0.01}
              suffix="CAD/hr"
              hint="Full hourly rate for the selected GPU VM"
              onChange={(value) => update((draft) => {
                updateActiveModelPriceProfile(draft, { managedComputeHourlyRateCad: value })
              })}
            />
          </div>
          <div className="model-compute-estimate" aria-live="polite">
            <span>Estimated compute</span>
            <strong>{estimatedManagedCompute === null ? 'Add VM rate' : `${formatMoney(estimatedManagedCompute, 2)} / month`}</strong>
          </div>
        </section>
      ) : null}

      <section className="model-stage model-stage--disclosure">
        <button
          type="button"
          className="model-disclosure-button"
          aria-expanded={showPricingDetails}
          aria-controls="model-pricing-details"
          onClick={() => setShowPricingDetails((visible) => !visible)}
        >
          <span><strong>Pricing details</strong><small>Fallback rates and source evidence</small></span>
          <ChevronDown aria-hidden="true" />
        </button>
        {showPricingDetails ? <div id="model-pricing-details" className="model-disclosure-panel" role="region" aria-label="Pricing details">

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
        </div> : null}
      </section>
    </div>
  )
}