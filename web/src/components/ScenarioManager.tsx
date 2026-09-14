import * as Dialog from '@radix-ui/react-dialog'
import { Check, Download, Eye, FileJson, FolderOpen, GitCompareArrows, LoaderCircle, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { buildScenarioExport, buildWorkspaceBackup, parseScenarioExport, parseWorkspaceBackup } from '../domain/export'
import { MAX_COMPARISON_SCENARIOS } from '../domain/scenarioComparison'
import type { CostConfig, CostResult, RateCard } from '../domain/types'
import { labStorage, useLabStore } from '../state/useLabStore'
import { captureEstimateRevision, type EstimateRevision } from '../domain/estimateRevision'
import type { FoundryModelCatalogEntry } from '../domain/foundryCatalog'
import { RevisionReview } from './RevisionReview'

const safeFileName = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'foundry-cost-scenario'

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadJson(fileName: string, value: unknown) {
  downloadBlob(fileName, new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
}

export function ScenarioActions({
  config,
  result,
  rateCard,
  models,
  loading = false,
}: {
  config: CostConfig
  result: CostResult
  rateCard: RateCard
  models: readonly FoundryModelCatalogEntry[]
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [review, setReview] = useState<{ name: string; revisions: EstimateRevision[] } | null>(null)
  const [name, setName] = useState('')
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const scenarios = useLabStore((state) => state.scenarios)
  const comparisonIds = useLabStore((state) => state.comparisonIds)
  const saveScenario = useLabStore((state) => state.saveScenario)
  const importScenarios = useLabStore((state) => state.importScenarios)
  const replaceConfig = useLabStore((state) => state.replaceConfig)
  const loadScenario = useLabStore((state) => state.loadScenario)
  const deleteScenario = useLabStore((state) => state.deleteScenario)
  const toggleComparison = useLabStore((state) => state.toggleComparison)
  const openComparison = useLabStore((state) => state.openComparison)

  const backupCurrent = () => {
    const exportedAt = new Date().toISOString()
    downloadJson(
      `${safeFileName(name || config.posture)}-${rateCard.asOf}.json`,
      buildScenarioExport(config, result, rateCard, exportedAt, models),
    )
  }

  const exportCurrentPdf = async () => {
    setExportingPdf(true)
    setPdfError(null)
    try {
      const { createCostEstimatePdf } = await import('../domain/pdfExport')
      const document = await createCostEstimatePdf({
        config,
        result,
        rateCard,
        exportedAt: new Date().toISOString(),
        scenarioName: name,
        models,
      })
      downloadBlob(
        `${safeFileName(name || `${config.posture}-estimate`)}-${rateCard.asOf}.pdf`,
        document.output('blob'),
      )
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'PDF export failed.')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="header-actions">
      <button
        type="button"
        className="button button--quiet"
        disabled={exportingPdf || loading}
        title={pdfError ?? 'Export a PDF estimate'}
        onClick={() => void exportCurrentPdf()}
      >
        {exportingPdf ? <LoaderCircle className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
        {exportingPdf ? 'Creating PDF' : pdfError ? 'Retry PDF' : 'Export PDF'}
      </button>
      <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setReview(null) }}>
        <Dialog.Trigger asChild>
          <button type="button" className="button button--primary">
            <FolderOpen aria-hidden="true" />
            Scenarios
            {scenarios.length ? <span className="button__count">{scenarios.length}</span> : null}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <div className="dialog__header">
              <div>
                <span className="eyebrow">Browser-local workspace</span>
                <Dialog.Title>Scenarios</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="icon-button" aria-label="Close scenarios">
                  <X aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description>
              <span id="scenario-description">Browser-local data persists until deleted or reset; sign-out does not erase it. Account separation is not encryption. Downloads can contain private rates. Scenario names must not contain confidential customer identifiers.</span>
            </Dialog.Description>
            {labStorage.status.mode === 'memory' ? (
              <div className="notice notice--warning">
                Browser storage is unavailable. Scenarios last for this session only.
              </div>
            ) : null}
            {importNotice ? <div className="notice">{importNotice}</div> : null}
            {review ? <RevisionReview key={review.revisions[0].id} {...review}
              onBack={() => setReview(null)}
              onDownload={(revision) => downloadJson(`${safeFileName(review.name)}-${revision.id}.json`, {
                ...buildScenarioExport(revision.config, revision.result, revision.rateCard, revision.capturedAt, revision.models),
                revision,
              })}
              onLoad={(savedConfig) => { replaceConfig(savedConfig); setName(review.name); setReview(null); setOpen(false) }}
            /> : <>
            <div className="scenario-save">
              <label className="field">
                <span className="field__label">Scenario name</span>
                <input
                  type="text"
                  value={name}
                  maxLength={80}
                  placeholder="e.g. Production baseline"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="button button--primary"
                disabled={!name.trim() || loading}
                onClick={() => {
                  saveScenario(name, rateCard.asOf, captureEstimateRevision(config, result, rateCard, models))
                  setName('')
                  setImportNotice(labStorage.status.mode === 'memory' ? 'Saved in memory only. Download a backup before leaving.' : 'Saved as an immutable revision in this browser.')
                }}
              >
                <Save aria-hidden="true" />Save current
              </button>
              <div className="scenario-file-actions">
                <button type="button" className="button button--quiet" disabled={loading} onClick={() => downloadJson(
                  `foundry-cost-workspace-${new Date().toISOString().slice(0, 10)}.json`,
                  buildWorkspaceBackup(buildScenarioExport(config, result, rateCard, new Date().toISOString(), models), scenarios),
                )}><Download aria-hidden="true" />Backup workspace</button>
                <button type="button" className="button button--quiet" disabled={loading} onClick={backupCurrent}>
                  <FileJson aria-hidden="true" />Backup JSON
                </button>
                <label className="button button--quiet">
                  <Upload aria-hidden="true" />Import JSON
                  <input
                    className="file-input"
                    type="file"
                    accept="application/json,.json"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file) return
                      try {
                        if (file.size > 10_000_000) throw new Error('Backup files must be smaller than 10 MB.')
                        const payload = JSON.parse(await file.text()) as unknown
                        if (payload && typeof payload === 'object' && 'format' in payload && payload.format === 'foundry-cost-lab-workspace-v1') {
                          const backup = parseWorkspaceBackup(payload)
                          importScenarios(backup.scenarios)
                          replaceConfig(backup.current.config)
                          setImportNotice(`Restored ${backup.scenarios.length} scenarios and their archived revisions. Existing scenarios were kept. Current working inputs use latest rates.`)
                          return
                        }
                        if (file.size > 2_000_000) throw new Error('Individual scenario files must be smaller than 2 MB.')
                        const imported = parseScenarioExport(payload)
                        const importedName = file.name.replace(/\.json$/i, '').slice(0, 80)
                        replaceConfig(imported.revision?.config ?? imported.config)
                        setName(importedName)
                        if (imported.revision) {
                          saveScenario(importedName, imported.revision.rateCard.asOf, imported.revision)
                          setReview({ name: importedName, revisions: [imported.revision] })
                        }
                        setImportNotice(imported.revision ? `Imported ${file.name}. Original revision preserved; repricing is separate.` : `Imported legacy ${file.name}. Original rates are unavailable; costs use the current rate card.`)
                      } catch (error) {
                        setImportNotice(error instanceof Error ? error.message : 'Scenario import failed.')
                      }
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="scenario-list" aria-label="Saved scenarios">
              {scenarios.length === 0 ? (
                <div className="empty-state">No saved scenarios in this browser.</div>
              ) : (
                scenarios.map((scenario) => {
                  const compared = comparisonIds.includes(scenario.id)
                  const selectionFull = comparisonIds.length >= MAX_COMPARISON_SCENARIOS && !compared
                  return (
                    <div key={scenario.id} className="scenario-row">
                      <label
                        className={`check-control${selectionFull ? ' check-control--disabled' : ''}`}
                        title={selectionFull ? 'Remove one selected scenario to compare another.' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={compared}
                          disabled={selectionFull}
                          onChange={() => toggleComparison(scenario.id)}
                        />
                        <span className="check-control__box">{compared ? <Check aria-hidden="true" /> : null}</span>
                        <span>
                          <strong>{scenario.name}</strong>
                          <small>Saved with rates as of {scenario.rateCardAsOf}</small>
                          <small>{scenario.revisions?.length ? `${scenario.revisions.length} archived revision(s)` : 'Legacy inputs only; original rates unavailable'}</small>
                        </span>
                      </label>
                      <div className="scenario-row__actions">
                        {scenario.revisions?.length ? <button type="button" className="icon-button" title="Review original revisions" aria-label={`Review revisions for ${scenario.name}`}
                          onClick={() => setReview({ name: scenario.name, revisions: scenario.revisions! })}><Eye aria-hidden="true" /></button> : null}
                        <Dialog.Close asChild>
                          <button
                            type="button"
                            className="icon-button"
                            title="Load inputs at current prices"
                            aria-label={`Load ${scenario.name}`}
                            onClick={() => { loadScenario(scenario.id); setName(scenario.name) }}
                          >
                            <RefreshCw aria-hidden="true" />
                          </button>
                        </Dialog.Close>
                        <button
                          type="button"
                          className="icon-button icon-button--danger"
                          title="Delete scenario"
                          aria-label={`Delete ${scenario.name}`}
                          onClick={() => deleteScenario(scenario.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="scenario-compare-actions">
              <span>
                <strong>{comparisonIds.length}</strong> of {MAX_COMPARISON_SCENARIOS} selected
                <small>Select two or three saved scenarios.</small>
              </span>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={comparisonIds.length < 2}
                  onClick={openComparison}
                >
                  <GitCompareArrows aria-hidden="true" />
                  Compare {comparisonIds.length >= 2 ? comparisonIds.length : ''}
                </button>
              </Dialog.Close>
            </div>
            </>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}