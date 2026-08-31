import { Check, MessageCircle, Pencil, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { computeCost } from '../domain/computeCost'
import {
  buildGuidedConfig,
  applyGuidedConsiderations,
  DEFAULT_GUIDED_ANSWERS,
  GUIDED_SCALE_USERS,
  interpretGuidedConsiderations,
  type GuidedAvailability,
  type GuidedConsiderationSuggestion,
  type GuidedEstimateAnswers,
  type GuidedHosting,
  type GuidedRequirement,
  type GuidedScale,
  type GuidedUseCase,
} from '../domain/guidedEstimate'
import { getFoundryModel, type ActiveFoundryCatalog } from '../domain/foundryCatalog'
import { REGION_IDS, REGION_LABELS, type CostConfig, type ModelPortfolioStrategy, type Posture, type RateCard, type RegionId } from '../domain/types'
import { formatMoney, formatNumber } from '../utils/format'
import { NumberField } from './Controls'

export const GUIDED_ESTIMATE_STORAGE_KEY = 'foundry-cost-lab-guided-estimate-v1'

type GuidedStep = 'use-case' | 'posture' | 'region' | 'scale' | 'hosting' | 'capacity' | 'model-strategy' | 'requirements' | 'considerations' | 'review'

interface GuidedEstimateProps {
  currentConfig: CostConfig
  rateCard: RateCard
  catalog: ActiveFoundryCatalog
  onApply: (config: CostConfig) => void
  onSkip: () => void
}

const USE_CASES: Array<{ value: GuidedUseCase; label: string; detail: string }> = [
  { value: 'employee-assistant', label: 'Employee assistant', detail: 'Internal knowledge and productivity' },
  { value: 'customer-agent', label: 'Customer agent', detail: 'External conversations and service' },
  { value: 'workflow-agent', label: 'Workflow agent', detail: 'Automate multi-step business processes' },
  { value: 'explore', label: 'Still exploring', detail: 'Start with conservative assumptions' },
]

const POSTURES: Array<{ value: Posture; label: string; detail: string }> = [
  { value: 'poc', label: 'Pilot', detail: 'Lean environment and lower volume' },
  { value: 'production', label: 'Production', detail: 'Operations, security, and resilience' },
]

const SCALES: Array<{ value: GuidedScale; label: string; detail: string }> = [
  { value: 'small', label: 'Small', detail: '250 monthly users' },
  { value: 'medium', label: 'Medium', detail: '2,000 monthly users' },
  { value: 'large', label: 'Large', detail: '10,000 monthly users' },
]

const HOSTING: Array<{ value: GuidedHosting; label: string; detail: string }> = [
  { value: 'pay-per-use', label: 'Pay per use', detail: 'Usage-based model billing' },
  { value: 'dedicated', label: 'Dedicated endpoint', detail: 'GPU capacity billed by instance-hour' },
]

const AVAILABILITY: Array<{ value: GuidedAvailability; label: string; detail: string }> = [
  { value: 'always', label: 'Always on', detail: '730 hours / month' },
  { value: 'business', label: 'Business hours', detail: '176 hours / month' },
  { value: 'custom', label: 'Custom', detail: 'Enter expected occupied hours' },
]

const MODEL_STRATEGIES: Array<{ value: ModelPortfolioStrategy; label: string; detail: string }> = [
  { value: 'single', label: 'Single model', detail: 'One model handles every request' },
  { value: 'cost-optimized', label: 'Cost optimized', detail: 'Fast model 70% · primary model 30%' },
  { value: 'quality-focused', label: 'Quality focused', detail: 'Primary model plus 15% reasoning assist' },
  { value: 'multimodal', label: 'Multimodal', detail: 'Primary model plus 10% vision/audio assist' },
]

const REQUIREMENTS: Array<{ value: GuidedRequirement; label: string; detail: string }> = [
  { value: 'knowledge', label: 'Company knowledge', detail: 'Search, threads, and file storage' },
  { value: 'private-networking', label: 'Private networking', detail: 'Private endpoints and data processing' },
  { value: 'observability', label: 'Production monitoring', detail: 'Application Insights and logs' },
  { value: 'disaster-recovery', label: 'Disaster recovery', detail: 'Secondary service capacity' },
  { value: 'content-safety', label: 'Content safety', detail: 'Standalone moderation records' },
  { value: 'api-management', label: 'API gateway', detail: 'API Management capacity' },
]

const stepOrder = (answers: GuidedEstimateAnswers): GuidedStep[] => [
  'use-case',
  'posture',
  'region',
  'scale',
  'hosting',
  ...(answers.hosting === 'dedicated' ? ['capacity' as const] : []),
  'model-strategy',
  'requirements',
  'considerations',
  'review',
]

const questionFor = (step: GuidedStep) => ({
  'use-case': 'What are you planning?',
  posture: 'Is this a pilot or a production design?',
  region: 'Where should the workload run?',
  scale: 'What usage level should we model?',
  hosting: 'How should the primary model run?',
  capacity: 'How much dedicated capacity should we reserve?',
  'model-strategy': 'How should requests use the model portfolio?',
  requirements: 'Which platform requirements should be included?',
  considerations: 'Any other considerations we should reflect?',
  review: 'Review the assumptions before applying them.',
})[step]

const optionLabel = <T extends string>(options: Array<{ value: T; label: string }>, value: T) =>
  options.find((option) => option.value === value)?.label ?? value

const answerFor = (step: GuidedStep, answers: GuidedEstimateAnswers) => {
  if (step === 'use-case') return optionLabel(USE_CASES, answers.useCase)
  if (step === 'posture') return optionLabel(POSTURES, answers.posture)
  if (step === 'region') return REGION_LABELS[answers.region]
  if (step === 'scale') return `${optionLabel(SCALES, answers.scale)} · ${formatNumber(GUIDED_SCALE_USERS[answers.scale], 0)} users`
  if (step === 'hosting') return optionLabel(HOSTING, answers.hosting)
  if (step === 'capacity') {
    const availability = optionLabel(AVAILABILITY, answers.availability)
    return `${answers.instances} ${answers.instances === 1 ? 'instance' : 'instances'} · ${availability}`
  }
  if (step === 'model-strategy') return optionLabel(MODEL_STRATEGIES, answers.modelStrategy)
  if (step === 'requirements') {
    return answers.requirements.length
      ? answers.requirements.map((requirement) => optionLabel(REQUIREMENTS, requirement)).join(', ')
      : 'No additional platform requirements'
  }
  if (step === 'considerations') return answers.considerations.trim() || 'No additional considerations'
  return ''
}

function ChoiceGrid<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: Array<{ value: T; label: string; detail: string }>
  value: T
  onSelect: (value: T) => void
}) {
  return (
    <div className="guide-choice-grid">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={`guide-choice${value === option.value ? ' guide-choice--selected' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onSelect(option.value)}
        >
          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
          {value === option.value ? <Check aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  )
}

export function GuidedEstimate({ currentConfig, rateCard, catalog, onApply, onSkip }: GuidedEstimateProps) {
  const [answers, setAnswers] = useState<GuidedEstimateAnswers>(() => ({
    ...DEFAULT_GUIDED_ANSWERS,
    region: currentConfig.region,
  }))
  const [step, setStep] = useState<GuidedStep>('use-case')
  const [considerationSuggestions, setConsiderationSuggestions] = useState<GuidedConsiderationSuggestion[]>([])
  const steps = stepOrder(answers)
  const stepIndex = steps.indexOf(step)
  const completedSteps = steps.slice(0, Math.max(0, stepIndex)).filter((candidate) => candidate !== 'review')
  const effectiveAnswers = useMemo(
    () => applyGuidedConsiderations(answers, considerationSuggestions),
    [answers, considerationSuggestions],
  )
  const draftConfig = useMemo(
    () => buildGuidedConfig(effectiveAnswers, catalog.models, currentConfig.periodStart),
    [effectiveAnswers, catalog.models, currentConfig.periodStart],
  )
  const draftResult = useMemo(
    () => computeCost(draftConfig, rateCard, catalog.models),
    [catalog.models, draftConfig, rateCard],
  )
  const portfolioDeployments = new Map([
    ['primary', draftConfig.commercialModel],
    ...draftConfig.modelPortfolio.deployments.map((deployment) => [deployment.id, deployment.model] as const),
  ])
  const portfolioRoutes = draftConfig.modelPortfolio.routes.map((route) => {
    const model = portfolioDeployments.get(route.deploymentId)
    const catalogModel = model ? getFoundryModel(model.modelId, catalog.models) : null
    return {
      ...route,
      modelLabel: catalogModel?.name ?? model?.modelId ?? 'Unresolved deployment',
      routingLabel: route.mode === 'traffic-share'
        ? `${route.trafficPercent}% shared traffic`
        : `${route.trafficPercent}% additional calls`,
    }
  })
  const hostingMethods = new Set([...portfolioDeployments.values()].map((model) =>
    model.billingBasis === 'managed-compute' ? 'Dedicated endpoint' : 'Pay per use',
  ))
  const portfolioHosting = hostingMethods.size > 1 ? 'Mixed hosting' : [...hostingMethods][0] ?? optionLabel(HOSTING, answers.hosting)
  const activeUnpriced = draftResult.lines.filter((line) => line.amount === null).length

  const updateAnswers = (change: Partial<GuidedEstimateAnswers>) => {
    setAnswers((current) => ({ ...current, ...change }))
  }

  const advance = (nextStep: GuidedStep, change: Partial<GuidedEstimateAnswers> = {}) => {
    updateAnswers(change)
    setStep(nextStep)
  }

  const reset = () => {
    setAnswers({ ...DEFAULT_GUIDED_ANSWERS, region: currentConfig.region })
    setConsiderationSuggestions([])
    setStep('use-case')
  }

  const toggleRequirement = (requirement: GuidedRequirement) => {
    setAnswers((current) => ({
      ...current,
      requirements: current.requirements.includes(requirement)
        ? current.requirements.filter((candidate) => candidate !== requirement)
        : [...current.requirements, requirement],
    }))
  }

  const reviewConsiderations = () => {
    setConsiderationSuggestions(interpretGuidedConsiderations(answers.considerations))
    setStep('review')
  }

  const removeConsiderationSuggestion = (field: GuidedConsiderationSuggestion['field']) => {
    setConsiderationSuggestions((current) => current.filter((suggestion) => suggestion.field !== field))
  }

  return (
    <section className="guided-estimate" aria-labelledby="guided-estimate-title">
      <header className="guided-estimate__header">
        <div>
          <span className="eyebrow">Guided estimate</span>
          <h2 id="guided-estimate-title">Build a cost scenario</h2>
          <p>Answer a few planning questions, then review every assumption before applying it.</p>
        </div>
        <button type="button" className="button button--quiet" onClick={onSkip}>Skip to calculator</button>
      </header>

      <div className="guided-estimate__layout">
        <div className="guide-conversation">
          <div
            className="guide-progress"
            role="progressbar"
            aria-label="Guided estimate progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={Math.min(stepIndex + 1, steps.length)}
          >
            <span style={{ width: `${Math.max(8, (stepIndex + 1) / steps.length * 100)}%` }} />
          </div>

          <div className="guide-transcript" role="log" aria-live="polite">
            {completedSteps.map((completedStep) => (
              <div className="guide-exchange" key={completedStep}>
                <div className="guide-message guide-message--assistant">
                  <MessageCircle aria-hidden="true" /><span>{questionFor(completedStep)}</span>
                </div>
                <div className="guide-message guide-message--answer">
                  <span>{answerFor(completedStep, answers)}</span>
                  <button type="button" aria-label={`Edit ${questionFor(completedStep)}`} onClick={() => setStep(completedStep)}>
                    <Pencil aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}

            <div className="guide-message guide-message--assistant guide-message--current">
              <MessageCircle aria-hidden="true" />
              <div><strong>{questionFor(step)}</strong>{step === 'review' ? <small>The calculator remains unchanged until you apply this draft.</small> : null}</div>
            </div>
          </div>

          <div className="guide-response" aria-label={questionFor(step)}>
            {step === 'use-case' ? <ChoiceGrid options={USE_CASES} value={answers.useCase} onSelect={(useCase) => advance('posture', { useCase })} /> : null}
            {step === 'posture' ? <ChoiceGrid options={POSTURES} value={answers.posture} onSelect={(posture) => advance('region', { posture, instances: posture === 'production' ? 2 : 1 })} /> : null}
            {step === 'region' ? (
              <div className="guide-choice-grid">
                {REGION_IDS.map((region) => (
                  <button type="button" key={region} className={`guide-choice${answers.region === region ? ' guide-choice--selected' : ''}`} aria-pressed={answers.region === region} onClick={() => advance('scale', { region: region as RegionId })}>
                    <span><strong>{REGION_LABELS[region]}</strong><small>Azure pricing region</small></span>
                    {answers.region === region ? <Check aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
            {step === 'scale' ? <ChoiceGrid options={SCALES} value={answers.scale} onSelect={(scale) => advance('hosting', { scale })} /> : null}
            {step === 'hosting' ? <ChoiceGrid options={HOSTING} value={answers.hosting} onSelect={(hosting) => advance(hosting === 'dedicated' ? 'capacity' : 'model-strategy', { hosting })} /> : null}
            {step === 'capacity' ? (
              <div className="guide-form">
                <ChoiceGrid options={AVAILABILITY} value={answers.availability} onSelect={(availability) => updateAnswers({ availability })} />
                <div className="field-grid field-grid--two">
                  <NumberField label="Instances" value={answers.instances} min={1} max={20} onChange={(instances) => updateAnswers({ instances: instances ?? 1 })} />
                  {answers.availability === 'custom' ? <NumberField label="Hours / month" value={answers.customHoursPerMonth} min={0} max={730} onChange={(customHoursPerMonth) => updateAnswers({ customHoursPerMonth: customHoursPerMonth ?? 0 })} /> : null}
                  <NumberField label="VM hourly rate" value={answers.vmHourlyRateCad} min={0} step={0.01} suffix="CAD/hr" hint="Optional. Leave blank to mark compute as unpriced." onChange={(vmHourlyRateCad) => updateAnswers({ vmHourlyRateCad })} />
                </div>
                <button type="button" className="button button--primary" onClick={() => setStep('model-strategy')}>Continue</button>
              </div>
            ) : null}
            {step === 'model-strategy' ? <ChoiceGrid options={MODEL_STRATEGIES} value={answers.modelStrategy} onSelect={(modelStrategy) => advance('requirements', { modelStrategy })} /> : null}
            {step === 'requirements' ? (
              <div className="guide-form">
                <div className="guide-choice-grid">
                  {REQUIREMENTS.map((requirement) => {
                    const selected = answers.requirements.includes(requirement.value)
                    return (
                      <button type="button" key={requirement.value} className={`guide-choice${selected ? ' guide-choice--selected' : ''}`} aria-pressed={selected} onClick={() => toggleRequirement(requirement.value)}>
                        <span><strong>{requirement.label}</strong><small>{requirement.detail}</small></span>
                        {selected ? <Check aria-hidden="true" /> : null}
                      </button>
                    )
                  })}
                </div>
                <button type="button" className="button button--primary" onClick={() => setStep('considerations')}>Continue</button>
              </div>
            ) : null}
            {step === 'considerations' ? (
              <div className="guide-form guide-considerations">
                <label className="field">
                  <span className="field__label">Additional considerations</span>
                  <textarea
                    value={answers.considerations}
                    maxLength={1_200}
                    placeholder="For example: 5,000 users in East US 2, business hours, 3 instances at CAD 6.50/hr, private networking, monitoring, DR, and a reasoning model for complex requests."
                    onChange={(event) => {
                      updateAnswers({ considerations: event.target.value })
                      setConsiderationSuggestions([])
                    }}
                  />
                  <span className="field__hint">Optional. Only supported assumptions are applied; other text stays visible for human review.</span>
                </label>
                <button type="button" className="button button--primary" onClick={reviewConsiderations}>Review estimate</button>
              </div>
            ) : null}
            {step === 'review' ? (
              <div className="guide-review">
                {answers.considerations.trim() ? (
                  <section className="guide-consideration-review" aria-labelledby="consideration-review-title">
                    <div>
                      <strong id="consideration-review-title">Applied from your note</strong>
                      <button type="button" className="button button--quiet" onClick={() => setStep('considerations')}>Edit note</button>
                    </div>
                    {considerationSuggestions.length > 0 ? (
                      <div className="guide-suggestion-list">
                        {considerationSuggestions.map((suggestion) => (
                          <span key={suggestion.field} className="guide-suggestion">
                            {suggestion.label}
                            <button type="button" aria-label={`Remove ${suggestion.label}`} onClick={() => removeConsiderationSuggestion(suggestion.field)}>
                              <X aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : <p>No supported calculator assumptions were detected. The note remains for review.</p>}
                    <blockquote>{answers.considerations}</blockquote>
                  </section>
                ) : null}
                <div className="guide-review-actions">
                  <button type="button" className="button button--primary" onClick={() => onApply(draftConfig)}>Apply estimate</button>
                  <button type="button" className="button button--quiet" onClick={() => setStep('considerations')}>Back</button>
                  <button type="button" className="button button--quiet" onClick={reset}><RotateCcw aria-hidden="true" />Start over</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="guide-preview" aria-label="Draft estimate" aria-live="polite">
          <span className="eyebrow">Draft estimate</span>
          <strong className="guide-preview__total">{formatMoney(draftResult.knownGrandTotal)}</strong>
          <span className="guide-preview__period">known monthly subtotal</span>
          <dl>
            <div><dt>Stage</dt><dd>{effectiveAnswers.posture === 'production' ? 'Production' : 'Pilot'}</dd></div>
            <div><dt>Region</dt><dd>{REGION_LABELS[effectiveAnswers.region]}</dd></div>
            <div><dt>Usage</dt><dd>{formatNumber(draftConfig.workload.monthlyUsers, 0)} monthly users</dd></div>
            <div><dt>Hosting</dt><dd>{portfolioHosting}</dd></div>
            <div><dt>Portfolio</dt><dd>{portfolioRoutes.length} {portfolioRoutes.length === 1 ? 'model route' : 'model routes'}</dd></div>
          </dl>
          <div className="guide-preview__portfolio" aria-label="Model portfolio">
            {portfolioRoutes.map((route) => (
              <div key={route.id}>
                <span><strong>{route.label}</strong><small>{route.routingLabel}</small></span>
                <span>{route.modelLabel}</span>
              </div>
            ))}
          </div>
          <div className={`guide-preview__status${draftResult.complete ? ' guide-preview__status--complete' : ''}`}>
            <strong>{draftResult.complete ? 'Pricing complete' : `${activeUnpriced} unpriced ${activeUnpriced === 1 ? 'item' : 'items'}`}</strong>
            <span>{draftResult.complete ? 'All active lines have a rate.' : 'Unknown costs are excluded from the subtotal.'}</span>
          </div>
          <small>Planning estimate only. You can edit every input in the calculator after applying.</small>
        </aside>
      </div>
    </section>
  )
}