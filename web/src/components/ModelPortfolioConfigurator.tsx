import { Plus, Settings2, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import {
  defaultDeploymentOption,
  defaultModelDeploymentSku,
  getFoundryModel,
  type ActiveFoundryCatalog,
} from '../domain/foundryCatalog'
import { applyModelPriceSelection } from '../domain/modelPriceProfiles'
import { createPreset } from '../domain/presets'
import type { CommercialModelConfig, CostConfig, ModelRouteMode, ModelRouteRole } from '../domain/types'
import { NumberField } from './Controls'
import { ModelCatalogConfigurator } from './ModelCatalogConfigurator'

interface ModelPortfolioConfiguratorProps {
  config: CostConfig
  catalog: ActiveFoundryCatalog
  update: (change: (config: CostConfig) => void) => void
}

const ROLE_LABELS: Record<ModelRouteRole, string> = {
  primary: 'Primary',
  fast: 'Fast / economical',
  reasoning: 'Reasoning',
  multimodal: 'Multimodal',
}

const routeLabel = (role: ModelRouteRole) => ({
  primary: 'Primary requests',
  fast: 'Routine requests',
  reasoning: 'Reasoning assist',
  multimodal: 'Multimodal assist',
})[role]

export function ModelPortfolioConfigurator({ config, catalog, update }: ModelPortfolioConfiguratorProps) {
  const componentId = useId()
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null)
  const deployments = new Map<string, { label: string; model: CommercialModelConfig }>([
    ['primary', { label: 'Primary deployment', model: config.commercialModel }],
    ...config.modelPortfolio.deployments.map((deployment) => [
      deployment.id,
      { label: deployment.label, model: deployment.model },
    ] as const),
  ])
  const sharedTrafficTotal = config.modelPortfolio.routes
    .filter((route) => route.mode === 'traffic-share')
    .reduce((sum, route) => sum + route.trafficPercent, 0)
  const normalizedShares = config.modelPortfolio.routes
    .filter((route) => route.mode === 'traffic-share')
    .map((route) => `${route.label} ${route.trafficPercent}% → ${sharedTrafficTotal > 0 ? (route.trafficPercent / sharedTrafficTotal * 100).toFixed(1) : '0.0'}%`)
    .join(' · ')
  const hasMultipleRoutes = config.modelPortfolio.routes.length > 1 || config.modelPortfolio.deployments.length > 0

  const changeRoute = (routeId: string, change: Partial<CostConfig['modelPortfolio']['routes'][number]>) => {
    update((draft) => {
      const route = draft.modelPortfolio.routes.find((candidate) => candidate.id === routeId)
      if (!route) return
      const previousDeploymentId = route.deploymentId
      Object.assign(route, change)
      if (
        previousDeploymentId !== 'primary' &&
        previousDeploymentId !== route.deploymentId &&
        !draft.modelPortfolio.routes.some((candidate) => candidate.id !== routeId && candidate.deploymentId === previousDeploymentId)
      ) {
        draft.modelPortfolio.deployments = draft.modelPortfolio.deployments.filter(
          (deployment) => deployment.id !== previousDeploymentId,
        )
      }
    })
  }

  const removeRoute = (routeId: string) => {
    update((draft) => {
      const route = draft.modelPortfolio.routes.find((candidate) => candidate.id === routeId)
      if (!route || route.id === 'primary-route') return
      draft.modelPortfolio.routes = draft.modelPortfolio.routes.filter((candidate) => candidate.id !== routeId)
      if (
        route.deploymentId !== 'primary' &&
        !draft.modelPortfolio.routes.some((candidate) => candidate.deploymentId === route.deploymentId)
      ) {
        draft.modelPortfolio.deployments = draft.modelPortfolio.deployments.filter(
          (deployment) => deployment.id !== route.deploymentId,
        )
      }
      draft.modelPortfolio.strategy = draft.modelPortfolio.routes.length === 1 ? 'single' : 'custom'
    })
  }

  const addRoute = () => {
    const model = catalog.models.find((candidate) => candidate.name === 'gpt-5.4-nano') ??
      catalog.models.find((candidate) => candidate.id !== config.commercialModel.modelId)
    if (!model) return
    const token = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36)
    const deploymentId = `model-${token}`
    const routeId = `route-${token}`
    update((draft) => {
      const deploymentModel = structuredClone(createPreset('poc').commercialModel)
      deploymentModel.deploymentOption = defaultDeploymentOption(model)
      applyModelPriceSelection(deploymentModel, model, defaultModelDeploymentSku(model))
      draft.modelPortfolio.deployments.push({
        id: deploymentId,
        label: 'Additional deployment',
        model: deploymentModel,
      })
      draft.modelPortfolio.routes.push({
        id: routeId,
        label: 'Additional model assist',
        role: 'fast',
        deploymentId,
        mode: 'additive',
        trafficPercent: 10,
      })
      draft.modelPortfolio.strategy = 'custom'
    })
    setExpandedRouteId(routeId)
  }

  return (
    <div className="model-portfolio-editor" aria-label="Model portfolio editor">
      <div className="model-portfolio-editor__header">
        <div>
          <strong>{hasMultipleRoutes ? 'Model portfolio' : 'Need more than one model?'}</strong>
          <span>{hasMultipleRoutes ? `${config.modelPortfolio.routes.length} routes · shared traffic ${sharedTrafficTotal}%` : 'Add specialist routing only when the architecture needs it.'}</span>
        </div>
        <button type="button" className="button button--quiet" onClick={addRoute}>
          <Plus aria-hidden="true" />Add model
        </button>
      </div>
      {hasMultipleRoutes && sharedTrafficTotal !== 100 ? (
        <div className="notice notice--warning">
          Shared traffic totals {sharedTrafficTotal}%. Preview normalization: {normalizedShares}. Complete 100% before approval.
        </div>
      ) : null}

      {hasMultipleRoutes ? <div className="model-route-list">
        {config.modelPortfolio.routes.map((route) => {
          const deployment = deployments.get(route.deploymentId)
          const selectedModel = deployment ? getFoundryModel(deployment.model.modelId, catalog.models) : null
          const canRemove = route.id !== 'primary-route'
          const deploymentPanelId = `${componentId}-${route.id}-deployment`
          return (
            <section className="model-route" key={route.id} aria-label={`${route.label} route`}>
              <div className="model-route__heading">
                <div>
                  <strong>{route.label}</strong>
                  <span>{selectedModel?.name ?? deployment?.model.modelId ?? 'Deployment unavailable'}</span>
                </div>
                {canRemove ? (
                  <button type="button" className="icon-button icon-button--danger" aria-label={`Remove ${route.label}`} onClick={() => removeRoute(route.id)}>
                    <Trash2 aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="field-grid field-grid--two">
                <label className="field">
                  <span className="field__label">Role</span>
                  <select value={route.role} onChange={(event) => {
                    const role = event.target.value as ModelRouteRole
                    changeRoute(route.id, { role, label: routeLabel(role) })
                  }}>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Deployment</span>
                  <select value={route.deploymentId} onChange={(event) => changeRoute(route.id, { deploymentId: event.target.value })}>
                    {[...deployments].map(([id, candidate]) => <option key={id} value={id}>{candidate.label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Routing</span>
                  <select value={route.mode} onChange={(event) => changeRoute(route.id, { mode: event.target.value as ModelRouteMode })}>
                    <option value="traffic-share">Shared traffic</option>
                    <option value="additive">Additional calls</option>
                  </select>
                </label>
                <NumberField
                  label={route.mode === 'traffic-share' ? 'Traffic share' : 'Invocation rate'}
                  value={route.trafficPercent}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(trafficPercent) => changeRoute(route.id, { trafficPercent: trafficPercent ?? 0 })}
                />
              </div>

              {route.deploymentId !== 'primary' ? (
                <button
                  type="button"
                  className="model-route__configure"
                  aria-expanded={expandedRouteId === route.id}
                  aria-controls={deploymentPanelId}
                  onClick={() => setExpandedRouteId((current) => current === route.id ? null : route.id)}
                >
                  <Settings2 aria-hidden="true" />Configure deployment
                </button>
              ) : <span className="model-route__primary-hint">Configure the primary deployment above.</span>}

              {route.deploymentId !== 'primary' && expandedRouteId === route.id && deployment ? (
                <div id={deploymentPanelId} className="model-route__deployment" role="region" aria-label={`${route.label} deployment configuration`}>
                  <ModelCatalogConfigurator
                    config={deployment.model}
                    catalog={catalog}
                    update={(change) => update((draft) => {
                      const target = draft.modelPortfolio.deployments.find(
                        (candidate) => candidate.id === route.deploymentId,
                      )
                      if (target) change(target.model)
                    })}
                  />
                </div>
              ) : null}
            </section>
          )
        })}
      </div> : null}
    </div>
  )
}