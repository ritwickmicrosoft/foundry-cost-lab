import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { analyzePlanning, hasObservationPeriod, workloadEvidenceStatus, workloadSignature } from '../domain/planning'
import { getPricingCoverageSummary } from '../domain/pricingVerification'
import type { FoundryModelCatalogEntry } from '../domain/foundryCatalog'
import type { CostConfig, RateCard } from '../domain/types'
import { useLabStore } from '../state/useLabStore'
import { formatMoney } from '../utils/format'
import { NumberField } from './Controls'

interface PlanningProps {
  config: CostConfig
  rateCard: RateCard
  catalog: readonly FoundryModelCatalogEntry[]
}

function PlanningDetails({ config, rateCard, catalog }: PlanningProps) {
  const updateConfig = useLabStore((state) => state.updateConfig)
  const analysis = analyzePlanning(config, rateCard, catalog)
  return <div className="planning-details">
    <NumberField label="Traffic variation" value={analysis.percent} min={0} max={100} suffix="%"
      onChange={(value) => updateConfig((draft) => { draft.planning.variationPercent = Math.min(100, Math.max(0, value ?? 0)) })} />
    <p className="planning-caveat">Planning bounds, not confidence intervals. Only monthly users vary in this range; token sizes, independently entered service quantities and capacity remain fixed.</p>
    <div className="planning-range">
      {[['Low traffic', analysis.low], ['Base', analysis.base], ['High traffic', analysis.high]].map(([label, result]) => {
        if (typeof result === 'string') return null
        return <div key={String(label)}><span>{String(label)}</span><strong>{formatMoney(result.knownGrandTotal)}</strong><small>{getPricingCoverageSummary(result)}</small></div>
      })}
    </div>
    <h3>Most sensitive assumptions</h3>
    <p className="planning-caveat">One input at a time, plus or minus {analysis.percent}%. Cache variation uses percentage points. Active days are capped at 31.</p>
    <ul className="planning-sensitivity">
      {analysis.sensitivity.map((item) => <li key={item.id}>
        <strong>{item.label}</strong>
        <span>Lower input: {formatMoney(item.lower.knownGrandTotal)}<small>{getPricingCoverageSummary(item.lower)}</small></span>
        <span>Higher input: {formatMoney(item.upper.knownGrandTotal)}<small>{getPricingCoverageSummary(item.upper)}</small></span>
      </li>)}
    </ul>
    {analysis.sensitivity.length === 0 ? <p>No priced cost movement under these variations.</p> : null}
  </div>
}

export function PlanningPanel(props: PlanningProps) {
  const [open, setOpen] = useState(false)
  const updateConfig = useLabStore((state) => state.updateConfig)
  const { config } = props
  const evidence = config.planning.workloadEvidence
  const status = workloadEvidenceStatus(config)
  const updateEvidence = (field: 'source' | 'periodStart' | 'periodEnd', value: string) => updateConfig((draft) => {
    draft.planning.workloadEvidence[field] = value
    draft.planning.workloadEvidence.signature = ''
  })
  return <section className="result-section" aria-label="Planning assumptions">
    <details className="result-disclosure" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Planning range and sensitivity<ChevronDown aria-hidden="true" /></summary>
      {open ? <PlanningDetails {...props} /> : null}
    </details>
    <details className="result-disclosure">
      <summary>Workload evidence: {status}<ChevronDown aria-hidden="true" /></summary>
      <div className="planning-details">
        <label className="field"><span className="field__label">Measurement source (non-sensitive reference)</span>
          <input value={evidence.source} maxLength={200} onChange={(event) => updateEvidence('source', event.target.value)} />
        </label>
        <div className="field-grid field-grid--two">
          <label className="field"><span className="field__label">Observation start</span><input type="date" value={evidence.periodStart} onChange={(event) => updateEvidence('periodStart', event.target.value)} /></label>
          <label className="field"><span className="field__label">Observation end</span><input type="date" value={evidence.periodEnd} max={new Date().toISOString().slice(0, 10)} onChange={(event) => updateEvidence('periodEnd', event.target.value)} /></label>
        </div>
        <p className="planning-caveat">Attestation covers workload inputs, agent turns including retries, harness overhead, routing and model cache rates. Source measurements are not independently verified.</p>
        <button className="button button--quiet" type="button" disabled={!hasObservationPeriod(evidence)}
          onClick={() => updateConfig((draft) => { draft.planning.workloadEvidence.signature = workloadSignature(draft) })}>
          <Check aria-hidden="true" />Record measured workload
        </button>
        <NumberField label="Successful tasks / month" value={config.planning.successfulTasksPerMonth}
          hint="Explicit outcome count; not inferred from users or turns"
          onChange={(value) => updateConfig((draft) => { draft.planning.successfulTasksPerMonth = value === null ? null : Math.max(0, value) })} />
      </div>
    </details>
  </section>
}