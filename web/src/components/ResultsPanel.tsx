import { AlertCircle, Bot, CalendarClock, CheckCircle2, Gauge, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react'
import { lazy, Suspense } from 'react'
import type { FoundryModelCatalogEntry } from '../domain/foundryCatalog'
import {
  buildPricingReadiness,
  type PricingCoverageStatus,
  type PricingReadiness,
} from '../domain/pricingReadiness'
import { COST_TIERS, REGION_LABELS, type CostConfig, type CostResult, type CostTier, type RateCard } from '../domain/types'
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
          <span className="eyebrow">Commercial model</span>
          <h2 id="breakeven-title">PTU vs PAYG breakeven</h2>
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

function PricingReadinessPanel({ readiness }: { readiness: PricingReadiness }) {
  return (
    <section className="result-section" aria-labelledby="pricing-readiness-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Decision gate</span>
          <h2 id="pricing-readiness-title">Pricing readiness</h2>
        </div>
        <CoverageBadge status={readiness.modelStatus} />
      </div>

      <div className="pricing-context">
        <div>
          <span>Model</span>
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
            </span>
          </div>
        ))}
        {readiness.dimensions.length === 0 ? (
          <div className="pricing-matrix__empty">Commercial model pricing is disabled.</div>
        ) : null}
      </div>

      {readiness.decisionBlockers.length > 0 ? (
        <div className="decision-blockers">
          <AlertCircle aria-hidden="true" />
          <div>
            <strong>Approval blocked</strong>
            <small>Complete the selected model/SKU price profile under Run → Commercial model.</small>
            <span>{readiness.decisionBlockers.join(' · ')}</span>
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
}: {
  result: CostResult
  config: CostConfig
  rateCard: RateCard
  rateDiff: RateDiffState
  modelCatalog: readonly FoundryModelCatalogEntry[]
}) {
  const elapsed = elapsedDays(config.periodStart, new Date())
  const accrued = result.dailyBurn * elapsed
  const unpricedCount = result.lines.filter((line) => line.amount === null).length
  const pricingReadiness = buildPricingReadiness(config, rateCard, result, modelCatalog)

  return (
    <section className="results-panel" aria-label="Cost results" aria-live="polite">
      <div className="headline">
        <div>
          <span className="eyebrow">{result.complete ? 'Estimated monthly cost' : 'Known monthly subtotal'}</span>
          <div className="headline__value">{formatMoney(result.knownGrandTotal)}</div>
          <div className="headline__meta">
            {result.complete ? (
              <span className="status-inline status-inline--ok"><CheckCircle2 aria-hidden="true" />All active lines priced</span>
            ) : (
              <span className="status-inline status-inline--warning"><AlertCircle aria-hidden="true" />{unpricedCount} active line{unpricedCount === 1 ? '' : 's'} unpriced</span>
            )}
            <span>CAD list-rate estimate</span>
          </div>
        </div>
        <div className="headline__stamp">
          <span>Rate card</span>
          <strong>{formatDate(rateCard.asOf)}</strong>
          <small>{REGION_LABELS[rateCard.region]}</small>
        </div>
      </div>

      <div className="metric-strip">
        <div><TrendingUp aria-hidden="true" /><span>Daily burn<strong>{formatMoney(result.dailyBurn, 2)}</strong></span></div>
        <div><CalendarClock aria-hidden="true" /><span>Accrued since {formatDate(config.periodStart)}<strong>{formatMoney(accrued)}</strong><small>{elapsed} of 30 modelled days</small></span></div>
        <div><Bot aria-hidden="true" /><span>Agent turns<strong>{formatNumber(result.metrics.monthlyTurns)}</strong><small>{formatNumber(result.metrics.mcpSchemaTokens)} MCP schema tokens</small></span></div>
      </div>

      <PricingReadinessPanel readiness={pricingReadiness} />

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

      <TierBreakdown result={result} />
      <Breakeven result={result} />
      <RateChanges state={rateDiff} />
      <CostLines result={result} />
    </section>
  )
}