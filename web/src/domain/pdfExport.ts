import type { jsPDF as JsPdf } from 'jspdf'
import {
  COST_TIERS,
  REGION_LABELS,
  type CostConfig,
  type CostResult,
  type CostTier,
  type CommercialModelConfig,
  type RateCard,
} from './types'

const TIER_LABELS: Record<CostTier, string> = {
  run: 'Run',
  guardrail: 'Guardrail',
  platform: 'Platform',
  change: 'Change',
}

type Rgb = [number, number, number]

const COLORS: Record<'text' | 'muted' | 'border' | 'surface' | 'accent' | 'warning', Rgb> = {
  text: [34, 34, 34],
  muted: [92, 92, 92],
  border: [210, 210, 210],
  surface: [246, 246, 246],
  accent: [0, 120, 212],
  warning: [166, 94, 0],
}

const money = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)

const number = (value: number, digits = 1) =>
  new Intl.NumberFormat('en-CA', { maximumFractionDigits: digits }).format(value)

const printable = (value: string) => Array.from(
  value
    .normalize('NFKD')
    .replace(/[–—]/g, '-')
    .replace(/×/g, 'x')
    .replace(/·/g, ' | '),
).filter((character) => {
  const code = character.codePointAt(0) ?? 0
  return character === '\n' || character === '\r' || (code >= 32 && code <= 126)
}).join('')

interface PdfExportInput {
  config: CostConfig
  result: CostResult
  rateCard: RateCard
  exportedAt: string
  scenarioName?: string
}

type PdfWithTable = JsPdf & { lastAutoTable?: { finalY: number } }

export async function createCostEstimatePdf({
  config,
  result,
  rateCard,
  exportedAt,
  scenarioName,
}: PdfExportInput): Promise<JsPdf> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const document = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
  const pdf = document as PdfWithTable
  const pageWidth = document.internal.pageSize.getWidth()
  const pageHeight = document.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - margin * 2
  const modelDeployments = new Map<string, { label: string; model: CommercialModelConfig }>([
    ['primary', { label: 'Primary deployment', model: config.commercialModel }],
    ...config.modelPortfolio.deployments.map((deployment) => [
      deployment.id,
      { label: deployment.label, model: deployment.model },
    ] as const),
  ])
  const portfolioRows = config.modelPortfolio.routes.map((route) => {
    const deployment = modelDeployments.get(route.deploymentId)
    return [
      route.label,
      deployment?.model.modelId ?? 'Unresolved deployment',
      deployment?.model.deploymentSku ?? 'Unknown',
      route.mode === 'traffic-share'
        ? `${number(route.trafficPercent)}% shared traffic`
        : `${number(route.trafficPercent)}% additional calls`,
      deployment?.model.enabled === false ? 'Disabled' : 'Enabled',
    ]
  })
  const reportName = printable(
    scenarioName?.trim() || `${config.posture === 'production' ? 'Production' : 'Lean POC'} scenario`,
  )
  const unpricedLines = result.lines.filter((line) => line.amount === null)
  const estimateStatus = result.complete
    ? 'Complete estimate - all active lines priced'
    : `Known subtotal - ${unpricedLines.length} active line${unpricedLines.length === 1 ? '' : 's'} excluded as unpriced`

  document.setProperties({
    title: `Foundry Cost Lab - ${reportName}`,
    subject: `${estimateStatus}; native CAD rate card ${rateCard.asOf}`,
    author: 'Foundry Cost Lab',
    creator: 'Foundry Cost Lab',
  })

  const drawBrand = () => {
    const size = 8
    const gap = 1.5
    const left = margin
    const top = 34
    const tiles: Rgb[] = [
      [242, 80, 34],
      [127, 186, 0],
      [0, 164, 239],
      [255, 185, 0],
    ]
    tiles.forEach((color, index) => {
      document.setFillColor(...color)
      document.rect(
        left + (index % 2) * (size + gap),
        top + Math.floor(index / 2) * (size + gap),
        size,
        size,
        'F',
      )
    })
    document.setTextColor(...COLORS.text)
    document.setFont('helvetica', 'bold')
    document.setFontSize(18)
    document.text('Foundry Cost Lab', left + 28, top + 9)
    document.setTextColor(...COLORS.muted)
    document.setFont('helvetica', 'normal')
    document.setFontSize(8)
    document.text('ESTIMATE, NOT QUOTE', left + 28, top + 20)
  }

  drawBrand()
  document.setTextColor(...COLORS.muted)
  document.setFontSize(8)
  document.text(
    `Generated ${printable(new Date(exportedAt).toLocaleString('en-CA'))}`,
    pageWidth - margin,
    39,
    { align: 'right' },
  )
  document.text(`Rate card ${rateCard.asOf}`, pageWidth - margin, 50, { align: 'right' })

  let cursor = 78
  document.setFillColor(...COLORS.surface)
  document.setDrawColor(...COLORS.border)
  document.roundedRect(margin, cursor, contentWidth, 74, 3, 3, 'FD')
  document.setTextColor(...COLORS.muted)
  document.setFont('helvetica', 'normal')
  document.setFontSize(8)
  document.text(
    result.complete ? 'ESTIMATED MONTHLY COST' : 'KNOWN MONTHLY SUBTOTAL',
    margin + 14,
    cursor + 18,
  )
  document.setTextColor(...COLORS.text)
  document.setFont('helvetica', 'bold')
  document.setFontSize(24)
  document.text(money(result.knownGrandTotal, 0), margin + 14, cursor + 43)
  document.setFontSize(9)
  const statusColor: Rgb = result.complete ? [22, 126, 62] : COLORS.warning
  document.setTextColor(...statusColor)
  document.text(printable(estimateStatus), margin + 14, cursor + 61)

  document.setTextColor(...COLORS.text)
  document.setFontSize(9)
  document.text(reportName, margin + 280, cursor + 20)
  document.setFont('helvetica', 'normal')
  document.setTextColor(...COLORS.muted)
  document.text(
    `${REGION_LABELS[config.region]} | ${config.posture === 'production' ? 'Production' : 'Lean POC'}`,
    margin + 280,
    cursor + 35,
  )
  document.text(
    `${config.modelPortfolio.routes.length} model route(s) | ${modelDeployments.size} deployment(s)`,
    margin + 280,
    cursor + 50,
    { maxWidth: 215 },
  )

  const section = (title: string, y: number) => {
    let nextY = y
    if (nextY > pageHeight - 70) {
      document.addPage()
      nextY = 42
    }
    document.setTextColor(...COLORS.text)
    document.setFont('helvetica', 'bold')
    document.setFontSize(11)
    document.text(title, margin, nextY)
    document.setDrawColor(...COLORS.accent)
    document.setLineWidth(1.5)
    document.line(margin, nextY + 5, margin + 28, nextY + 5)
    return nextY + 14
  }

  cursor = section('Scenario basis', cursor + 98)
  autoTable(document, {
    startY: cursor,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, textColor: COLORS.text, cellPadding: 5 },
    headStyles: { fillColor: COLORS.surface, textColor: COLORS.text, fontStyle: 'bold' },
    head: [['Input', 'Configured value', 'Input', 'Configured value']],
    body: [
      ['Monthly users', number(config.workload.monthlyUsers, 0), 'Active days', number(config.workload.activeDaysPerMonth, 0)],
      ['Requests/user/day', number(config.workload.requestsPerUserPerDay), 'Agent turns/request', number(config.workload.agentTurnMultiplier)],
      ['Input tokens/turn', number(config.workload.inputTokensPerTurn, 0), 'Output tokens/turn', number(config.workload.outputTokensPerTurn, 0)],
      ['Environments', number(config.environments, 0), 'Commercial mode', `${config.commercialModel.purchaseMode.toUpperCase()} / ${config.commercialModel.billingBasis}`],
    ].map((row) => row.map(printable)),
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 166 },
      2: { cellWidth: 100 },
      3: { cellWidth: 166 },
    },
  })

  cursor = section('Model portfolio', (pdf.lastAutoTable?.finalY ?? cursor) + 24)
  autoTable(document, {
    startY: cursor,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, textColor: COLORS.text, cellPadding: 5 },
    headStyles: { fillColor: COLORS.surface, textColor: COLORS.text, fontStyle: 'bold' },
    head: [['Route', 'Model', 'Deployment SKU', 'Routing', 'State']],
    body: portfolioRows.map((row) => row.map(printable)),
    columnStyles: {
      0: { cellWidth: 84 },
      1: { cellWidth: 154 },
      2: { cellWidth: 96 },
      3: { cellWidth: 126 },
      4: { cellWidth: 72 },
    },
  })

  cursor = section('Monthly cost by tier', (pdf.lastAutoTable?.finalY ?? cursor) + 24)
  autoTable(document, {
    startY: cursor,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, textColor: COLORS.text, cellPadding: 5 },
    headStyles: { fillColor: COLORS.accent, textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['Tier', 'Known subtotal', 'Unpriced lines']],
    body: COST_TIERS.map((tier) => [
      TIER_LABELS[tier],
      money(result.tiers[tier].knownSubtotal),
      String(result.tiers[tier].unpricedLineCount),
    ]),
    columnStyles: {
      0: { cellWidth: 150 },
      1: { cellWidth: 191, halign: 'right' },
      2: { cellWidth: 191, halign: 'right' },
    },
  })

  cursor = section('Detailed monthly cost lines', (pdf.lastAutoTable?.finalY ?? cursor) + 24)
  autoTable(document, {
    startY: cursor,
    margin: { left: margin, right: margin, bottom: 38 },
    theme: 'striped',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      textColor: COLORS.text,
      cellPadding: 4,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: [65, 65, 65], textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['Tier', 'Cost item', 'Basis', 'Quantity', 'Unit rate', 'Monthly']],
    body: result.lines.map((line) => [
      TIER_LABELS[line.tier],
      printable(line.label),
      printable(line.detail),
      `${number(line.quantity)} ${printable(line.quantityUnit)}`,
      line.unitRate === null
        ? 'Unpriced'
        : `${money(line.unitRate, 5)} / ${printable(line.rateUnit.replace(/^CAD\//, ''))}`,
      line.amount === null ? 'UNPRICED' : money(line.amount),
    ]),
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 92 },
      2: { cellWidth: 143 },
      3: { cellWidth: 72, halign: 'right' },
      4: { cellWidth: 88, halign: 'right' },
      5: { cellWidth: 72, halign: 'right' },
    },
  })

  if (unpricedLines.length > 0) {
    cursor = section('Unpriced decisions', (pdf.lastAutoTable?.finalY ?? cursor) + 24)
    autoTable(document, {
      startY: cursor,
      margin: { left: margin, right: margin, bottom: 38 },
      theme: 'grid',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 7,
        textColor: COLORS.text,
        cellPadding: 4,
        overflow: 'linebreak',
      },
      headStyles: { fillColor: COLORS.warning, textColor: [255, 255, 255], fontStyle: 'bold' },
      head: [['Cost item', 'Missing rate key', 'Reason']],
      body: unpricedLines.map((line) => [
        printable(line.label),
        printable(line.rateKey ?? 'Scenario input required'),
        printable(line.provenance.unavailableReason ?? line.provenance.source),
      ]),
      columnStyles: { 0: { cellWidth: 125 }, 1: { cellWidth: 160 }, 2: { cellWidth: 247 } },
    })
  }

  cursor = section('Rate provenance and assumptions', (pdf.lastAutoTable?.finalY ?? cursor) + 24)
  autoTable(document, {
    startY: cursor,
    margin: { left: margin, right: margin, bottom: 46 },
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      textColor: COLORS.text,
      cellPadding: 4,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: [65, 65, 65], textColor: [255, 255, 255], fontStyle: 'bold' },
    head: [['Cost item', 'Source / as of', 'Formula and assumption']],
    body: result.lines.map((line) => [
      printable(line.label),
      printable(`${line.provenance.source} | ${line.provenance.asOf} | ${line.provenance.maintenance}`),
      printable(`${line.formula}. ${line.assumption}`),
    ]),
    columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 190 }, 2: { cellWidth: 222 } },
  })

  cursor = pdf.lastAutoTable?.finalY ?? cursor
  if (cursor > pageHeight - 90) {
    document.addPage()
    cursor = 42
  } else {
    cursor += 22
  }
  document.setFont('helvetica', 'bold')
  document.setFontSize(8)
  document.setTextColor(...COLORS.text)
  document.text('Planning estimate only.', margin, cursor)
  document.setFont('helvetica', 'normal')
  document.setTextColor(...COLORS.muted)
  document.text(
    'Native CAD list rates exclude negotiated agreements, taxes, and customer-specific commitments. Unpriced lines are excluded from the known subtotal.',
    margin,
    cursor + 12,
    { maxWidth: contentWidth },
  )

  const pageCount = document.getNumberOfPages()
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    document.setPage(pageNumber)
    document.setDrawColor(...COLORS.border)
    document.setLineWidth(0.5)
    document.line(margin, pageHeight - 27, pageWidth - margin, pageHeight - 27)
    document.setFont('helvetica', 'normal')
    document.setFontSize(7)
    document.setTextColor(...COLORS.muted)
    document.text(`Foundry Cost Lab | ${rateCard.asOf}`, margin, pageHeight - 15)
    document.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 15, {
      align: 'right',
    })
  }

  return document
}