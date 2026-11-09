import type { Audit, Placement } from './audit.ts'
import { toCsv } from './csv.ts'

export type ListFormat = 'plain' | 'stackadapt' | 'ttd' | 'dv360' | 'gads' | 'reasons'

/** Upload shapes, checked against each platform's help pages in November 2026. */
export const FORMATS: Record<ListFormat, { label: string; ext: string; note: string }> = {
  plain: { label: 'Plain list', ext: 'txt', note: 'One domain or app ID per line. Works anywhere that takes a pasted list.' },
  stackadapt: { label: 'StackAdapt', ext: 'csv', note: 'Single-column CSV with a "domain" header for a Domain/App block list (Inventory, then Lists). Apps use their bundle or store ID.' },
  ttd: { label: 'The Trade Desk', ext: 'txt', note: 'Site list upload: one site or app ID per line, no header. Attach the list to the ad group as a block list.' },
  dv360: { label: 'DV360', ext: 'txt', note: 'Exclusions, Apps and URLs, Upload: one URL per line; apps as their store ID (Android package or iOS numeric ID).' },
  gads: { label: 'Google Ads', ext: 'csv', note: 'Placement exclusion list (Tools, Shared library, Exclusion lists): one placement per line. Apps as mobileapp::1-<iOS id> or mobileapp::2-<package>.' },
  reasons: { label: 'With reasons (CSV)', ext: 'csv', note: 'Every flagged placement with score, spend, and the signals behind it. For the client file and the change log.' },
}

const gadsKey = (p: Pick<Placement, 'key' | 'kind'>) => {
  if (p.kind !== 'app') return p.key
  return /^id\d+$/.test(p.key) ? `mobileapp::1-${p.key.slice(2)}` : `mobileapp::2-${p.key}`
}
const storeId = (p: Pick<Placement, 'key' | 'kind'>) => (p.kind === 'app' && /^id\d+$/.test(p.key) ? p.key.slice(2) : p.key)

export function blocklist(list: Placement[], format: ListFormat, header = ''): string {
  const ps = [...list].sort((a, b) => b.spend - a.spend)
  switch (format) {
    case 'plain': return (header ? header.split('\n').map(l => '# ' + l).join('\n') + '\n' : '') + ps.map(p => p.key).join('\n') + '\n'
    case 'stackadapt': return toCsv([['domain'], ...ps.map(p => [storeId(p)])])
    case 'ttd': return ps.map(p => storeId(p)).join('\n') + '\n'
    case 'dv360': return ps.map(p => storeId(p)).join('\n') + '\n'
    case 'gads': return toCsv([['Placement'], ...ps.map(p => [gadsKey(p)])])
    case 'reasons': return toCsv([
      ['placement', 'type', 'score', 'spend', 'impressions', 'conversions', 'ctr', 'viewability', 'ivt', 'reasons'],
      ...ps.map(p => [p.key, p.kind, p.score, Math.round(p.spend * 100) / 100, p.impressions, p.conversions, Math.round(p.ctr * 1e5) / 1e5, p.viewability === null ? '' : Math.round(p.viewability * 1000) / 1000, p.ivt === null ? '' : Math.round(p.ivt * 1000) / 1000, p.signals.map(s => s.detail).join('; ')]),
    ])
  }
}

/** Clean placements that earned their spend: unflagged, score under 20, with conversions (or top-half CTR when nothing converts). */
export function allowlist(a: Audit, minSpend = 0): Placement[] {
  const anyConv = a.totals.conversions > 0
  return a.placements.filter(p => !p.flagged && p.score < 20 && p.spend >= minSpend && (anyConv ? p.conversions > 0 : p.ctr >= a.medians.ctr))
}

export interface Snapshot {
  id: string
  label: string
  at: number
  period: { from: string | null; to: string | null }
  spend: number
  impressions: number
  conversions: number
  revenue: number
  cpa: number | null
  roas: number | null
  placements: number
  flaggedCount: number
  spendAtRisk: number
  riskShare: number
  freqWaste: number
  projectedCpa: number | null
  /** Flagged placements at the time (key, spend, score), top 300 by spend. */
  flagged: [string, number, number][]
  /** Spend by placement for the top 500, to check whether excluded placements still received money. */
  spendBy: Record<string, number>
}

export function snapshotOf(a: Audit, id: string, label: string, at = Date.now()): Snapshot {
  const spendBy: Record<string, number> = {}
  for (const p of a.placements.slice(0, 500)) spendBy[p.key] = Math.round(p.spend * 100) / 100
  return {
    id, label, at, period: a.period,
    spend: a.totals.spend, impressions: a.totals.impressions, conversions: a.totals.conversions, revenue: a.totals.revenue,
    cpa: a.totals.cpa, roas: a.totals.roas, placements: a.placements.length,
    flaggedCount: a.flagged.length, spendAtRisk: a.spendAtRisk, riskShare: a.riskShare, freqWaste: a.freq.wastedSpend,
    projectedCpa: a.whatIf.after.cpa,
    flagged: a.flagged.slice(0, 300).map(p => [p.key, Math.round(p.spend * 100) / 100, p.score]),
    spendBy,
  }
}

export interface Compare {
  a: Snapshot
  b: Snapshot
  riskShareDelta: number
  spendAtRiskDelta: number
  cpaDelta: number | null
  freqWasteDelta: number
  /** Flagged in A, gone or no longer flagged in B. */
  resolved: string[]
  /** Newly flagged in B. */
  added: [string, number, number][]
  /** Flagged in A and still taking spend in B: the exclusion did not land. */
  leaking: [string, number][]
}

export function compare(a: Snapshot, b: Snapshot): Compare {
  const flaggedB = new Set(b.flagged.map(f => f[0]))
  const flaggedA = new Set(a.flagged.map(f => f[0]))
  return {
    a, b,
    riskShareDelta: b.riskShare - a.riskShare,
    spendAtRiskDelta: b.spendAtRisk - a.spendAtRisk,
    cpaDelta: a.cpa !== null && b.cpa !== null ? b.cpa - a.cpa : null,
    freqWasteDelta: b.freqWaste - a.freqWaste,
    resolved: a.flagged.filter(f => !flaggedB.has(f[0])).map(f => f[0]),
    added: b.flagged.filter(f => !flaggedA.has(f[0])),
    leaking: a.flagged.filter(f => (b.spendBy[f[0]] ?? 0) > 0).map(f => [f[0], b.spendBy[f[0]]] as [string, number]).sort((x, y) => y[1] - x[1]),
  }
}
