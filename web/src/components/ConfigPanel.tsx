import * as Tabs from '@radix-ui/react-tabs'
import { Bot, Boxes, RefreshCw, ShieldCheck } from 'lucide-react'
import {
  HOSTED_AGENT_SANDBOXES,
  REGION_IDS,
  REGION_LABELS,
  type AgenticReasoningEffort,
  type CosmosBillingMode,
  type CostConfig,
  type HostedAgentSandboxSize,
  type Posture,
  type ToolBillingScope,
} from '../domain/types'
import { getFoundryModel, MODEL_SOURCE_LABELS, type ActiveFoundryCatalog } from '../domain/foundryCatalog'
import { ConfigGroup, NumberField, SegmentedControl, SliderField, ToggleRow } from './Controls'
import { FoundryServicesConfigurator } from './FoundryServicesConfigurator'
import { ModelCatalogConfigurator } from './ModelCatalogConfigurator'

interface ConfigPanelProps {
  config: CostConfig
  updateConfig: (update: (config: CostConfig) => void) => void
  applyPreset: (posture: Posture) => void
  catalog: ActiveFoundryCatalog
}

export function ConfigPanel({ config, updateConfig, applyPreset, catalog }: ConfigPanelProps) {
  const selectedModel = getFoundryModel(config.commercialModel.modelId, catalog.models)
  const contentSafetyRegion = config.region === 'canadacentral' ? 'canadaeast' : config.region

  return (
    <aside className="config-panel" aria-label="Cost configuration">
      <div className="config-panel__top">
        <SegmentedControl
          label="Delivery posture"
          value={config.posture}
          options={[
            { value: 'poc', label: 'Lean POC' },
            { value: 'production', label: 'Production' },
          ]}
          onChange={applyPreset}
        />
        <div className="field-grid field-grid--two">
          <label className="field">
            <span className="field__label">Azure region</span>
            <select
              value={config.region}
              onChange={(event) =>
                updateConfig((draft) => {
                  draft.region = event.target.value as CostConfig['region']
                })
              }
            >
              {REGION_IDS.map((region) => (
                <option key={region} value={region}>{REGION_LABELS[region]}</option>
              ))}
            </select>
          </label>
          <NumberField
            label="Environments"
            value={config.environments}
            min={1}
            max={8}
            onChange={(value) =>
              updateConfig((draft) => {
                draft.environments = value ?? 1
              })
            }
          />
          <NumberField
            label="Non-prod ratio"
            value={config.nonProductionRatio * 100}
            min={0}
            max={100}
            suffix="%"
            hint="Each environment after production"
            onChange={(value) =>
              updateConfig((draft) => {
                draft.nonProductionRatio = (value ?? 0) / 100
              })
            }
          />
          {!config.disasterRecovery.enabled ? (
            <NumberField
              label="Secondary region"
              value={config.secondaryRegionRatio * 100}
              min={0}
              max={100}
              suffix="%"
              hint="Approximation when service-specific DR is off"
              onChange={(value) =>
                updateConfig((draft) => {
                  draft.secondaryRegionRatio = (value ?? 0) / 100
                })
              }
            />
          ) : null}
        </div>
      </div>

      <Tabs.Root className="config-tabs" defaultValue="run">
        <Tabs.List className="config-tabs__list" aria-label="Cost tiers">
          <Tabs.Trigger value="run"><Bot aria-hidden="true" />Run</Tabs.Trigger>
          <Tabs.Trigger value="guardrail"><ShieldCheck aria-hidden="true" />Guardrail</Tabs.Trigger>
          <Tabs.Trigger value="platform"><Boxes aria-hidden="true" />Platform</Tabs.Trigger>
          <Tabs.Trigger value="change"><RefreshCw aria-hidden="true" />Change</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="run" className="config-tabs__content">
          <ConfigGroup title="Workload volume">
            <div className="field-grid field-grid--two">
              <NumberField
                label="Monthly users"
                value={config.workload.monthlyUsers}
                step={50}
                onChange={(value) => updateConfig((draft) => { draft.workload.monthlyUsers = value ?? 0 })}
              />
              <NumberField
                label="Active days"
                value={config.workload.activeDaysPerMonth}
                min={1}
                max={31}
                onChange={(value) => updateConfig((draft) => { draft.workload.activeDaysPerMonth = value ?? 1 })}
              />
              <NumberField
                label="Requests / user / day"
                value={config.workload.requestsPerUserPerDay}
                onChange={(value) => updateConfig((draft) => { draft.workload.requestsPerUserPerDay = value ?? 0 })}
              />
              <SliderField
                label="Agent turns"
                value={config.workload.agentTurnMultiplier}
                min={1}
                max={12}
                suffix="x"
                onChange={(value) => updateConfig((draft) => { draft.workload.agentTurnMultiplier = value })}
              />
              <NumberField
                label="Input / turn"
                value={config.workload.inputTokensPerTurn}
                step={100}
                suffix="tokens"
                onChange={(value) => updateConfig((draft) => { draft.workload.inputTokensPerTurn = value ?? 0 })}
              />
              <NumberField
                label="Output / turn"
                value={config.workload.outputTokensPerTurn}
                step={100}
                suffix="tokens"
                onChange={(value) => updateConfig((draft) => { draft.workload.outputTokensPerTurn = value ?? 0 })}
              />
            </div>
            <NumberField
              label="MCP schema / turn"
              value={config.workload.mcpSchemaTokensPerTurn}
              step={50}
              suffix="tokens"
              hint="Applied to every agent turn on the primary model input"
              onChange={(value) => updateConfig((draft) => { draft.workload.mcpSchemaTokensPerTurn = value ?? 0 })}
            />
          </ConfigGroup>

          <ConfigGroup title="Commercial model">
            <ToggleRow
              label={selectedModel ? `${selectedModel.name} ${selectedModel.version}` : 'Foundry catalog model'}
              description={selectedModel ? `${MODEL_SOURCE_LABELS[selectedModel.source]} · ${selectedModel.publisher}` : 'Catalog metadata unavailable'}
              checked={config.commercialModel.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.commercialModel.enabled = checked })}
            >
              <ModelCatalogConfigurator
                config={config.commercialModel}
                catalog={catalog}
                update={(change) => updateConfig((draft) => change(draft.commercialModel))}
              />
            </ToggleRow>
          </ConfigGroup>

          <ConfigGroup title="Foundry services">
            <FoundryServicesConfigurator
              config={config.foundryServices}
              update={(change) => updateConfig((draft) => change(draft.foundryServices))}
            />
          </ConfigGroup>

          <ConfigGroup title="Hosted agent runtime">
            <ToggleRow
              label="Foundry hosted agent"
              description="CPU and memory are billed across active session sandboxes"
              checked={config.hostedAgent.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.hostedAgent.enabled = checked })}
            >
              <label className="field">
                <span className="field__label">Sandbox size</span>
                <select
                  value={config.hostedAgent.sandboxSize}
                  onChange={(event) =>
                    updateConfig((draft) => {
                      draft.hostedAgent.sandboxSize = event.target.value as HostedAgentSandboxSize
                    })
                  }
                >
                  {(Object.keys(HOSTED_AGENT_SANDBOXES) as HostedAgentSandboxSize[]).map((size) => (
                    <option key={size} value={size}>{HOSTED_AGENT_SANDBOXES[size].label}</option>
                  ))}
                </select>
              </label>
              <div className="field-grid field-grid--two">
                <NumberField
                  label="Sessions / month"
                  value={config.hostedAgent.sessionsPerMonth}
                  step={100}
                  onChange={(value) => updateConfig((draft) => { draft.hostedAgent.sessionsPerMonth = value ?? 0 })}
                />
                <NumberField
                  label="Billed minutes / session"
                  value={config.hostedAgent.activeMinutesPerSession}
                  step={1}
                  suffix="min"
                  hint="Include processing and the 5-60 minute idle timeout"
                  onChange={(value) => updateConfig((draft) => { draft.hostedAgent.activeMinutesPerSession = value ?? 0 })}
                />
              </div>
            </ToggleRow>
          </ConfigGroup>

          <ConfigGroup title="Agent tools">
            <ToggleRow
              label="Code Interpreter"
              description="Isolated execution sessions billed by global or regional scope"
              checked={config.agentTools.codeInterpreter.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.agentTools.codeInterpreter.enabled = checked
              })}
            >
              <SegmentedControl<ToolBillingScope>
                label="Billing scope"
                value={config.agentTools.codeInterpreter.scope}
                options={[
                  { value: 'global', label: 'Global' },
                  { value: 'regional', label: 'Regional' },
                ]}
                onChange={(scope) => updateConfig((draft) => {
                  draft.agentTools.codeInterpreter.scope = scope
                })}
              />
              <NumberField
                label="Sessions / month"
                value={config.agentTools.codeInterpreter.sessionsPerMonth}
                step={1_000}
                onChange={(value) => updateConfig((draft) => {
                  draft.agentTools.codeInterpreter.sessionsPerMonth = value ?? 0
                })}
              />
            </ToggleRow>
            <ToggleRow
              label="File Search"
              description="Vector-store capacity billed by average GB-day"
              checked={config.agentTools.fileSearch.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.agentTools.fileSearch.enabled = checked
              })}
            >
              <SegmentedControl<ToolBillingScope>
                label="Billing scope"
                value={config.agentTools.fileSearch.scope}
                options={[
                  { value: 'global', label: 'Global' },
                  { value: 'regional', label: 'Regional' },
                ]}
                onChange={(scope) => updateConfig((draft) => {
                  draft.agentTools.fileSearch.scope = scope
                })}
              />
              <div className="field-grid field-grid--two">
                <NumberField
                  label="Average storage"
                  value={config.agentTools.fileSearch.averageStorageGb}
                  suffix="GB"
                  onChange={(value) => updateConfig((draft) => {
                    draft.agentTools.fileSearch.averageStorageGb = value ?? 0
                  })}
                />
                <NumberField
                  label="Active days / month"
                  value={config.agentTools.fileSearch.activeDaysPerMonth}
                  min={1}
                  max={31}
                  onChange={(value) => updateConfig((draft) => {
                    draft.agentTools.fileSearch.activeDaysPerMonth = value ?? 1
                  })}
                />
              </div>
            </ToggleRow>
            <ToggleRow
              label="Foundry skills execution"
              description="Container execution time for hosted skills"
              checked={config.agentTools.skillsExecution.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.agentTools.skillsExecution.enabled = checked
              })}
            >
              <NumberField
                label="Execution hours / month"
                value={config.agentTools.skillsExecution.hoursPerMonth}
                onChange={(value) => updateConfig((draft) => {
                  draft.agentTools.skillsExecution.hoursPerMonth = value ?? 0
                })}
              />
            </ToggleRow>
            <ToggleRow
              label="Web Search grounding"
              description="Provider offer rate; public Retail pricing is not assumed"
              checked={config.agentTools.webSearch.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.agentTools.webSearch.enabled = checked
              })}
            >
              <div className="field-grid field-grid--two">
                <NumberField
                  label="Searches / month"
                  value={config.agentTools.webSearch.searchesPerMonth}
                  step={1_000}
                  onChange={(value) => updateConfig((draft) => {
                    draft.agentTools.webSearch.searchesPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Approved offer rate"
                  value={config.agentTools.webSearch.customRateCadPerThousand}
                  step={0.01}
                  suffix="CAD/1K"
                  onChange={(value) => updateConfig((draft) => {
                    draft.agentTools.webSearch.customRateCadPerThousand = value
                  })}
                />
              </div>
            </ToggleRow>
          </ConfigGroup>

          <ConfigGroup title="Harness mix">
            {config.harnesses.map((harness, index) => (
              <ToggleRow
                key={harness.id}
                label={harness.label}
                description={`${Math.round(harness.share * 100)}% traffic share`}
                checked={harness.enabled}
                onCheckedChange={(checked) => updateConfig((draft) => { draft.harnesses[index].enabled = checked })}
              >
                <div className="field-grid field-grid--three">
                  <NumberField
                    label="Share"
                    value={harness.share * 100}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(value) => updateConfig((draft) => { draft.harnesses[index].share = (value ?? 0) / 100 })}
                  />
                  <NumberField
                    label="Input overhead"
                    value={harness.inputOverheadPercent}
                    min={0}
                    suffix="%"
                    onChange={(value) => updateConfig((draft) => { draft.harnesses[index].inputOverheadPercent = value ?? 0 })}
                  />
                  <NumberField
                    label="Output overhead"
                    value={harness.outputOverheadPercent}
                    min={0}
                    suffix="%"
                    onChange={(value) => updateConfig((draft) => { draft.harnesses[index].outputOverheadPercent = value ?? 0 })}
                  />
                </div>
              </ToggleRow>
            ))}
          </ConfigGroup>

          <ConfigGroup title="Open-source inference">
            <ToggleRow
              label="Dedicated OSS model"
              description="GPU-hour pricing; token volume does not alter this subtotal"
              checked={config.ossModel.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.ossModel.enabled = checked })}
            >
              <div className="field-grid field-grid--three">
                <NumberField
                  label="Instances"
                  value={config.ossModel.instances}
                  min={1}
                  onChange={(value) => updateConfig((draft) => { draft.ossModel.instances = value ?? 1 })}
                />
                <NumberField
                  label="Hours / day"
                  value={config.ossModel.hoursPerDay}
                  max={24}
                  onChange={(value) => updateConfig((draft) => { draft.ossModel.hoursPerDay = value ?? 0 })}
                />
                <NumberField
                  label="Utilisation"
                  value={config.ossModel.utilizationPercent}
                  max={100}
                  suffix="%"
                  onChange={(value) => updateConfig((draft) => { draft.ossModel.utilizationPercent = value ?? 0 })}
                />
              </div>
            </ToggleRow>
          </ConfigGroup>
        </Tabs.Content>

        <Tabs.Content value="guardrail" className="config-tabs__content">
          <ConfigGroup title="Safety and threat protection">
            <ToggleRow
              label="Standalone Content Safety API"
              description={`${REGION_LABELS[contentSafetyRegion]} Standard text records; Foundry model filtering is already integrated`}
              checked={config.guardrail.contentSafety.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.guardrail.contentSafety.enabled = checked })}
            >
              <NumberField
                label="Monthly text records"
                value={config.guardrail.contentSafety.monthlyTextRecords}
                step={1_000}
                onChange={(value) => updateConfig((draft) => { draft.guardrail.contentSafety.monthlyTextRecords = value ?? 0 })}
              />
            </ToggleRow>
            <ToggleRow
              label="Defender for AI workloads"
              description="Protected transactions; usage does not scale by environment"
              checked={config.guardrail.defenderForAi.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.guardrail.defenderForAi.enabled = checked })}
            />
          </ConfigGroup>
          <ConfigGroup title="Security operations">
            <ToggleRow
              label="Microsoft Sentinel"
              description="Pay-as-you-go analytics ingestion"
              checked={config.guardrail.sentinel.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.guardrail.sentinel.enabled = checked })}
            >
              <NumberField
                label="Monthly ingestion"
                value={config.guardrail.sentinel.ingestedGbPerMonth}
                step={10}
                suffix="GB"
                onChange={(value) => updateConfig((draft) => { draft.guardrail.sentinel.ingestedGbPerMonth = value ?? 0 })}
              />
            </ToggleRow>
            <ToggleRow
              label="Microsoft Entra External ID"
              description="Guest/external MAU only; internal tenant members are not billed here"
              checked={config.guardrail.entra.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.guardrail.entra.enabled = checked })}
            />
            <ToggleRow
              label="Microsoft Purview"
              description="Workload-wide compliance capacity allocation"
              checked={config.guardrail.purview.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.guardrail.purview.enabled = checked })}
            >
              <NumberField
                label="Capacity units"
                value={config.guardrail.purview.capacityUnits}
                min={1}
                onChange={(value) => updateConfig((draft) => { draft.guardrail.purview.capacityUnits = value ?? 1 })}
              />
            </ToggleRow>
          </ConfigGroup>
        </Tabs.Content>

        <Tabs.Content value="platform" className="config-tabs__content">
          <ConfigGroup title="Foundry Standard Agent Setup">
            <ToggleRow
              label="BYO Cosmos DB thread storage"
              description="Messages, conversation history, and agent metadata"
              checked={config.platform.standardAgentSetup.enabled && config.platform.standardAgentSetup.cosmos.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.platform.standardAgentSetup.enabled = true
                draft.platform.standardAgentSetup.cosmos.enabled = checked
              })}
            >
              <SegmentedControl<CosmosBillingMode>
                label="Cosmos billing"
                value={config.platform.standardAgentSetup.cosmos.billingMode}
                options={[
                  { value: 'provisioned', label: 'Provisioned' },
                  { value: 'serverless', label: 'Serverless' },
                ]}
                onChange={(value) => updateConfig((draft) => {
                  draft.platform.standardAgentSetup.cosmos.billingMode = value
                })}
              />
              <div className="field-grid field-grid--two">
                {config.platform.standardAgentSetup.cosmos.billingMode === 'provisioned' ? (
                  <NumberField
                    label="Provisioned throughput"
                    value={config.platform.standardAgentSetup.cosmos.provisionedRuPerSecond}
                    min={3_000}
                    step={100}
                    suffix="RU/s"
                    hint="Standard Setup minimum per project"
                    onChange={(value) => updateConfig((draft) => {
                      draft.platform.standardAgentSetup.cosmos.provisionedRuPerSecond = value ?? 3_000
                    })}
                  />
                ) : (
                  <NumberField
                    label="Request units / month"
                    value={config.platform.standardAgentSetup.cosmos.serverlessRequestUnitsPerMonth}
                    step={1_000_000}
                    suffix="RU"
                    onChange={(value) => updateConfig((draft) => {
                      draft.platform.standardAgentSetup.cosmos.serverlessRequestUnitsPerMonth = value ?? 0
                    })}
                  />
                )}
                <NumberField
                  label="Cosmos data stored"
                  value={config.platform.standardAgentSetup.cosmos.storageGb}
                  step={10}
                  suffix="GB"
                  onChange={(value) => updateConfig((draft) => {
                    draft.platform.standardAgentSetup.cosmos.storageGb = value ?? 0
                  })}
                />
              </div>
            </ToggleRow>
            <ToggleRow
              label="BYO Azure AI Search S1"
              description="Vector stores; one Search Unit is one replica by one partition"
              checked={config.platform.knowledgeSearch.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.platform.knowledgeSearch.enabled = checked })}
            >
              <NumberField
                label="Production search units"
                value={config.platform.knowledgeSearch.units}
                min={1}
                onChange={(value) => updateConfig((draft) => { draft.platform.knowledgeSearch.units = value ?? 1 })}
              />
            </ToggleRow>
            <ToggleRow
              label={config.region === 'canadaeast' ? 'BYO Hot LRS Blob Storage' : 'BYO Hot ZRS Blob Storage'}
              description={config.region === 'canadaeast'
                ? 'Canada East has no availability zones; LRS has lower resilience than ZRS'
                : `${REGION_LABELS[config.region]} zone-redundant files, chunks, and embeddings`}
              checked={config.platform.standardAgentSetup.enabled && config.platform.standardAgentSetup.blobStorage.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.platform.standardAgentSetup.enabled = true
                draft.platform.standardAgentSetup.blobStorage.enabled = checked
              })}
            >
              <div className="field-grid field-grid--two">
                <NumberField
                  label="Blob data stored"
                  value={config.platform.standardAgentSetup.blobStorage.storedGb}
                  step={10}
                  suffix="GB"
                  onChange={(value) => updateConfig((draft) => {
                    draft.platform.standardAgentSetup.blobStorage.storedGb = value ?? 0
                  })}
                />
                <NumberField
                  label="Write operations / month"
                  value={config.platform.standardAgentSetup.blobStorage.writeOperationsPerMonth}
                  step={10_000}
                  onChange={(value) => updateConfig((draft) => {
                    draft.platform.standardAgentSetup.blobStorage.writeOperationsPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Read operations / month"
                  value={config.platform.standardAgentSetup.blobStorage.readOperationsPerMonth}
                  step={10_000}
                  onChange={(value) => updateConfig((draft) => {
                    draft.platform.standardAgentSetup.blobStorage.readOperationsPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Other operations / month"
                  value={config.platform.standardAgentSetup.blobStorage.otherOperationsPerMonth}
                  step={10_000}
                  onChange={(value) => updateConfig((draft) => {
                    draft.platform.standardAgentSetup.blobStorage.otherOperationsPerMonth = value ?? 0
                  })}
                />
              </div>
            </ToggleRow>
          </ConfigGroup>
          <ConfigGroup title="RAG and retrieval">
            <ToggleRow
              label="Semantic ranker"
              description="Premium semantic queries, separate from Search Units"
              checked={config.rag.semanticRanker.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.rag.semanticRanker.enabled = checked
              })}
            >
              <NumberField
                label="Semantic queries / month"
                value={config.rag.semanticRanker.queriesPerMonth}
                step={10_000}
                onChange={(value) => updateConfig((draft) => {
                  draft.rag.semanticRanker.queriesPerMonth = value ?? 0
                })}
              />
            </ToggleRow>
            <ToggleRow
              label="Agentic retrieval"
              description="Search reasoning plus separate planner-model tokens"
              checked={config.rag.agenticRetrieval.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.rag.agenticRetrieval.enabled = checked
              })}
            >
              <SegmentedControl<AgenticReasoningEffort>
                label="Reasoning effort"
                value={config.rag.agenticRetrieval.reasoningEffort}
                options={[
                  { value: 'minimum', label: 'Minimum' },
                  { value: 'low', label: 'Low' },
                ]}
                onChange={(effort) => updateConfig((draft) => {
                  draft.rag.agenticRetrieval.reasoningEffort = effort
                })}
              />
              <div className="field-grid field-grid--three">
                <NumberField
                  label="Search reasoning tokens"
                  value={config.rag.agenticRetrieval.reasoningTokensPerMonth}
                  step={1_000_000}
                  onChange={(value) => updateConfig((draft) => {
                    draft.rag.agenticRetrieval.reasoningTokensPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Planner input tokens"
                  value={config.rag.agenticRetrieval.plannerInputTokensPerMonth}
                  step={1_000_000}
                  onChange={(value) => updateConfig((draft) => {
                    draft.rag.agenticRetrieval.plannerInputTokensPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Planner output tokens"
                  value={config.rag.agenticRetrieval.plannerOutputTokensPerMonth}
                  step={1_000_000}
                  onChange={(value) => updateConfig((draft) => {
                    draft.rag.agenticRetrieval.plannerOutputTokensPerMonth = value ?? 0
                  })}
                />
              </div>
            </ToggleRow>
            <ToggleRow
              label="Image extraction"
              description="Billable images extracted during Search indexing"
              checked={config.rag.imageExtraction.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.rag.imageExtraction.enabled = checked
              })}
            >
              <NumberField
                label="Images / month"
                value={config.rag.imageExtraction.imagesPerMonth}
                step={1_000}
                onChange={(value) => updateConfig((draft) => {
                  draft.rag.imageExtraction.imagesPerMonth = value ?? 0
                })}
              />
            </ToggleRow>
            <ToggleRow
              label="Custom Entity Lookup"
              description="Text records enriched during Search indexing"
              checked={config.rag.customEntity.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.rag.customEntity.enabled = checked
              })}
            >
              <NumberField
                label="Text records / month"
                value={config.rag.customEntity.textRecordsPerMonth}
                step={10_000}
                onChange={(value) => updateConfig((draft) => {
                  draft.rag.customEntity.textRecordsPerMonth = value ?? 0
                })}
              />
            </ToggleRow>
            <ToggleRow
              label="Embedding model"
              description="Vectorizer token cost from the selected embedding offer"
              checked={config.rag.embeddings.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.rag.embeddings.enabled = checked
              })}
            >
              <div className="field-grid field-grid--two">
                <NumberField
                  label="Embedding input tokens"
                  value={config.rag.embeddings.inputTokensPerMonth}
                  step={10_000_000}
                  onChange={(value) => updateConfig((draft) => {
                    draft.rag.embeddings.inputTokensPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Embedding rate"
                  value={config.rag.embeddings.customRateCadPerMillion}
                  step={0.01}
                  suffix="CAD/1M"
                  onChange={(value) => updateConfig((draft) => {
                    draft.rag.embeddings.customRateCadPerMillion = value
                  })}
                />
              </div>
            </ToggleRow>
          </ConfigGroup>
          <ConfigGroup title="Fixed environment infrastructure">
            <ToggleRow
              label="API Management Basic v2"
              description="Production units scale by environment and secondary-region ratio"
              checked={config.platform.apiManagement.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.platform.apiManagement.enabled = checked })}
            >
              <NumberField
                label="Production units"
                value={config.platform.apiManagement.units}
                min={1}
                onChange={(value) => updateConfig((draft) => { draft.platform.apiManagement.units = value ?? 1 })}
              />
            </ToggleRow>
            <ToggleRow
              label="Private endpoints"
              description="Endpoint baseline per production environment"
              checked={config.platform.privateEndpoints.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.platform.privateEndpoints.enabled = checked })}
            >
              <NumberField
                label="Production endpoints"
                value={config.platform.privateEndpoints.endpoints}
                min={1}
                onChange={(value) => updateConfig((draft) => { draft.platform.privateEndpoints.endpoints = value ?? 1 })}
              />
            </ToggleRow>
            <ToggleRow
              label="Application compute"
              description="Select an explicit hosting SKU rate before relying on this line"
              checked={config.platform.appCompute.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.platform.appCompute.enabled = checked })}
            >
              <NumberField
                label="Production instances"
                value={config.platform.appCompute.instances}
                min={1}
                onChange={(value) => updateConfig((draft) => { draft.platform.appCompute.instances = value ?? 1 })}
              />
            </ToggleRow>
          </ConfigGroup>
          <ConfigGroup title="Usage infrastructure">
            <ToggleRow
              label="Network egress"
              description="Microsoft Global Network; first 100 GB free, then graduated CAD tiers"
              checked={config.platform.networkEgress.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.platform.networkEgress.enabled = checked })}
            >
              <NumberField
                label="Monthly egress"
                value={config.platform.networkEgress.gbPerMonth}
                step={100}
                suffix="GB"
                onChange={(value) => updateConfig((draft) => { draft.platform.networkEgress.gbPerMonth = value ?? 0 })}
              />
            </ToggleRow>
          </ConfigGroup>
          <ConfigGroup title="Observability">
            <ToggleRow
              label="Application Insights and Log Analytics"
              description="Ingestion, retention, archive, export, and scheduled alerts"
              checked={config.observability.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.observability.enabled = checked
              })}
            >
              <div className="field-grid field-grid--two">
                <NumberField
                  label="Analytics ingestion"
                  value={config.observability.analyticsIngestionGbPerMonth}
                  suffix="GB/mo"
                  onChange={(value) => updateConfig((draft) => {
                    draft.observability.analyticsIngestionGbPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Billable retention"
                  value={config.observability.billableRetentionGbMonth}
                  suffix="GB-mo"
                  onChange={(value) => updateConfig((draft) => {
                    draft.observability.billableRetentionGbMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Archive"
                  value={config.observability.archiveGbMonth}
                  suffix="GB-mo"
                  onChange={(value) => updateConfig((draft) => {
                    draft.observability.archiveGbMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Data export"
                  value={config.observability.dataExportGbPerMonth}
                  suffix="GB/mo"
                  onChange={(value) => updateConfig((draft) => {
                    draft.observability.dataExportGbPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="15-minute log alerts"
                  value={config.observability.logAlerts15Minute}
                  onChange={(value) => updateConfig((draft) => {
                    draft.observability.logAlerts15Minute = value ?? 0
                  })}
                />
              </div>
            </ToggleRow>
          </ConfigGroup>
          <ConfigGroup title="Network processing">
            <ToggleRow
              label="Private Link data"
              description="Processed ingress and egress in addition to endpoint hours"
              checked={config.networking.privateLinkData.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.networking.privateLinkData.enabled = checked
              })}
            >
              <div className="field-grid field-grid--two">
                <NumberField
                  label="Ingress / month"
                  value={config.networking.privateLinkData.ingressGbPerMonth}
                  suffix="GB"
                  onChange={(value) => updateConfig((draft) => {
                    draft.networking.privateLinkData.ingressGbPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Egress / month"
                  value={config.networking.privateLinkData.egressGbPerMonth}
                  suffix="GB"
                  onChange={(value) => updateConfig((draft) => {
                    draft.networking.privateLinkData.egressGbPerMonth = value ?? 0
                  })}
                />
              </div>
            </ToggleRow>
            <ToggleRow
              label="NAT Gateway"
              description="Gateway hours plus processed data"
              checked={config.networking.natGateway.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.networking.natGateway.enabled = checked
              })}
            >
              <div className="field-grid field-grid--two">
                <NumberField
                  label="Gateways"
                  value={config.networking.natGateway.gateways}
                  min={1}
                  onChange={(value) => updateConfig((draft) => {
                    draft.networking.natGateway.gateways = value ?? 1
                  })}
                />
                <NumberField
                  label="Processed / month"
                  value={config.networking.natGateway.processedGbPerMonth}
                  suffix="GB"
                  onChange={(value) => updateConfig((draft) => {
                    draft.networking.natGateway.processedGbPerMonth = value ?? 0
                  })}
                />
              </div>
            </ToggleRow>
            <ToggleRow
              label="Azure Firewall Basic"
              description="Deployment hours plus processed data"
              checked={config.networking.firewallBasic.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.networking.firewallBasic.enabled = checked
              })}
            >
              <div className="field-grid field-grid--two">
                <NumberField
                  label="Deployments"
                  value={config.networking.firewallBasic.deployments}
                  min={1}
                  onChange={(value) => updateConfig((draft) => {
                    draft.networking.firewallBasic.deployments = value ?? 1
                  })}
                />
                <NumberField
                  label="Processed / month"
                  value={config.networking.firewallBasic.processedGbPerMonth}
                  suffix="GB"
                  onChange={(value) => updateConfig((draft) => {
                    draft.networking.firewallBasic.processedGbPerMonth = value ?? 0
                  })}
                />
              </div>
            </ToggleRow>
          </ConfigGroup>
          <ConfigGroup title="Disaster recovery">
            <ToggleRow
              label="Service-specific secondary region"
              description="Secondary capacity by service; replaces the blanket replica ratio"
              checked={config.disasterRecovery.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => {
                draft.disasterRecovery.enabled = checked
                if (checked) draft.secondaryRegionRatio = 0
              })}
            >
              <div className="field-grid field-grid--three">
                <NumberField
                  label="Secondary PTUs"
                  value={config.disasterRecovery.secondaryPtuUnits}
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.secondaryPtuUnits = value ?? 0
                  })}
                />
                <NumberField
                  label="Secondary APIM units"
                  value={config.disasterRecovery.secondaryApiManagementUnits}
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.secondaryApiManagementUnits = value ?? 0
                  })}
                />
                <NumberField
                  label="Secondary Search Units"
                  value={config.disasterRecovery.secondarySearchUnits}
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.secondarySearchUnits = value ?? 0
                  })}
                />
                <NumberField
                  label="Secondary Cosmos throughput"
                  value={config.disasterRecovery.secondaryCosmosRuPerSecond}
                  step={100}
                  suffix="RU/s"
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.secondaryCosmosRuPerSecond = value ?? 0
                  })}
                />
                <NumberField
                  label="Secondary Blob capacity"
                  value={config.disasterRecovery.secondaryBlobStorageGb}
                  suffix="GB"
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.secondaryBlobStorageGb = value ?? 0
                  })}
                />
                <NumberField
                  label="Secondary private endpoints"
                  value={config.disasterRecovery.secondaryPrivateEndpoints}
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.secondaryPrivateEndpoints = value ?? 0
                  })}
                />
                <NumberField
                  label="Secondary app instances"
                  value={config.disasterRecovery.secondaryAppInstances}
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.secondaryAppInstances = value ?? 0
                  })}
                />
                <NumberField
                  label="App compute rate"
                  value={config.disasterRecovery.customAppComputeHourlyRateCad}
                  step={0.01}
                  suffix="CAD/hr"
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.customAppComputeHourlyRateCad = value
                  })}
                />
                <NumberField
                  label="Inter-region transfer"
                  value={config.disasterRecovery.interRegionTransferGbPerMonth}
                  suffix="GB/mo"
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.interRegionTransferGbPerMonth = value ?? 0
                  })}
                />
                <NumberField
                  label="Transfer rate fallback"
                  value={config.disasterRecovery.customInterRegionRateCadPerGb}
                  step={0.01}
                  suffix="CAD/GB"
                  onChange={(value) => updateConfig((draft) => {
                    draft.disasterRecovery.customInterRegionRateCadPerGb = value
                  })}
                />
              </div>
            </ToggleRow>
          </ConfigGroup>
        </Tabs.Content>

        <Tabs.Content value="change" className="config-tabs__content">
          <ConfigGroup title="Lifecycle operations">
            <ToggleRow
              label="Automated evaluation"
              description="Explicit monthly evaluation-run volume"
              checked={config.change.evaluation.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.change.evaluation.enabled = checked })}
            >
              <NumberField
                label="Runs / month"
                value={config.change.evaluation.runsPerMonth}
                step={1_000}
                onChange={(value) => updateConfig((draft) => { draft.change.evaluation.runsPerMonth = value ?? 0 })}
              />
            </ToggleRow>
            <ToggleRow
              label="Security re-validation"
              description="Manually reviewed specialist labour rate"
              checked={config.change.revalidation.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.change.revalidation.enabled = checked })}
            >
              <NumberField
                label="Hours / month"
                value={config.change.revalidation.hoursPerMonth}
                onChange={(value) => updateConfig((draft) => { draft.change.revalidation.hoursPerMonth = value ?? 0 })}
              />
            </ToggleRow>
            <ToggleRow
              label="FinOps operations"
              description="Manually reviewed analyst labour rate"
              checked={config.change.finOps.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.change.finOps.enabled = checked })}
            >
              <NumberField
                label="Hours / month"
                value={config.change.finOps.hoursPerMonth}
                onChange={(value) => updateConfig((draft) => { draft.change.finOps.hoursPerMonth = value ?? 0 })}
              />
            </ToggleRow>
            <ToggleRow
              label="Support allocation"
              description="Explicit support plan allocation; never a hidden percentage"
              checked={config.change.support.enabled}
              onCheckedChange={(checked) => updateConfig((draft) => { draft.change.support.enabled = checked })}
            >
              <NumberField
                label="Plan allocations"
                value={config.change.support.plans}
                min={1}
                onChange={(value) => updateConfig((draft) => { draft.change.support.plans = value ?? 1 })}
              />
            </ToggleRow>
          </ConfigGroup>
          <ConfigGroup title="Commercial assumption">
            <NumberField
              label="Commercial offset"
              value={config.commercialOffsetPercent}
              min={0}
              max={100}
              suffix="%"
              hint="Scenario input; not an Azure list-price rate"
              onChange={(value) => updateConfig((draft) => { draft.commercialOffsetPercent = value ?? 0 })}
            />
          </ConfigGroup>
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  )
}