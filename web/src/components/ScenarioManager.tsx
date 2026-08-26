import * as Dialog from '@radix-ui/react-dialog'
import { Check, Download, FileJson, FolderOpen, GitCompareArrows, LoaderCircle, Play, Save, Trash2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { buildScenarioExport, parseScenarioExport } from '../domain/export'
import { MAX_COMPARISON_SCENARIOS } from '../domain/scenarioComparison'
import type { CostConfig, CostResult, RateCard } from '../domain/types'
import { labStorage, useLabStore } from '../state/useLabStore'

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
}: {
  config: CostConfig
  result: CostResult
  rateCard: RateCard
}) {
  const [name, setName] = useState('')
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const scenarios = useLabStore((state) => state.scenarios)
  const comparisonIds = useLabStore((state) => state.comparisonIds)
  const saveScenario = useLabStore((state) => state.saveScenario)
  const replaceConfig = useLabStore((state) => state.replaceConfig)
  const loadScenario = useLabStore((state) => state.loadScenario)
  const deleteScenario = useLabStore((state) => state.deleteScenario)
  const toggleComparison = useLabStore((state) => state.toggleComparison)
  const openComparison = useLabStore((state) => state.openComparison)

  const backupCurrent = () => {
    const exportedAt = new Date().toISOString()
    downloadJson(
      `${safeFileName(name || config.posture)}-${rateCard.asOf}.json`,
      buildScenarioExport(config, result, rateCard, exportedAt),
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
        disabled={exportingPdf}
        title={pdfError ?? 'Export a PDF estimate'}
        onClick={() => void exportCurrentPdf()}
      >
        {exportingPdf ? <LoaderCircle className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
        {exportingPdf ? 'Creating PDF' : pdfError ? 'Retry PDF' : 'Export PDF'}
      </button>
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <button type="button" className="button button--primary">
            <FolderOpen aria-hidden="true" />
            Scenarios
            {scenarios.length ? <span className="button__count">{scenarios.length}</span> : null}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog" aria-describedby="scenario-description">
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
            <Dialog.Description id="scenario-description">
              Scenario names are user-supplied and must not contain confidential customer identifiers.
            </Dialog.Description>
            {labStorage.status.mode === 'memory' ? (
              <div className="notice notice--warning">
                Browser storage is unavailable. Scenarios last for this session only.
              </div>
            ) : null}
            {importNotice ? <div className="notice">{importNotice}</div> : null}
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
                disabled={!name.trim()}
                onClick={() => {
                  saveScenario(name, rateCard.asOf)
                  setName('')
                }}
              >
                <Save aria-hidden="true" />Save current
              </button>
              <div className="scenario-file-actions">
                <button type="button" className="button button--quiet" onClick={backupCurrent}>
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
                        const imported = parseScenarioExport(JSON.parse(await file.text()) as unknown)
                        replaceConfig(imported.config)
                        setName(file.name.replace(/\.json$/i, '').slice(0, 80))
                        setImportNotice(`Imported ${file.name}. Costs were recalculated with the current rate card.`)
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
                        </span>
                      </label>
                      <div className="scenario-row__actions">
                        <Dialog.Close asChild>
                          <button
                            type="button"
                            className="icon-button"
                            title="Load scenario"
                            aria-label={`Load ${scenario.name}`}
                            onClick={() => loadScenario(scenario.id)}
                          >
                            <Play aria-hidden="true" />
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
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}