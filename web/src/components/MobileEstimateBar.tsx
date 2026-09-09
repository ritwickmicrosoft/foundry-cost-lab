import * as Tabs from '@radix-ui/react-tabs'
import { AlertTriangle, ChartNoAxesCombined, ChevronRight, CircleCheck, SlidersHorizontal } from 'lucide-react'
import { getLastKnownRateLines } from '../domain/pricingVerification'
import type { CostResult } from '../domain/types'
import { formatMoney } from '../utils/format'

export function MobileEstimateBar({ result, loading, hidden, onReviewPricing }: {
  result: CostResult
  loading: boolean
  hidden: boolean
  onReviewPricing: () => void
}) {
  const issues = result.lines.filter((line) => line.amount === null).length + getLastKnownRateLines(result).length
  const fullTotal = formatMoney(result.knownGrandTotal)
  const displayTotal = result.knownGrandTotal >= 1_000_000
    ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 2 }).format(result.knownGrandTotal)
    : fullTotal
  return (
    <section className="mobile-workspace" aria-label="Estimate summary" hidden={hidden}>
      <div className="mobile-estimate">
        <div className="mobile-estimate__total">
          <span>{issues ? 'Known subtotal' : 'Monthly estimate'} <span aria-hidden="true">/</span> CAD</span>
          <output aria-label="Monthly estimate in CAD" aria-live="polite" title={fullTotal}>{loading ? 'Pending' : displayTotal}</output>
        </div>
        <button type="button" className="mobile-estimate__review" onClick={onReviewPricing} disabled={loading}>
          {issues ? <AlertTriangle aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
          <span>Review pricing<small>{loading ? 'Loading rates' : issues ? `${issues} to review` : 'All lines priced'}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <Tabs.List className="mobile-workspace__tabs" aria-label="Workspace views">
        <Tabs.Trigger value="configure"><SlidersHorizontal aria-hidden="true" />Configure</Tabs.Trigger>
        <Tabs.Trigger value="results"><ChartNoAxesCombined aria-hidden="true" />Results</Tabs.Trigger>
      </Tabs.List>
    </section>
  )
}