import { ArrowLeft, Download, RefreshCw } from 'lucide-react'
import { useId, useState } from 'react'
import { repriceEstimateRevision, type EstimateRevision } from '../domain/estimateRevision'
import { getPricingCoverageSummary } from '../domain/pricingVerification'
import { REGION_LABELS, type CostConfig } from '../domain/types'
import { useRateCard } from '../hooks/useRateCard'
import { useFoundryCatalog } from '../hooks/useFoundryCatalog'
import { formatMoney } from '../utils/format'
import { ProvenanceTooltip } from './ProvenanceTooltip'

function RepricingPreview({ revision, onLoad }: { revision: EstimateRevision; onLoad: (config: CostConfig) => void }) {
  const rates = useRateCard(revision.config.region)
  const catalog = useFoundryCatalog(revision.config.region)
  if (rates.loading || catalog.loading) return <p role="status">Loading regional repricing data...</p>
  const comparison = repriceEstimateRevision(revision, rates.rateCard, catalog.catalog.models)
  const delta = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${formatMoney(Math.abs(amount), 2)}`
  return <section className="planning-details" aria-label="Repricing preview">
    <h3>Current-price working copy</h3>
    {rates.notice ? <p className="planning-caveat">{rates.notice}</p> : null}
    {catalog.notice ? <p className="planning-caveat">{catalog.notice}</p> : null}
    <p>Rates as of {rates.rateCard.asOf}: <strong>{formatMoney(comparison.repriced.knownGrandTotal)}</strong></p>
    <p>{getPricingCoverageSummary(comparison.repriced)}</p>
    <dl className="revision-deltas">
      <dt>Rate movement</dt><dd>{delta(comparison.rateDelta)}</dd>
      <dt>Calculation version movement</dt><dd>{delta(comparison.calculationDelta)}</dd>
      <dt>Catalog movement</dt><dd>{delta(comparison.catalogDelta)}</dd>
      <dt>Workload edits</dt><dd>None</dd>
      <dt>Known subtotal difference</dt><dd>{delta(comparison.totalDelta)}</dd>
    </dl>
    <p className="planning-caveat">Known-subtotal differences are not savings when pricing coverage differs. The original revision remains unchanged.</p>
    <button type="button" className="button button--primary" onClick={() => onLoad(revision.config)}><RefreshCw aria-hidden="true" />Load inputs at current prices</button>
  </section>
}

export function RevisionReview({ name, revisions, onBack, onDownload, onLoad }: {
  name: string
  revisions: EstimateRevision[]
  onBack: () => void
  onDownload: (revision: EstimateRevision) => void
  onLoad: (config: CostConfig) => void
}) {
  const [selectedIndex, setSelectedIndex] = useState(revisions.length - 1)
  const revisionFieldId = useId()
  const [repricing, setRepricing] = useState(false)
  const revision = revisions[selectedIndex]
  return <section className="planning-details" aria-label="Original estimate">
    <button type="button" className="button button--quiet" onClick={onBack}><ArrowLeft aria-hidden="true" />Back to scenarios</button>
    <h3>{name}</h3>
    <label className="field"><span className="field__label" id={revisionFieldId}>Estimate revision</span><select aria-labelledby={revisionFieldId} value={selectedIndex} onChange={(event) => { setSelectedIndex(Number(event.target.value)); setRepricing(false) }}>
      {revisions.map((item, index) => <option key={`${item.id}-${index}`} value={index}>Revision {index + 1} / {item.capturedAt}</option>)}
    </select></label>
    <span>Original known monthly subtotal</span><strong className="revision-total">{formatMoney(revision.result.knownGrandTotal)}</strong>
    <span>{getPricingCoverageSummary(revision.result)}</span>
    <p className="planning-caveat">Read-only archive. {REGION_LABELS[revision.config.region]} / Rates {revision.rateCard.asOf} / Calculation {revision.calculationVersion}. Imported archives are not digitally signed.</p>
    <div className="scenario-file-actions">
      <button type="button" className="button button--quiet" onClick={() => onDownload(revision)}><Download aria-hidden="true" />Export original JSON</button>
      <button type="button" className="button button--primary" onClick={() => setRepricing(true)}><RefreshCw aria-hidden="true" />Reprice</button>
    </div>
    <details className="result-disclosure"><summary>Archived cost lines</summary>
      <ul className="planning-sensitivity">{revision.result.lines.map((line) => <li key={line.id}>
        <strong>{line.label}</strong><span>{line.amount === null ? 'Unpriced' : formatMoney(line.amount, 2)}</span>
        <span>{line.provenance.source} / {line.provenance.asOf}<ProvenanceTooltip line={line} /></span>
      </li>)}</ul>
    </details>
    {repricing ? <RepricingPreview key={revision.id} revision={revision} onLoad={onLoad} /> : null}
  </section>
}