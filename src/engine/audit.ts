import { domainPattern, normalize } from './domain.ts'
import type { Config, Dataset, FreqBucket, PlacementKind, PlacementRow } from './types.ts'

export type SignalId = 'known' | 'ivt' | 'viewability' | 'ctr' | 'pattern' | 'concentration' | 'cpm' | 'frequency' | 'manual'

/** Points per signal. Documented on /docs and in the report so the score is never a black box. */
export const SIGNALS: Record<SignalId, { label: string; max: number; help: string }> = {
  known: { label: 'On your known-MFA list', max: 60, help: 'The domain or app matches a list you uploaded.' },
  ivt: { label: 'High invalid traffic', max: 30, help: 'IVT rate above your limit. 15 points at the limit, rising to 30 at three times it.' },
  viewability: { label: 'Low viewability', max: 25, help: 'Measured viewability below your floor. 12 points just under it, 25 at half of it or less.' },
  ctr: { label: 'CTR outlier', max: 20, help: 'Robust z-score of CTR vs the campaign (median and MAD) of 3.5 or more in either direction. Accidental-click layouts and bots show up high; dead inventory shows up low.' },
  pattern: { label: 'Suspicious domain pattern', max: 15, help: 'Long hyphenated slideshow-style names or random-looking strings. Never applied to apps or CTV.' },
  concentration: { label: 'Impressions with no conversions', max: 15, help: 'Takes 3% or more of impressions, has zero conversions, and the campaign rate says it should have had at least 3.' },
  cpm: { label: 'CPM far below median', max: 10, help: 'CPM under 40% of the campaign median. Very cheap inventory that still wins the auction is often arbitraged.' },
  frequency: { label: 'Over-frequency', max: 10, help: 'Average frequency on the placement is more than twice the effective cap.' },
  manual: { label: 'Blocked by you', max: 100, help: 'You marked this placement as blocked.' },
}

export interface Signal { id: SignalId; points: number; detail: string }

export interface Placement {
  key: string
  kind: PlacementKind
  raw: string[] // distinct raw labels that normalized to this key (first few)
  impressions: number
  clicks: number
  conversions: number
  spend: number
  revenue: number
  viewability: number | null
  ivt: number | null
  frequency: number | null
  ctr: number
  cpm: number
  cpa: number | null
  ctrZ: number | null
  score: number
  signals: Signal[]
  flagged: boolean
  override?: 'allow' | 'block'
}

export interface Totals { impressions: number; clicks: number; conversions: number; spend: number; revenue: number; cpa: number | null; roas: number | null; ctr: number; cpm: number }

export interface WhatIf {
  excludedSpend: number
  lostConversions: number
  lostRevenue: number
  /** Conversions per dollar at the clean median, applied to reallocated spend. */
  cleanConvPerDollar: number
  cleanRevPerDollar: number
  projectedConversions: number
  projectedRevenue: number
  before: { cpa: number | null; roas: number | null }
  after: { cpa: number | null; roas: number | null }
}

export interface FreqWaste {
  source: 'distribution' | 'placement' | 'none'
  cap: number
  wastedImpressions: number
  wastedSpend: number
  share: number // of total impressions
  buckets: { frequency: number; users: number; impressions: number; beyond: number }[]
}

export interface Audit {
  placements: Placement[]
  totals: Totals
  flagged: Placement[]
  spendAtRisk: number
  riskShare: number
  medians: { ctr: number; cpm: number; convPerDollar: number }
  whatIf: WhatIf
  freq: FreqWaste
  period: { from: string | null; to: string | null }
  byKind: Record<PlacementKind, { spend: number; count: number; atRisk: number }>
}

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Robust z-scores (Iglewicz and Hoaglin): 0.6745 (x − median) / MAD. Falls back to mean absolute deviation when MAD is 0. */
export function robustZ(xs: number[]): number[] {
  const med = median(xs)
  const dev = xs.map(x => Math.abs(x - med))
  const mad = median(dev)
  if (mad > 0) return xs.map(x => 0.6745 * (x - med) / mad)
  const meanAd = dev.reduce((a, b) => a + b, 0) / (dev.length || 1)
  if (meanAd > 0) return xs.map(x => (x - med) / (1.2533 * meanAd))
  return xs.map(() => 0)
}

const sum = (rows: PlacementRow[], f: (r: PlacementRow) => number) => rows.reduce((a, r) => a + f(r), 0)

/** Impression-weighted average of an optional rate; null when no row has it. */
function weighted(rows: PlacementRow[], f: (r: PlacementRow) => number | undefined): number | null {
  let w = 0, v = 0
  for (const r of rows) { const x = f(r); if (x !== undefined && Number.isFinite(x)) { w += r.impressions || 1; v += x * (r.impressions || 1) } }
  return w ? v / w : null
}

export function aggregate(rows: PlacementRow[]): Map<string, { kind: PlacementKind; rows: PlacementRow[]; raw: Set<string> }> {
  const out = new Map<string, { kind: PlacementKind; rows: PlacementRow[]; raw: Set<string> }>()
  for (const r of rows) {
    const n = normalize(r.placement)
    if (!n.key) continue
    let g = out.get(n.key)
    if (!g) out.set(n.key, g = { kind: n.kind, rows: [], raw: new Set() })
    g.rows.push(r)
    if (g.raw.size < 4) g.raw.add(r.placement.trim())
  }
  return out
}

export function totalsOf(rows: { impressions: number; clicks: number; conversions: number; spend: number; revenue?: number }[]): Totals {
  const t = { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 }
  for (const r of rows) { t.impressions += r.impressions; t.clicks += r.clicks; t.conversions += r.conversions; t.spend += r.spend; t.revenue += r.revenue ?? 0 }
  return { ...t, cpa: t.conversions ? t.spend / t.conversions : null, roas: t.spend && t.revenue ? t.revenue / t.spend : null, ctr: t.impressions ? t.clicks / t.impressions : 0, cpm: t.impressions ? t.spend / t.impressions * 1000 : 0 }
}

/** Spend beyond the effective frequency cap. Uses a frequency distribution when uploaded, else per-placement average frequency. */
export function frequencyWaste(freq: FreqBucket[], placements: Placement[], cap: number, totals: Totals): FreqWaste {
  const cpmAll = totals.impressions ? totals.spend / totals.impressions : 0
  if (freq.length) {
    let impr = 0, beyond = 0
    const buckets = [...freq].sort((a, b) => a.frequency - b.frequency).map(b => {
      const i = b.impressions ?? b.users * b.frequency
      const over = b.frequency > cap ? b.users * (b.frequency - cap) : 0
      // When the bucket is "10+" style, impressions may exceed users×frequency; scale the overage to the bucket's real volume.
      const scaled = b.frequency > cap && b.impressions ? b.impressions * (b.frequency - cap) / b.frequency : over
      impr += i; beyond += scaled
      return { frequency: b.frequency, users: b.users, impressions: i, beyond: scaled }
    })
    const share = impr ? beyond / impr : 0
    return { source: 'distribution', cap, wastedImpressions: beyond, wastedSpend: share * totals.spend, share, buckets }
  }
  let beyond = 0, any = false
  for (const p of placements) {
    if (p.frequency === null || p.frequency <= 0) continue
    any = true
    if (p.frequency > cap) beyond += p.impressions * (1 - cap / p.frequency)
  }
  if (!any) return { source: 'none', cap, wastedImpressions: 0, wastedSpend: 0, share: 0, buckets: [] }
  return { source: 'placement', cap, wastedImpressions: beyond, wastedSpend: beyond * cpmAll, share: totals.impressions ? beyond / totals.impressions : 0, buckets: [] }
}

export function runAudit(ds: Dataset, cfg: Config): Audit {
  const groups = aggregate(ds.rows)
  const known = new Set(ds.knownMfa)
  const base = [...groups].map(([key, g]) => {
    const t = totalsOf(g.rows)
    return {
      key, kind: g.kind, raw: [...g.raw], rows: g.rows,
      impressions: t.impressions, clicks: t.clicks, conversions: t.conversions, spend: t.spend, revenue: t.revenue,
      viewability: weighted(g.rows, r => r.viewability), ivt: weighted(g.rows, r => r.ivt), frequency: weighted(g.rows, r => r.frequency),
      ctr: t.ctr, cpm: t.cpm, cpa: t.cpa,
    }
  })
  const totals = totalsOf(base)
  const eligible = base.filter(p => p.impressions >= cfg.minImpressions)
  const ctrs = eligible.map(p => p.ctr)
  const zs = robustZ(ctrs)
  const zOf = new Map(eligible.map((p, i) => [p.key, zs[i]]))
  const medCtr = median(ctrs)
  const medCpm = median(eligible.filter(p => p.spend > 0).map(p => p.cpm))
  const convRate = totals.impressions ? totals.conversions / totals.impressions : 0

  const placements: Placement[] = base.map(p => {
    const signals: Signal[] = []
    const ov = cfg.overrides[p.key]
    if (known.has(p.key) || [...known].some(k => p.key.endsWith('.' + k))) signals.push({ id: 'known', points: 60, detail: 'Matches your uploaded list' })
    if (p.ivt !== null && p.ivt > cfg.maxIvt) {
      const pts = Math.round(Math.min(30, 15 + 15 * (p.ivt - cfg.maxIvt) / (2 * cfg.maxIvt || 1)))
      signals.push({ id: 'ivt', points: pts, detail: `IVT ${(p.ivt * 100).toFixed(1)}% vs limit ${(cfg.maxIvt * 100).toFixed(0)}%` })
    }
    if (p.viewability !== null && p.viewability < cfg.minViewability && p.impressions >= cfg.minImpressions) {
      const depth = (cfg.minViewability - p.viewability) / (cfg.minViewability / 2 || 1)
      signals.push({ id: 'viewability', points: Math.round(Math.min(25, 12 + 13 * depth)), detail: `Viewability ${(p.viewability * 100).toFixed(0)}% vs floor ${(cfg.minViewability * 100).toFixed(0)}%` })
    }
    const z = zOf.get(p.key) ?? null
    if (z !== null && Math.abs(z) >= 3.5) signals.push({ id: 'ctr', points: 20, detail: `CTR ${(p.ctr * 100).toFixed(2)}% vs median ${(medCtr * 100).toFixed(2)}% (z ${z > 0 ? '+' : ''}${z.toFixed(1)})` })
    const pat = domainPattern(p.key, p.kind)
    if (pat) signals.push({ id: 'pattern', points: 15, detail: pat })
    const expected = p.impressions * convRate
    if (p.conversions === 0 && totals.impressions && p.impressions / totals.impressions >= 0.03 && expected >= 3) {
      signals.push({ id: 'concentration', points: 15, detail: `${((p.impressions / totals.impressions) * 100).toFixed(1)}% of impressions, 0 conversions (about ${expected.toFixed(0)} expected)` })
    }
    if (medCpm > 0 && p.impressions >= cfg.minImpressions && p.cpm > 0 && p.cpm < 0.4 * medCpm) signals.push({ id: 'cpm', points: 10, detail: `CPM $${p.cpm.toFixed(2)} vs median $${medCpm.toFixed(2)}` })
    if (p.frequency !== null && p.frequency > 2 * cfg.freqCap) signals.push({ id: 'frequency', points: 10, detail: `Avg frequency ${p.frequency.toFixed(1)} vs cap ${cfg.freqCap}` })
    if (ov === 'block') signals.push({ id: 'manual', points: 100, detail: 'Marked blocked' })
    const score = Math.min(100, signals.reduce((a, s) => a + s.points, 0))
    const flagged = ov === 'allow' ? false : ov === 'block' ? true : score >= cfg.threshold
    const { rows: _r, ...rest } = p
    return { ...rest, ctrZ: z, score, signals: signals.sort((a, b) => b.points - a.points), flagged, override: ov }
  }).sort((a, b) => b.spend - a.spend)

  const flagged = placements.filter(p => p.flagged)
  const spendAtRisk = flagged.reduce((a, p) => a + p.spend, 0)
  const clean = placements.filter(p => !p.flagged)
  const cleanEligible = clean.filter(p => p.spend > 0 && p.impressions >= cfg.minImpressions)
  const convPerDollar = median(cleanEligible.map(p => p.conversions / p.spend))
  const revPerDollar = median(cleanEligible.map(p => p.revenue / p.spend))
  const whatIf = projectWhatIf(totals, flagged, convPerDollar, revPerDollar)

  const dates = ds.rows.map(r => r.date).filter((d): d is string => !!d).sort()
  const byKind = { web: { spend: 0, count: 0, atRisk: 0 }, app: { spend: 0, count: 0, atRisk: 0 }, ctv: { spend: 0, count: 0, atRisk: 0 } }
  for (const p of placements) { const k = byKind[p.kind]; k.spend += p.spend; k.count++; if (p.flagged) k.atRisk += p.spend }

  return {
    placements, totals, flagged, spendAtRisk, riskShare: totals.spend ? spendAtRisk / totals.spend : 0,
    medians: { ctr: medCtr, cpm: medCpm, convPerDollar },
    whatIf, freq: frequencyWaste(ds.freq, placements, cfg.freqCap, totals),
    period: { from: dates[0] ?? null, to: dates.at(-1) ?? null }, byKind,
  }
}

/**
 * Exclude the flagged set and move its budget to clean inventory. Total spend stays the same; the moved dollars
 * are assumed to convert at the median conversions-per-dollar of clean placements (a median, so one star domain
 * does not inflate the projection).
 */
export function projectWhatIf(t: Totals, flagged: Pick<Placement, 'spend' | 'conversions' | 'revenue'>[], convPerDollar: number, revPerDollar: number): WhatIf {
  const excludedSpend = flagged.reduce((a, p) => a + p.spend, 0)
  const lostConversions = flagged.reduce((a, p) => a + p.conversions, 0)
  const lostRevenue = flagged.reduce((a, p) => a + p.revenue, 0)
  const projectedConversions = t.conversions - lostConversions + excludedSpend * convPerDollar
  const projectedRevenue = t.revenue - lostRevenue + excludedSpend * revPerDollar
  return {
    excludedSpend, lostConversions, lostRevenue, cleanConvPerDollar: convPerDollar, cleanRevPerDollar: revPerDollar,
    projectedConversions, projectedRevenue,
    before: { cpa: t.cpa, roas: t.roas },
    after: { cpa: projectedConversions > 0 ? t.spend / projectedConversions : null, roas: t.spend && projectedRevenue ? projectedRevenue / t.spend : null },
  }
}
