import type { FlightLine, PlacementRow } from './types.ts'

const DAY = 86_400_000
export const dayNum = (d: string) => Math.round(Date.parse(d + 'T00:00:00Z') / DAY)
export const dayStr = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)

export type PaceStatus = 'on' | 'under' | 'over' | 'done' | 'not-started'

export interface LinePacing {
  line: string
  budget: number
  start: string
  end: string
  asOf: string
  days: number
  elapsed: number // days fully elapsed including asOf
  spent: number
  expected: number // even pacing to date
  pace: number // spent / expected
  status: PaceStatus
  /** Daily spend needed from tomorrow to land exactly on budget. */
  neededDaily: number
  currentDaily: number // average over the last 7 days of data
  projected: number // spent + currentDaily × remaining days
  series: { day: string; expected: number; actual: number }[]
}

/**
 * Even-pacing tracker. Expected spend to date = budget × elapsed / total days; under below 90%, over above 110%.
 * Rows are matched to a flight line by line item, then by campaign. Rows without a date are ignored here.
 */
export function pacing(flight: FlightLine[], rows: PlacementRow[], asOfOverride?: string): LinePacing[] {
  const dated = rows.filter(r => r.date)
  const lastData = dated.reduce((m, r) => (r.date! > m ? r.date! : m), '')
  return flight.map(f => {
    const key = f.line.trim().toLowerCase()
    const daily = new Map<string, number>()
    for (const r of dated) {
      const k = (r.line ?? r.campaign ?? '').trim().toLowerCase()
      if (k !== key) continue
      daily.set(r.date!, (daily.get(r.date!) ?? 0) + r.spend)
    }
    const s = dayNum(f.start), e = dayNum(f.end)
    const days = e - s + 1
    const asOf = asOfOverride ?? (lastData || f.start)
    const a = Math.min(Math.max(dayNum(asOf), s - 1), e)
    const elapsed = Math.max(0, a - s + 1)
    let cum = 0
    const series: LinePacing['series'] = []
    for (let d = s; d <= e; d++) {
      const ds = dayStr(d)
      if (d <= a) cum += daily.get(ds) ?? 0
      series.push({ day: ds, expected: f.budget * (d - s + 1) / days, actual: d <= a ? cum : NaN })
    }
    const spent = cum
    const expected = f.budget * elapsed / days
    const pace = expected ? spent / expected : 0
    const remaining = e - a
    let last7 = 0, n7 = 0
    for (let d = Math.max(s, a - 6); d <= a; d++) { last7 += daily.get(dayStr(d)) ?? 0; n7++ }
    const currentDaily = n7 ? last7 / n7 : 0
    const status: PaceStatus = elapsed === 0 ? 'not-started' : remaining === 0 ? 'done' : pace < 0.9 ? 'under' : pace > 1.1 ? 'over' : 'on'
    return {
      line: f.line, budget: f.budget, start: f.start, end: f.end, asOf: dayStr(a), days, elapsed, spent, expected, pace, status,
      neededDaily: remaining > 0 ? Math.max(0, f.budget - spent) / remaining : 0,
      currentDaily, projected: spent + currentDaily * remaining, series,
    }
  })
}
