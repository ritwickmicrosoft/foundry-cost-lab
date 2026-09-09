import * as Tooltip from '@radix-ui/react-tooltip'
import * as Tabs from '@radix-ui/react-tabs'
import { AlertTriangle, ChevronDown, MessageCircle, Redo2, RefreshCw, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { ConfigPanel, type ConfigFocusRequest } from './components/ConfigPanel'
import { AccessRequestsDialog } from './components/AccessRequestsDialog'
import { GuidedEstimate, GUIDED_ESTIMATE_STORAGE_KEY } from './components/GuidedEstimate'
import { PwaControls } from './components/PwaControls'
import { ResultsPanel } from './components/ResultsPanel'
import { MobileEstimateBar } from './components/MobileEstimateBar'
import { ResetWorkspaceDialog } from './components/ResetWorkspaceDialog'
import { ScenarioActions } from './components/ScenarioManager'
import { ScenarioComparisonWorkspace } from './components/ScenarioComparisonWorkspace'
import { computeCost } from './domain/computeCost'
import { getLastKnownRateLines } from './domain/pricingVerification'
import { getRateCardFreshness } from './domain/rates'
import { useFoundryCatalog } from './hooks/useFoundryCatalog'
import { useRateCard } from './hooks/useRateCard'
import { useRateDiff } from './hooks/useRateDiff'
import { labStorage, useLabStore } from './state/useLabStore'
import { clearWorkspaceBrowserData } from './state/workspaceStorage'
import './App.css'

const guidedEstimateStartsOpen = () => {
  if (new URLSearchParams(window.location.search).get('guide') === '1') return true
  try {
    return window.localStorage.getItem(GUIDED_ESTIMATE_STORAGE_KEY) !== 'complete'
  } catch {
    return true
  }
}

const markGuidedEstimateComplete = () => {
  try {
    window.localStorage.setItem(GUIDED_ESTIMATE_STORAGE_KEY, 'complete')
  } catch {
    // The current session can still continue when browser storage is unavailable.
  }
}

function App() {
  const config = useLabStore((state) => state.config)
  const updateConfig = useLabStore((state) => state.updateConfig)
  const replaceConfig = useLabStore((state) => state.replaceConfig)
  const applyPreset = useLabStore((state) => state.applyPreset)
  const canUndo = useLabStore((state) => state.undoStack.length > 0)
  const canRedo = useLabStore((state) => state.redoStack.length > 0)
  const undoConfig = useLabStore((state) => state.undoConfig)
  const redoConfig = useLabStore((state) => state.redoConfig)
  const beginConfigEdit = useLabStore((state) => state.beginConfigEdit)
  const endConfigEdit = useLabStore((state) => state.endConfigEdit)
  const resetWorkspace = useLabStore((state) => state.resetWorkspace)
  const comparisonOpen = useLabStore((state) => state.comparisonOpen)
  const closeComparison = useLabStore((state) => state.closeComparison)
  const [guidedEstimateOpen, setGuidedEstimateOpen] = useState(guidedEstimateStartsOpen)
  const [guidedDraft, setGuidedDraft] = useState<typeof config | null>(null)
  const [workspaceView, setWorkspaceView] = useState('configure')
  const [configFocus, setConfigFocus] = useState<ConfigFocusRequest>()
  const [resetVersion, setResetVersion] = useState(0)
  const [resetStorageNotice, setResetStorageNotice] = useState<string | null>(null)
  const guidedActive = guidedEstimateOpen && !comparisonOpen
  const activeConfig = guidedActive && guidedDraft ? guidedDraft : config
  const { rateCard, loading, usingFallback, notice } = useRateCard(activeConfig.region)
  const { catalog, loading: catalogLoading, notice: catalogNotice } = useFoundryCatalog(activeConfig.region)
  const rateDiff = useRateDiff(config.region)
  const result = computeCost(activeConfig, rateCard, catalog.models)
  const freshness = getRateCardFreshness(rateCard, new Date())
  const showEstimateWarnings = !guidedActive || (guidedDraft !== null && !loading && !catalogLoading)
  const activeUnpricedLines = showEstimateWarnings ? result.lines.filter((line) => line.amount === null) : []
  const lastKnownLines = showEstimateWarnings ? getLastKnownRateLines(result) : []
  const verificationNotice = lastKnownLines.length > 0
    ? `This estimate uses last-known Retail prices for ${lastKnownLines.length} cost line${lastKnownLines.length === 1 ? '' : 's'}. The latest refresh did not verify those rates; their original values and dates are retained.`
    : null
  const activeRateNotice = activeUnpricedLines.length > 0
    ? `Current estimate excludes ${activeUnpricedLines.length} active unpriced ${activeUnpricedLines.length === 1 ? 'line' : 'lines'}: ${activeUnpricedLines.map((line) => line.label).join(', ')}. Open each warning icon for the exact reason.`
    : null
  const regionalResilienceNotice = showEstimateWarnings && activeConfig.region === 'canadaeast' &&
    activeConfig.platform.standardAgentSetup.enabled &&
    activeConfig.platform.standardAgentSetup.blobStorage.enabled
    ? 'Canada East has no availability zones. Agent file storage is priced as Hot LRS, which has lower resilience than the Hot ZRS design used in Canada Central.'
    : null

  const closeGuide = () => {
    markGuidedEstimateComplete()
    setGuidedDraft(null)
    setGuidedEstimateOpen(false)
  }

  const applyGuidedEstimate = (draft: typeof config) => {
    replaceConfig(draft)
    setWorkspaceView('results')
    closeGuide()
    requestAnimationFrame(() => {
      const results = document.getElementById('cost-results')
      results?.scrollIntoView({ block: 'start' })
      results?.focus({ preventScroll: true })
    })
  }

  const switchWorkspaceView = (view: string) => {
    setWorkspaceView(view)
    if (window.matchMedia('(max-width: 860px)').matches) {
      requestAnimationFrame(() => {
        document.querySelector(`[data-workspace-view="${view}"]`)?.scrollIntoView({ block: 'start' })
      })
    }
  }

  const reviewPricing = () => {
    setWorkspaceView('results')
    requestAnimationFrame(() => {
      const pricing = document.getElementById('pricing-readiness')
      pricing?.scrollIntoView({ block: 'start' })
      pricing?.focus({ preventScroll: true })
    })
  }

  const editCostLine = (target: ConfigFocusRequest) => {
    setWorkspaceView('configure')
    setConfigFocus({ tier: target.tier, blockId: target.blockId })
  }

  const openGuide = () => {
    setConfigFocus(undefined)
    closeComparison()
    setGuidedEstimateOpen(true)
  }

  const startFreshWorkspace = () => {
    let storageCleared = true
    try {
      clearWorkspaceBrowserData(window.localStorage)
    } catch {
      storageCleared = false
    }
    resetWorkspace()
    setGuidedDraft(null)
    setConfigFocus(undefined)
    setWorkspaceView('configure')
    setResetVersion((version) => version + 1)
    setGuidedEstimateOpen(true)
    setResetStorageNotice(storageCleared ? null : 'Workspace reset for this session. Browser storage could not be cleared; previously saved data may return after reload.')
  }

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
                ? `${rateCard.unmatchedKeys.length} rate definitions remain unmatched; this estimate has ${activeUnpricedLines.length} unpriced and ${lastKnownLines.length} last-known price lines.`
                : undefined}
            >
              {loading ? <RefreshCw className="spin" aria-hidden="true" /> : <span className="freshness__dot" />}
              <span>{loading ? 'Loading rates' : usingFallback ? 'Built-in rates' : 'Synced rates'}</span>
              <strong>{rateCard.asOf}</strong>
            </div>
            <AccessRequestsDialog />
            <PwaControls />
            {!guidedActive && !comparisonOpen ? (
              <div className="history-actions" role="group" aria-label="Edit history">
                <button type="button" className="button button--quiet history-button" disabled={!canUndo} onClick={undoConfig} aria-label="Undo last edit" title="Undo last edit"><Undo2 aria-hidden="true" /></button>
                <button type="button" className="button button--quiet history-button" disabled={!canRedo} onClick={redoConfig} aria-label="Redo edit" title="Redo edit"><Redo2 aria-hidden="true" /></button>
              </div>
            ) : null}
            <button type="button" className="button button--quiet" onClick={openGuide}>
              <MessageCircle aria-hidden="true" />Guided setup
            </button>
            {!guidedActive ? <ScenarioActions config={config} result={result} rateCard={rateCard} /> : null}
            <ResetWorkspaceDialog onReset={startFreshWorkspace} />
          </div>
        </header>

        {notice || activeRateNotice || verificationNotice || regionalResilienceNotice || catalogNotice || resetStorageNotice || labStorage.status.mode === 'memory' ? (
          <aside className="system-notices" aria-label="System notices">
            {notice || catalogNotice ? (
              <details className="data-status">
                <summary><AlertTriangle aria-hidden="true" /><span>Data sources need attention</span><ChevronDown aria-hidden="true" /></summary>
                {notice ? <div className="notice-bar"><span>{notice}</span></div> : null}
                {catalogNotice ? <div className="notice-bar"><span>{catalogNotice}</span></div> : null}
              </details>
            ) : null}
            {resetStorageNotice ? <div className="notice-bar notice-bar--warning" role="status"><AlertTriangle aria-hidden="true" /><span>{resetStorageNotice}</span></div> : null}
            {activeRateNotice ? <div className="notice-bar notice-bar--warning"><AlertTriangle aria-hidden="true" /><span>{activeRateNotice}</span></div> : null}
            {verificationNotice ? <div className="notice-bar notice-bar--warning"><AlertTriangle aria-hidden="true" /><span>{verificationNotice}</span></div> : null}
            {regionalResilienceNotice ? <div className="notice-bar notice-bar--warning"><AlertTriangle aria-hidden="true" /><span>{regionalResilienceNotice}</span></div> : null}
            {labStorage.status.mode === 'memory' ? (
              <div className="notice-bar notice-bar--warning">
                <AlertTriangle aria-hidden="true" />
                <span>Browser storage is blocked. Scenarios will last for this session only.</span>
              </div>
            ) : null}
          </aside>
        ) : null}

        <Tabs.Root value={workspaceView} onValueChange={switchWorkspaceView} role="main" aria-label="Calculator workspace"
          onFocusCapture={(event) => {
            if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [role="slider"]')) beginConfigEdit()
          }}
          onBlurCapture={endConfigEdit}
        >
          <MobileEstimateBar result={result} loading={loading} hidden={comparisonOpen || guidedActive} onReviewPricing={reviewPricing} />
        <div className={`workspace${comparisonOpen ? ' workspace--comparison' : guidedActive ? ' workspace--guide' : ' workspace--calculator'}`}>
          {!comparisonOpen && !guidedActive ? (
            <Tabs.Content value="configure" forceMount className="configuration-pane" data-workspace-view="configure">
              <ConfigPanel config={config} updateConfig={updateConfig} applyPreset={applyPreset} catalog={catalog} focusRequest={configFocus} />
            </Tabs.Content>
          ) : null}
          <Tabs.Content value="results" forceMount className="readout-pane" data-workspace-view="results">
          <div className={`readout${comparisonOpen ? ' readout--comparison' : guidedActive ? ' readout--guide' : ''}`}>
            {comparisonOpen ? <ScenarioComparisonWorkspace /> : (
              guidedActive ? (
                <GuidedEstimate
                  key={resetVersion}
                  currentConfig={config}
                  rateCard={rateCard}
                  catalog={catalog}
                  loading={loading || catalogLoading}
                  onDraftChange={setGuidedDraft}
                  onApply={applyGuidedEstimate}
                  onSkip={closeGuide}
                />
              ) : (
                <ResultsPanel
                  result={result}
                  config={config}
                  rateCard={rateCard}
                  rateDiff={rateDiff}
                  modelCatalog={catalog.models}
                  onEditCostLine={editCostLine}
                  onReviewPricing={reviewPricing}
                />
              )
            )}
            <div className="app-footer">
              <strong>Planning estimate only.</strong>
              <span>List rates exclude negotiated agreements, taxes, and customer-specific commitments. Unpriced lines are intentionally excluded from the known subtotal.</span>
            </div>
          </div>
          </Tabs.Content>
        </div>
        </Tabs.Root>
      </div>
    </Tooltip.Provider>
  )
}

export default App