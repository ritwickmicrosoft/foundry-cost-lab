import * as Tooltip from '@radix-ui/react-tooltip'
import { CircleAlert, CircleDollarSign, ExternalLink } from 'lucide-react'
import type { CostLine } from '../domain/types'
import { formatDate, formatMoney, formatNumber } from '../utils/format'

export function ProvenanceTooltip({ line }: { line: CostLine }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={`source-button${line.amount === null ? ' source-button--missing' : ''}`}
          aria-label={`Show source for ${line.label}`}
        >
          {line.amount === null ? <CircleAlert aria-hidden="true" /> : <CircleDollarSign aria-hidden="true" />}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="provenance" side="left" sideOffset={8} collisionPadding={12}>
          <div className="provenance__header">
            <strong>{line.label}</strong>
            <span className={`badge badge--${line.provenance.maintenance}`}>
              {line.provenance.maintenance}
            </span>
          </div>
          <dl>
            <div><dt>Source</dt><dd>{line.provenance.source}</dd></div>
            <div><dt>As of</dt><dd>{formatDate(line.provenance.asOf)}</dd></div>
            {line.provenance.lastReviewed ? (
              <div><dt>Reviewed</dt><dd>{formatDate(line.provenance.lastReviewed)}</dd></div>
            ) : null}
            {line.provenance.unavailableReason ? (
              <div><dt>Unavailable</dt><dd>{line.provenance.unavailableReason}</dd></div>
            ) : null}
            <div>
              <dt>Rate</dt>
              <dd>{line.unitRate === null ? 'Unavailable' : `${formatMoney(line.unitRate, 5)} / ${line.rateUnit.replace('CAD/', '')}`}</dd>
            </div>
            <div><dt>Quantity</dt><dd>{formatNumber(line.quantity, 2)} {line.quantityUnit}</dd></div>
            <div><dt>Formula</dt><dd>{line.formula}</dd></div>
            <div><dt>Assumption</dt><dd>{line.assumption}</dd></div>
          </dl>
          {line.provenance.sourceUrl ? (
            <a href={line.provenance.sourceUrl} target="_blank" rel="noreferrer">
              Open source <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          <Tooltip.Arrow className="provenance__arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}