import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CostResult } from '../domain/types'
import { formatMoney } from '../utils/format'

export default function ProjectionChart({ result }: { result: CostResult }) {
  return (
    <div className="chart-wrap" role="img" aria-label="30-day cumulative cost projection">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={result.projection} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--cp-border)" vertical={false} />
          <XAxis
            dataKey="day"
            stroke="var(--cp-text-muted)"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            ticks={[1, 5, 10, 15, 20, 25, 30]}
          />
          <YAxis
            stroke="var(--cp-text-muted)"
            tickLine={false}
            axisLine={false}
            width={54}
            tick={{ fontSize: 11 }}
            tickFormatter={(value: number) => formatMoney(value)}
          />
          <ChartTooltip
            formatter={(value) => [formatMoney(Number(value)), 'Cumulative']}
            labelFormatter={(day) => `Day ${day}`}
            contentStyle={{
              background: 'var(--cp-surface)',
              border: '1px solid var(--cp-border)',
              borderRadius: '8px',
              color: 'var(--cp-text)',
              boxShadow: 'var(--cp-shadow)',
            }}
          />
          <Line
            type="monotone"
            dataKey="cumulative"
            stroke="var(--cp-accent)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--cp-accent)', stroke: 'var(--cp-surface)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}