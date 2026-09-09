import { AlertCircle, ArrowUpRight, Bot, CalendarClock, CheckCircle2, ChevronDown, Gauge, RefreshCw, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { FoundryModelCatalogEntry } from '../domain/foundryCatalog'
import { getLastKnownRateLines, getPricingCoverageSummary, usesLastKnownRate } from '../domain/pricingVerification'
import {
  buildPricingReadiness,
  type PricingCoverageStatus,
  type PricingReadiness,
} from '../domain/pricingReadiness'
import { COST_TIERS, REGION_LABELS, type CostConfig, type CostLine, type CostResult, type CostTier, type RateCard } from '../domain/types'
import type { RateDiffState } from '../hooks/useRateDiff'
import { formatDate, formatMoney, formatNumber, formatPercent } from '../utils/format'
import { ProvenanceTooltip } from './ProvenanceTooltip'

const ProjectionChart = lazy(() => import('./ProjectionChart'))

const TIER_LABELS: Record<CostTier, string> = {
  run: 'Run',
  guardrail: 'Guardrail',
  platform: 'Platform',
  change: 'Change',
}

const COVERAGE_LABELS: Record<PricingCoverageStatus, string> = {
  exact: 'Retail',
  manual: 'Fallback',
  mixed: 'Mixed',
  'last-known': 'Last-known',
  unpriced: 'Unpriced',
  inactive: 'Excluded',
}

function elapsedDays(periodStart: string, now: Date) {
  const start = new Date(`${periodStart}T00:00:00`)
  if (Number.isNaN(start.getTime()) || now < start) return 0
  return Math.min(30, Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1)
}

function TierBreakdown({ result }: { result: CostResult }) {
  const guardrailShare =
    result.knownGrandTotal === 0
      ? 0
      : result.tiers.guardrail.knownSubtotal / result.knownGrandTotal

  return (
    <section className="result-section" aria-labelledby="tier-breakdown-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Cost attribution</span>
          <h2 id="tier-breakdown-title">Four-tier breakdown</h2>
        </div>
        <div className="guardrail-callout">
          <ShieldCheck aria-hidden="true" />
          <span><strong>{formatPercent(guardrailShare)}</strong> guardrail share</span>
        </div>
      </div>
      <div className="tier-bar" aria-label="Tier percentage distribution">
        {COST_TIERS.map((tier) => {
          const percent =
            result.knownGrandTotal === 0
              ? 0
              : (result.tiers[tier].knownSubtotal / result.knownGrandTotal) * 100
          return (
            <span
              key={tier}
              className={`tier-bar__segment tier-bar__segment--${tier}`}
              style={{ width: `${Math.max(0, percent)}%` }}
              title={`${TIER_LABELS[tier]} ${percent.toFixed(1)}%`}
            />
          )
        })}
      </div>
      <div className="tier-grid">
        {COST_TIERS.map((tier) => {
          const total = result.tiers[tier]
          const percent =
            result.knownGrandTotal === 0 ? 0 : total.knownSubtotal / result.knownGrandTotal
          return (
            <div key={tier} className={`tier-summary tier-summary--${tier}`}>
              <span>{TIER_LABELS[tier]}</span>
              <strong>{formatMoney(total.knownSubtotal)}</strong>
              <small>{formatPercent(percent)}{total.unpricedLineCount ? ` + ${total.unpricedLineCount} unpriced` : ''}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CostLines({ result }: { result: CostResult }) {
  return (
    <section className="result-section" aria-labelledby="cost-lines-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Audit trail</span>
          <h2 id="cost-lines-title">Monthly cost lines</h2>
        </div>
        <span className="line-count">{result.lines.length} active lines</span>
      </div>
      <div className="cost-table">
        {COST_TIERS.map((tier) => {
          const lines = result.lines.filter((line) => line.tier === tier)
          if (lines.length === 0) return null
          return (
            <div key={tier} className="cost-table__group">
              <div className={`cost-table__tier cost-table__tier--${tier}`}>
                <span>{TIER_LABELS[tier]}</span>
                <strong>{formatMoney(result.tiers[tier].knownSubtotal)}</strong>
              </div>
              {lines.map((line) => (
                <div key={line.id} className={`cost-line${line.amount === null ? ' cost-line--unpriced' : ''}`}>
                  <div className="cost-line__name">
                    <strong>{line.label}</strong>
                    <span>{line.detail}</span>
                  </div>
                  <div className="cost-line__amount">
                    {line.amount === null ? <span>Unpriced</span> : <strong>{formatMoney(line.amount, 2)}</strong>}
                    {usesLastKnownRate(line) ? <CoverageBadge status="last-known" /> : null}
                    <ProvenanceTooltip line={line} />
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Breakeven({ result }: { result: CostResult }) {
  const { tokensPerMonth, capacityTokensPerMonth, feasibleWithinCapacity } = result.breakeven
  return (
    <section className="result-section" aria-labelledby="breakeven-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Primary model</span>
          <h2 id="breakeven-title">Primary deployment PTU vs PAYG</h2>
        </div>
        <Gauge aria-hidden="true" />
      </div>
      <div className="breakeven-grid">
        <div><span>Breakeven volume</span><strong>{tokensPerMonth === null ? 'Unpriced' : `${formatNumber(tokensPerMonth)} tokens/mo`}</strong></div>
        <div><span>Configured capacity</span><strong>{capacityTokensPerMonth === null ? 'Not supplied' : `${formatNumber(capacityTokensPerMonth)} tokens/mo`}</strong></div>
        <div className={`feasibility feasibility--${feasibleWithinCapacity === true ? 'yes' : feasibleWithinCapacity === false ? 'no' : 'pending'}`}>
          {feasibleWithinCapacity === true ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
          <span>{feasibleWithinCapacity === true ? 'Feasible within capacity' : feasibleWithinCapacity === false ? 'Breakeven exceeds capacity' : 'Capacity check pending'}</span>
        </div>
      </div>
    </section>
  )
}

function CoverageBadge({ status }: { status: PricingCoverageStatus }) {
  return (
    <span className={`coverage-badge coverage-badge--${status}`}>
      {COVERAGE_LABELS[status]}
    </span>
  )
}

type CostEditTarget = Pick<CostLine, 'tier' | 'blockId'>

function PricingReadinessPanel({ readiness, result, onEdit }: {
  readiness: PricingReadiness
  result: CostResult
  onEdit: (target: CostEditTarget) => void
}) {
  const reviewLines = result.lines.filter((line) => line.amount === null || usesLastKnownRate(line))
  return (
    <section className="result-section" id="pricing-readiness" aria-labelledby="pricing-readiness-title" tabIndex={-1}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Decision gate</span>
          <h2 id="pricing-readiness-title">Pricing readiness</h2>
        </div>
        <CoverageBadge status={readiness.modelStatus} />
      </div>

      <div className="pricing-context">
        <div>
          <span>Model portfolio</span>
          <strong>{readiness.modelLabel}</strong>
          <small>{readiness.modelSource}</small>
        </div>
        <div>
          <span>Deployment SKU</span>
          <strong>{readiness.deploymentSkuLabel}</strong>
        </div>
        <div>
          <span>Processing boundary</span>
          <strong>{readiness.processingBoundary}</strong>
        </div>
      </div>

      <details className="result-disclosure">
        <summary>Model rate details<ChevronDown aria-hidden="true" /></summary>
      <div className="pricing-matrix" role="table" aria-label="Selected model pricing matrix">
        <div className="pricing-matrix__head" role="row">
          <span role="columnheader">Dimension</span>
          <span role="columnheader">CAD rate</span>
          <span role="columnheader">Coverage</span>
          <span role="columnheader">Source</span>
        </div>
        {readiness.dimensions.map((dimension) => (
          <div className="pricing-matrix__row" role="row" key={dimension.id}>
            <strong role="cell">
              {dimension.label}
              {!dimension.required ? <small>Optional overflow</small> : null}
            </strong>
            <span role="cell" className="pricing-matrix__rate">
              {dimension.value === null ? 'Unpriced' : formatMoney(dimension.value, 5)}
              <small>{dimension.unit}</small>
            </span>
            <span role="cell"><CoverageBadge status={dimension.status} /></span>
            <span role="cell" className="pricing-matrix__source">
              {dimension.source}
              <small>{dimension.asOf}</small>
              {dimension.verificationReason ? <small>{dimension.verificationReason}</small> : null}
            </span>
          </div>
        ))}
        {readiness.dimensions.length === 0 ? (
          <div className="pricing-matrix__empty">Model pricing is disabled.</div>
        ) : null}
      </div>

      </details>

      {readiness.decisionBlockers.length > 0 || reviewLines.length > 0 ? (
        <div className="decision-blockers">
          <AlertCircle aria-hidden="true" />
          <div>
            <strong>Approval blocked</strong>
            <small>Unpriced and last-known rates require review.</small>
            {readiness.decisionBlockers.length > 0 ? <span>{readiness.decisionBlockers.join(' · ')}</span> : null}
            <ul className="pricing-actions">
              {reviewLines.map((line) => (
                <li key={line.id}>
                  <button type="button" onClick={() => onEdit(line)} aria-label={`Edit ${line.label}`}>
                    <span>{line.label}<small>{usesLastKnownRate(line) ? 'Last-known rate needs verification' : 'Unpriced'}</small></span>
                    <ArrowUpRight aria-hidden="true" />
                  </button>
                </li>
              ))}
              {reviewLines.length === 0 ? <li><button type="button" onClick={() => onEdit({ tier: 'run', blockId: 'commercialModel' })}>Edit model pricing<ArrowUpRight aria-hidden="true" /></button></li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="technical-readiness" aria-label="Technical product pricing coverage">
        {readiness.blocks.map((block) => (
          <div className="technical-readiness__row" key={block.id}>
            <strong>{block.label}</strong>
            <span>
              {block.status === 'inactive'
                ? 'Not included in this scenario'
                : block.missingDimensions.length > 0
                  ? block.missingDimensions.join(', ')
                  : block.status === 'last-known'
                    ? `${block.lineCount} priced lines; includes last-known rates`
                  : `${block.lineCount} priced line${block.lineCount === 1 ? '' : 's'}`}
            </span>
            <CoverageBadge status={block.status} />
          </div>
        ))}
      </div>
    </section>
  )
}

function RateChanges({ state }: { state: RateDiffState }) {
  return (
    <section className="result-section" aria-labelledby="rate-changes-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Rate governance</span>
          <h2 id="rate-changes-title">Day-over-day changes</h2>
        </div>
        <RefreshCw className={state.loading ? 'spin' : ''} aria-hidden="true" />
      </div>
      {state.loading ? <div className="rate-diff-empty">Loading rate history...</div> : null}
      {state.unavailable ? <div className="rate-diff-empty">Rate history is unavailable; the active card remains usable.</div> : null}
      {state.data && !state.data.previousAsOf ? <div className="rate-diff-empty">No prior snapshot is available yet.</div> : null}
      {state.data?.previousAsOf && state.data.changes.length === 0 ? (
        <div className="rate-diff-empty">No list-rate changes since {formatDate(state.data.previousAsOf)}.</div>
      ) : null}
      {state.data && state.data.changes.length > 0 ? (
        <div className="rate-diff-list">
          {state.data.changes.map((change) => (
            <div key={change.key} className="rate-diff-row">
              <code>{change.key}</code>
              <span>{change.previousValue === null ? 'Unpriced' : formatMoney(change.previousValue, 5)}</span>
              <span aria-hidden="true">to</span>
              <strong>{change.currentValue === null ? 'Unpriced' : formatMoney(change.currentValue, 5)}</strong>
              <small>{change.unit}</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function ResultsPanel({
  result,
  config,
  rateCard,
  rateDiff,
  modelCatalog,
  onEditCostLine,
  onReviewPricing,
}: {
  result: CostResult
  config: CostConfig
  rateCard: RateCard
  rateDiff: RateDiffState
  modelCatalog: readonly FoundryModelCatalogEntry[]
  onEditCostLine: (target: CostEditTarget) => void
  onReviewPricing: () => void
}) {
  const [planningOpen, setPlanningOpen] = useState(false)
  const elapsed = elapsedDays(config.periodStart, new Date())
  const accrued = result.dailyBurn * elapsed
  const pricingCurrent = result.complete && getLastKnownRateLines(result).length === 0
  const pricingReadiness = buildPricingReadiness(config, rateCard, result, modelCatalog)
  const pricedCharges = result.lines.reduce((total, line) => total + Math.max(0, line.amount ?? 0), 0)
  const drivers = result.lines.filter((line) => (line.amount ?? 0) > 0)
    .sort((left, right) => (right.amount ?? 0) - (left.amount ?? 0)).slice(0, 3)

  return (
    <section className="results-panel" id="cost-results" aria-label="Cost results" tabIndex={-1}>
      <div className="headline">
        <div>
          <span className="eyebrow">{pricingCurrent ? 'Estimated monthly cost' : 'Known monthly subtotal'}</span>
          <div className="headline__value">{formatMoney(result.knownGrandTotal)}</div>
          <div className="headline__meta">
            {pricingCurrent ? (
              <span className="status-inline status-inline--ok"><CheckCircle2 aria-hidden="true" />All active lines priced</span>
            ) : (
              <span className="status-inline status-inline--warning"><AlertCircle aria-hidden="true" />{getPricingCoverageSummary(result)}</span>
            )}
            <span>CAD list-rate estimate</span>
            {!pricingCurrent ? <button type="button" className="button button--quiet" onClick={onReviewPricing}>Review pricing<ArrowUpRight aria-hidden="true" /></button> : null}
          </div>
        </div>
        <div className="headline__stamp">
          <span>Rate card</span>
          <strong>{formatDate(rateCard.asOf)}</strong>
          <small>{REGION_LABELS[rateCard.region]}</small>
        </div>
      </div>

      <div className="metric-strip">
        <div><Users aria-hidden="true" /><span>Known cost / monthly user<strong>{config.workload.monthlyUsers > 0 ? formatMoney(result.knownGrandTotal / config.workload.monthlyUsers, 2) : 'Not available'}</strong></span></div>
        <div><Gauge aria-hidden="true" /><span>Known cost / 1K turns<strong>{result.metrics.monthlyTurns > 0 ? formatMoney(result.knownGrandTotal / result.metrics.monthlyTurns * 1000, 2) : 'Not available'}</strong></span></div>
        <div><Bot aria-hidden="true" /><span>Agent turns<strong>{formatNumber(result.metrics.monthlyTurns)}</strong><small>{formatNumber(result.metrics.mcpSchemaTokens)} MCP schema tokens</small></span></div>
      </div>

      <section className="result-section" aria-labelledby="cost-drivers-title">
        <div className="section-heading"><div><span className="eyebrow">Largest contributors</span><h2 id="cost-drivers-title">Known cost drivers</h2></div></div>
        <ol className="cost-drivers">
          {drivers.map((line) => (
            <li key={line.id}>
              <button type="button" onClick={() => onEditCostLine(line)} aria-label={`Edit cost driver: ${line.label}`}>
                <span><strong>{line.label}</strong><small>{TIER_LABELS[line.tier]} / {formatPercent((line.amount ?? 0) / pricedCharges)} of priced charges</small></span>
                <strong>{formatMoney(line.amount ?? 0)}</strong><ArrowUpRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        {drivers.length === 0 ? <p className="rate-diff-empty">No priced charges in this estimate.</p> : null}
      </section>

      <TierBreakdown result={result} />
      <PricingReadinessPanel readiness={pricingReadiness} result={result} onEdit={onEditCostLine} />
      <CostLines result={result} />

      <details className="result-disclosure" onToggle={(event) => setPlanningOpen(event.currentTarget.open)}>
        <summary>Projection, capacity and rate history<ChevronDown aria-hidden="true" /></summary>
        {planningOpen ? <>
      <div className="metric-strip">
        <div><TrendingUp aria-hidden="true" /><span>Modeled daily spend<strong>{formatMoney(result.dailyBurn, 2)}</strong></span></div>
        <div><CalendarClock aria-hidden="true" /><span>Modeled spend to date<strong>{formatMoney(accrued)}</strong><small>Since {formatDate(config.periodStart)} / {elapsed} of 30 modeled days</small></span></div>
      </div>

      <section className="result-section" aria-labelledby="projection-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Forward view</span>
            <h2 id="projection-title">30-day projection</h2>
          </div>
          <strong>{formatMoney(result.projection.at(-1)?.cumulative ?? 0)}</strong>
        </div>
        <Suspense fallback={<div className="chart-wrap chart-wrap--loading">Loading projection...</div>}>
          <ProjectionChart result={result} />
        </Suspense>
      </section>

      <Breakeven result={result} />
      <RateChanges state={rateDiff} />
        </> : null}
      </details>
    </section>
  )
}