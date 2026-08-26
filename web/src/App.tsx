import * as Tooltip from '@radix-ui/react-tooltip'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { ConfigPanel } from './components/ConfigPanel'
import { AccessRequestsDialog } from './components/AccessRequestsDialog'
import { PwaControls } from './components/PwaControls'
import { ResultsPanel } from './components/ResultsPanel'
import { ScenarioActions } from './components/ScenarioManager'
import { ScenarioComparisonWorkspace } from './components/ScenarioComparisonWorkspace'
import { computeCost } from './domain/computeCost'
import { getRateCardFreshness } from './domain/rates'
import { useFoundryCatalog } from './hooks/useFoundryCatalog'
import { useRateCard } from './hooks/useRateCard'
import { useRateDiff } from './hooks/useRateDiff'
import { labStorage, useLabStore } from './state/useLabStore'
import './App.css'

function App() {
  const config = useLabStore((state) => state.config)
  const updateConfig = useLabStore((state) => state.updateConfig)
  const applyPreset = useLabStore((state) => state.applyPreset)
  const comparisonOpen = useLabStore((state) => state.comparisonOpen)
  const { rateCard, loading, usingFallback, notice } = useRateCard(config.region)
  const { catalog, notice: catalogNotice } = useFoundryCatalog(config.region)
  const rateDiff = useRateDiff(config.region)
  const result = computeCost(config, rateCard, catalog.models)
  const freshness = getRateCardFreshness(rateCard, new Date())
  const activeUnpricedLines = result.lines.filter((line) => line.amount === null)
  const activeRateNotice = activeUnpricedLines.length > 0
    ? `Current estimate excludes ${activeUnpricedLines.length} active unpriced ${activeUnpricedLines.length === 1 ? 'line' : 'lines'}: ${activeUnpricedLines.map((line) => line.label).join(', ')}. Open each warning icon for the exact reason.`
    : null
  const regionalResilienceNotice = config.region === 'canadaeast' &&
    config.platform.standardAgentSetup.enabled &&
    config.platform.standardAgentSetup.blobStorage.enabled
    ? 'Canada East has no availability zones. Agent file storage is priced as Hot LRS, which has lower resilience than the Hot ZRS design used in Canada Central.'
    : null

  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              <span className="brand__tile brand__tile--red" />
              <span className="brand__tile brand__tile--green" />
              <span className="brand__tile brand__tile--blue" />
              <span className="brand__tile brand__tile--yellow" />
            </span>
            <div>
              <h1>Foundry Cost Lab</h1>
              <span>Estimate, not quote</span>
            </div>
          </div>
          <div className="topbar__right">
            <div
              className={`freshness freshness--${freshness}`}
              title={rateCard.syncStatus === 'partial'
                ? `${rateCard.unmatchedKeys.length} optional or manual rate definitions remain unmatched; ${activeUnpricedLines.length} affect this estimate.`
                : undefined}
            >
              {loading ? <RefreshCw className="spin" aria-hidden="true" /> : <span className="freshness__dot" />}
              <span>{loading ? 'Loading rates' : usingFallback ? 'Built-in rates' : 'Synced rates'}</span>
              <strong>{rateCard.asOf}</strong>
            </div>
            <AccessRequestsDialog />
            <PwaControls />
            <ScenarioActions config={config} result={result} rateCard={rateCard} />
          </div>
        </header>

        {notice || activeRateNotice || regionalResilienceNotice || catalogNotice || labStorage.status.mode === 'memory' ? (
          <aside className="system-notices" aria-label="System notices">
            {notice ? <div className="notice-bar"><AlertTriangle aria-hidden="true" /><span>{notice}</span></div> : null}
            {activeRateNotice ? <div className="notice-bar notice-bar--warning"><AlertTriangle aria-hidden="true" /><span>{activeRateNotice}</span></div> : null}
            {regionalResilienceNotice ? <div className="notice-bar notice-bar--warning"><AlertTriangle aria-hidden="true" /><span>{regionalResilienceNotice}</span></div> : null}
            {catalogNotice ? <div className="notice-bar"><AlertTriangle aria-hidden="true" /><span>{catalogNotice}</span></div> : null}
            {labStorage.status.mode === 'memory' ? (
              <div className="notice-bar notice-bar--warning">
                <AlertTriangle aria-hidden="true" />
                <span>Browser storage is blocked. Scenarios will last for this session only.</span>
              </div>
            ) : null}
          </aside>
        ) : null}

        <div className={`workspace${comparisonOpen ? ' workspace--comparison' : ''}`}>
          {!comparisonOpen ? <ConfigPanel config={config} updateConfig={updateConfig} applyPreset={applyPreset} catalog={catalog} /> : null}
          <main className={`readout${comparisonOpen ? ' readout--comparison' : ''}`}>
            {comparisonOpen ? <ScenarioComparisonWorkspace /> : (
              <ResultsPanel
                result={result}
                config={config}
                rateCard={rateCard}
                rateDiff={rateDiff}
                modelCatalog={catalog.models}
              />
            )}
            <footer className="app-footer">
              <strong>Planning estimate only.</strong>
              <span>List rates exclude negotiated agreements, taxes, and customer-specific commitments. Unpriced lines are intentionally excluded from the known subtotal.</span>
            </footer>
          </main>
        </div>
      </div>
    </Tooltip.Provider>
  )
}

export default App