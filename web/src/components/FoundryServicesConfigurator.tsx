import { Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { FOUNDRY_SERVICES, FOUNDRY_SERVICES_AS_OF } from '../domain/foundryServices'
import type { CostConfig } from '../domain/types'
import { NumberField } from './Controls'

type FoundryServicesConfig = CostConfig['foundryServices']
type ServiceType = 'all' | (typeof FOUNDRY_SERVICES)[number]['type']

interface FoundryServicesConfiguratorProps {
  config: FoundryServicesConfig
  update: (change: (config: FoundryServicesConfig) => void) => void
}

export function FoundryServicesConfigurator({ config, update }: FoundryServicesConfiguratorProps) {
  const [serviceType, setServiceType] = useState<ServiceType>('all')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase())
  const visibleServices = FOUNDRY_SERVICES.filter((service) =>
    (serviceType === 'all' || service.type === serviceType) &&
    (!deferredQuery || `${service.name} ${service.type}`.toLocaleLowerCase().includes(deferredQuery)),
  )
  const selectedCount = config.selections.filter((selection) => selection.enabled).length

  return (
    <div className="service-configurator">
      <div className="catalog-snapshot">
        <span>{FOUNDRY_SERVICES.length} services</span>
        <span>Definitions {FOUNDRY_SERVICES_AS_OF} · {selectedCount} selected</span>
      </div>
      <div className="catalog-toolbar">
        <label className="field">
          <span className="field__label">Service type</span>
          <select value={serviceType} onChange={(event) => setServiceType(event.target.value as ServiceType)}>
            <option value="all">All services</option>
            <option value="Content Understanding">Content Understanding</option>
            <option value="Speech">Speech</option>
            <option value="Translation">Translation</option>
            <option value="Language">Language</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Find service</span>
          <span className="catalog-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Name or type"
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>
        </label>
      </div>
      <div className="service-list" role="group" aria-label="Foundry services">
        {visibleServices.map((service) => {
          const selection = config.selections.find((candidate) => candidate.id === service.id)
          if (!selection) return null
          return (
            <div key={service.id} className={`service-row${selection.enabled ? ' service-row--selected' : ''}`}>
              <label className="service-row__head">
                <input
                  type="checkbox"
                  checked={selection.enabled}
                  onChange={(event) => update((draft) => {
                    const target = draft.selections.find((candidate) => candidate.id === service.id)
                    if (target) target.enabled = event.target.checked
                  })}
                />
                <span>{service.name}</span>
                <small>{service.type}</small>
              </label>
              {selection.enabled ? (
                <div className="service-row__fields">
                  <NumberField
                    label={`Monthly ${service.quantityUnit}`}
                    value={selection.monthlyQuantity}
                    step={1}
                    onChange={(value) => update((draft) => {
                      const target = draft.selections.find((candidate) => candidate.id === service.id)
                      if (target) target.monthlyQuantity = value ?? 0
                    })}
                  />
                  <NumberField
                    label="Rate fallback"
                    value={selection.customUnitRateCad}
                    step={0.01}
                    suffix="CAD"
                    hint={`CAD per ${service.quantityUnit}`}
                    onChange={(value) => update((draft) => {
                      const target = draft.selections.find((candidate) => candidate.id === service.id)
                      if (target) target.customUnitRateCad = value
                    })}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}