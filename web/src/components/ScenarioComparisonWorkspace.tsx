import { AlertTriangle, ArrowLeft, CheckCircle2, LoaderCircle, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  comparisonBriefCacheKey,
  parseComparisonBriefResponse,
  readComparisonAiStatus,
  requestComparisonBrief,
  type ComparisonAiStatus,
  type ComparisonBrief,
  type ComparisonBriefItem,
} from '../domain/comparisonBrief'
import {
  buildScenarioComparison,
  type BuyerLens,
  type ComparisonScenarioSummary,
  type CompetitorLens,
} from '../domain/scenarioComparison'
import { COST_TIERS, type CostTier } from '../domain/types'
import { useScenarioComparisonData } from '../hooks/useScenarioComparisonData'
import { useLabStore } from '../state/useLabStore'
import { formatMoney } from '../utils/format'

const TIER_LABELS: Record<CostTier, string> = {
  run: 'Run',
  guardrail: 'Guardrail',
  platform: 'Platform',
  change: 'Change',
}

const SUMMARY_BUYER_LENS: BuyerLens = 'executive'
const SUMMARY_COMPETITOR_LENS: CompetitorLens = 'none'

const comparisonGridStyle = (count: number) => ({ '--comparison-count': count } as CSSProperties)

const signedMoney = (value: number) => value === 0
  ? 'Baseline'
  : `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value))}`

function ComparisonRow({
  label,
  values,
  className = '',
}: {
  label: string
  values: ReactNode[]
  className?: string
}) {
  return (
    <div className={`comparison-matrix__row ${className}`} role="row">
      <strong role="rowheader">{label}</strong>
      {values.map((value, index) => <div role="cell" key={index}>{value}</div>)}
    </div>
  )
}

function ScenarioHeader({
  summary,
  baseline,
}: {
  summary: ComparisonScenarioSummary
  baseline: boolean
}) {
  return (
    <div className={`comparison-scenario comparison-scenario--${summary.key.toLocaleLowerCase()}`}>
      <span>{summary.key}</span>
      <div>
        <strong>{summary.name}</strong>
        <small>{summary.regionLabel}</small>
      </div>
      {baseline ? <em>Baseline</em> : null}
    </div>
  )
}

function BriefSection({
  title,
  items,
  facts,
}: {
  title: string
  items: ComparisonBriefItem[]
  facts: ReadonlyMap<string, string>
}) {
  return (
    <section className="comparison-brief-section">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={`${title}-${item.text}-${item.factIds.join(':')}`}>
            <span>{item.text}</span>
            {item.factIds.length ? (
              <small title={item.factIds.map((id) => facts.get(id)).filter(Boolean).join('\n')}>
                {item.factIds.length} cited {item.factIds.length === 1 ? 'fact' : 'facts'}
              </small>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ScenarioComparisonWorkspace() {
  const scenarios = useLabStore((state) => state.scenarios)
  const comparisonIds = useLabStore((state) => state.comparisonIds)
  const closeComparison = useLabStore((state) => state.closeComparison)
  const selected = useMemo(() => comparisonIds.flatMap((id) => {
    const scenario = scenarios.find((candidate) => candidate.id === id)
    return scenario ? [scenario] : []
  }), [comparisonIds, scenarios])
  const { sources, loading, notices } = useScenarioComparisonData(selected)
  const [baselineId, setBaselineId] = useState(comparisonIds[0] ?? '')
  const [aiStatus, setAiStatus] = useState<ComparisonAiStatus | null>(null)
  const [aiBrief, setAiBrief] = useState<ComparisonBrief | null>(null)
  const [aiRemaining, setAiRemaining] = useState<number | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => {
    if (!comparisonIds.includes(baselineId)) setBaselineId(comparisonIds[0] ?? '')
  }, [baselineId, comparisonIds])

  useEffect(() => {
    let active = true
    void readComparisonAiStatus()
      .then((status) => { if (active) setAiStatus(status) })
      .catch(() => { if (active) setAiStatus({ enabled: false, model: null, dailyLimit: 20 }) })
    return () => { active = false }
  }, [])

  if (sources.length < 2) {
    return (
      <section className="comparison-workspace comparison-workspace--empty">
        <button type="button" className="button button--quiet" onClick={closeComparison}>
          <ArrowLeft aria-hidden="true" />Back to estimate
        </button>
        <div className="empty-state">Select two or three saved scenarios to compare.</div>
      </section>
    )
  }

  const analysis = buildScenarioComparison(sources, baselineId)
  const baseline = analysis.summaries[analysis.baselineIndex]
  const differingAssumptions = analysis.assumptions.filter((assumption) => assumption.differs)
  const gridStyle = comparisonGridStyle(analysis.summaries.length)
  const factText = new Map(analysis.facts.map((fact) => [fact.id, fact.text]))
  const explain = async () => {
    setAiLoading(true)
    setAiError(null)
    setAiBrief(null)
    setAiRemaining(null)
    const cacheKey = comparisonBriefCacheKey(SUMMARY_BUYER_LENS, SUMMARY_COMPETITOR_LENS, analysis.facts)
    try {
      try {
        const cached = window.localStorage.getItem(cacheKey)
        if (cached) {
          const parsed = parseComparisonBriefResponse(JSON.parse(cached) as unknown, analysis.facts)
          setAiBrief(parsed.brief)
          return
        }
      } catch {}
      const response = await requestComparisonBrief(SUMMARY_BUYER_LENS, SUMMARY_COMPETITOR_LENS, analysis.facts)
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(response))
      } catch {
        // A generated brief remains usable when browser storage is unavailable.
      }
      setAiBrief(response.brief)
      setAiRemaining(response.remainingToday)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI explanation is unavailable.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <section className="comparison-workspace" aria-labelledby="comparison-title">
      <header className="comparison-header">
        <div>
          <button type="button" className="button button--quiet" onClick={closeComparison}>
            <ArrowLeft aria-hidden="true" />Back to estimate
          </button>
          <span className="eyebrow">Customer decision workspace</span>
          <h2 id="comparison-title">Compare scenarios</h2>
          <p>Latest available CAD rates are loaded independently for each scenario region.</p>
        </div>
        <button
          type="button"
          className="button button--primary"
          disabled={!aiStatus?.enabled || aiLoading}
          title={aiStatus?.enabled ? `Generate with ${aiStatus.model}` : 'AI explanation is not enabled.'}
          onClick={() => void explain()}
        >
          {aiLoading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {aiLoading ? 'Generating summary' : 'Generate summary'}
        </button>
      </header>

      <div className="comparison-controls">
        <div className="comparison-control">
          <span>Compare against</span>
          <select value={baseline.id} onChange={(event) => setBaselineId(event.target.value)}>
            {analysis.summaries.map((summary) => (
              <option key={summary.id} value={summary.id}>{summary.key} · {summary.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="comparison-loading"><LoaderCircle className="spin" aria-hidden="true" />Refreshing regional comparison data...</div>
      ) : null}
      {notices.map((notice) => <div className="notice notice--warning" key={notice}>{notice}</div>)}

      <section className="comparison-band" aria-labelledby="scorecard-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">At a glance</span>
            <h3 id="scorecard-title">Business value and readiness</h3>
          </div>
          <span className="line-count">{analysis.summaries.length} saved scenarios</span>
        </div>
        <div className="comparison-matrix" role="table" style={gridStyle}>
          <div className="comparison-matrix__head" role="row">
            <span role="columnheader">Metric</span>
            {analysis.summaries.map((summary, index) => (
              <ScenarioHeader key={summary.id} summary={summary} baseline={index === analysis.baselineIndex} />
            ))}
          </div>
          <ComparisonRow label="Known monthly subtotal" values={analysis.summaries.map((summary, index) => (
            <span className="comparison-value" key={summary.id}>
              <strong>{formatMoney(summary.knownMonthlyTotal)}</strong>
              {index === analysis.lowestKnownIndex ? <small>Lowest known</small> : null}
            </span>
          ))} />
          <ComparisonRow label="Delta from baseline" values={analysis.summaries.map((summary, index) => {
            const delta = summary.knownMonthlyTotal - baseline.knownMonthlyTotal
            return <span key={summary.id} className={index === analysis.baselineIndex ? '' : delta > 0 ? 'delta-positive' : 'delta-negative'}>{signedMoney(delta)}</span>
          })} />
          <ComparisonRow label="Known annual subtotal" values={analysis.summaries.map((summary) => formatMoney(summary.knownAnnualTotal))} />
          <ComparisonRow label="Cost per monthly user" values={analysis.summaries.map((summary) => summary.costPerMonthlyUser === null ? 'Not available' : formatMoney(summary.costPerMonthlyUser, 2))} />
          <ComparisonRow label="Cost per 1K agent turns" values={analysis.summaries.map((summary) => summary.costPerThousandTurns === null ? 'Not available' : formatMoney(summary.costPerThousandTurns, 2))} />
          <ComparisonRow label="Pricing coverage" values={analysis.summaries.map((summary) => (
            <span key={summary.id} className={`comparison-status comparison-status--${summary.complete ? 'complete' : 'partial'}`}>
              {summary.complete ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              {summary.complete ? 'Complete' : `${summary.unpricedLineCount} unpriced`}
            </span>
          ))} />
          <ComparisonRow label="Security controls" values={analysis.summaries.map((summary) => `${summary.securityControlCount} of 5 included`)} />
          <ComparisonRow label="Private networking" values={analysis.summaries.map((summary) => summary.privateNetworking ? 'Included' : 'Excluded')} />
          <ComparisonRow label="Disaster recovery" values={analysis.summaries.map((summary) => summary.disasterRecovery ? 'Included' : 'Excluded')} />
        </div>
        {analysis.summaries.some((summary) => !summary.complete) ? (
          <div className="comparison-caveat">
            <AlertTriangle aria-hidden="true" />
            <span>Known subtotals are not equivalent to complete TCO where active lines remain unpriced.</span>
          </div>
        ) : null}
      </section>

      <section className="comparison-band" aria-labelledby="composition-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Cost composition</span>
            <h3 id="composition-title">Four-tier distribution</h3>
          </div>
        </div>
        <div className="comparison-composition" style={gridStyle}>
          {analysis.summaries.map((summary) => (
            <div key={summary.id} className="comparison-composition__scenario">
              <ScenarioHeader summary={summary} baseline={summary.id === baseline.id} />
              <div className="comparison-tier-stack" aria-label={`${summary.name} tier distribution`}>
                {COST_TIERS.map((tier) => {
                  const percent = summary.knownMonthlyTotal > 0 ? summary.tiers[tier] / summary.knownMonthlyTotal * 100 : 0
                  return <span key={tier} className={`tier-bar__segment tier-bar__segment--${tier}`} style={{ width: `${percent}%` }} title={`${TIER_LABELS[tier]} ${percent.toFixed(1)}%`} />
                })}
              </div>
              <div className="comparison-tier-values">
                {COST_TIERS.map((tier) => <span key={tier}><i className={`tier-dot tier-dot--${tier}`} />{TIER_LABELS[tier]}<strong>{formatMoney(summary.tiers[tier])}</strong></span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="comparison-band" aria-labelledby="drivers-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Cost movement</span>
            <h3 id="drivers-title">Top cost drivers</h3>
          </div>
          <span className="line-count">Compared with {baseline.key}</span>
        </div>
        <div className="comparison-matrix comparison-matrix--drivers" role="table" style={gridStyle}>
          <div className="comparison-matrix__head" role="row">
            <span role="columnheader">Cost line</span>
            {analysis.summaries.map((summary, index) => <ScenarioHeader key={summary.id} summary={summary} baseline={index === analysis.baselineIndex} />)}
          </div>
          {analysis.drivers.slice(0, 8).map((driver) => (
            <ComparisonRow key={driver.id} label={driver.label} values={driver.values.map((value, index) => {
              if (value.state === 'unpriced') return <span key={`${driver.id}-${index}`} className="comparison-unpriced">Unpriced</span>
              if (value.state === 'inactive') return <span key={`${driver.id}-${index}`} className="comparison-inactive">Not included</span>
              const delta = driver.deltasFromBaseline[index]
              return <span key={`${driver.id}-${index}`} className="comparison-value"><strong>{formatMoney(value.amount ?? 0, 2)}</strong>{index !== analysis.baselineIndex && delta !== null ? <small>{signedMoney(delta)}</small> : null}</span>
            })} />
          ))}
          {analysis.drivers.length === 0 ? <div className="empty-state">No differing priced cost lines.</div> : null}
        </div>
      </section>

      <section className="comparison-band" aria-labelledby="assumptions-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Architecture choices</span>
            <h3 id="assumptions-title">Changed assumptions</h3>
          </div>
          <span className="line-count">{differingAssumptions.length} differences</span>
        </div>
        <div className="comparison-matrix comparison-matrix--assumptions" role="table" style={gridStyle}>
          <div className="comparison-matrix__head" role="row">
            <span role="columnheader">Assumption</span>
            {analysis.summaries.map((summary, index) => <ScenarioHeader key={summary.id} summary={summary} baseline={index === analysis.baselineIndex} />)}
          </div>
          {differingAssumptions.map((assumption) => <ComparisonRow key={assumption.id} label={assumption.label} values={assumption.values} />)}
          {differingAssumptions.length === 0 ? <div className="empty-state">Selected architecture assumptions match.</div> : null}
        </div>
      </section>

      <section className="comparison-band comparison-ai" aria-labelledby="ai-brief-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Optional</span>
            <h3 id="ai-brief-title">Decision summary</h3>
          </div>
          <span className="line-count">
            {aiRemaining === null ? `${analysis.facts.length} deterministic facts ready` : `${aiRemaining} generations remaining today`}
          </span>
        </div>
        {aiError ? <div className="notice notice--warning">{aiError}</div> : null}
        {aiBrief ? (
          <div className="comparison-brief">
            <div className="comparison-brief__summary">
              <strong>Summary</strong>
              <p>{aiBrief.summary.text}</p>
              {aiBrief.summary.factIds.length ? <small>{aiBrief.summary.factIds.length} cited facts</small> : null}
            </div>
            <div className="comparison-brief__grid">
              <BriefSection title="Strengths to consider" items={aiBrief.microsoftWinThemes} facts={factText} />
              <BriefSection title="Trade-offs to consider" items={aiBrief.competitiveExposure} facts={factText} />
              <BriefSection title="Evidence to confirm" items={aiBrief.proofGaps} facts={factText} />
              <BriefSection title="Questions to resolve" items={aiBrief.discoveryQuestions} facts={factText} />
            </div>
            <small className="comparison-brief__model">AI-generated from the comparison above. Verify before use.</small>
          </div>
        ) : (
          <div className="comparison-ai__empty">
            <Sparkles aria-hidden="true" />
            <div>
              <strong>{aiStatus?.enabled ? 'Create a concise summary' : 'Optional summary is unavailable'}</strong>
              <span>{aiStatus?.enabled
                ? 'Uses only the facts shown in this comparison.'
                : 'The comparison above is complete and remains fully usable.'}</span>
            </div>
          </div>
        )}
      </section>

      <footer className="app-footer">
        <strong>Comparison is a planning estimate, not a commercial quote.</strong>
        <span>Confirm unpriced items and implementation assumptions before making a final decision.</span>
      </footer>
    </section>
  )
}