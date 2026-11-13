import type { FlightLine, FreqBucket, PlacementRow } from './types.ts'


/**
 * File bytes to text. Google Ads "Excel .csv" downloads are UTF-16LE with a BOM (and tab-separated);
 * plain .csv and .tsv are UTF-8. Without a BOM, a NUL in every other byte also means UTF-16LE.
 */
export function decodeBytes(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2))
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2))
  if (b.length >= 4 && b[1] === 0 && b[3] === 0 && b[0] !== 0) return new TextDecoder('utf-16le').decode(b)
  return new TextDecoder('utf-8').decode(b)
}

/** RFC 4180 CSV (quotes, escaped quotes, CRLF, newlines in quotes). Also returns the line each record starts on and the delimiter used. */
export function parseCsv(text: string): { rows: string[][]; lines: number[]; delim: string } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const delim = sniffDelimiter(text)
  const rows: string[][] = []
  const lines: number[] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else {
        if (c === '\n') line++
        field += c
      }
      continue
    }
    if (c === '"' && field === '') quoted = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') { rows.push(row); lines.push(rowLine) }
      row = []
      line++
      rowLine = line
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') { rows.push(row); lines.push(rowLine) }
  }
  return { rows, lines, delim }
}

/**
 * Picks the delimiter from the busiest of the first 10 lines, so title rows above the header
 * (Google Ads: "Where ads showed report", then a quoted date range) do not decide it. Quoted text is ignored.
 */
export function sniffDelimiter(text: string): string {
  const lines = text.slice(0, 20000).split(/\r?\n/, 10).map(l => l.replace(/"[^"]*"/g, ''))
  let best = ',', bestN = 0
  for (const d of [',', '\t', ';', '|']) {
    const n = Math.max(0, ...lines.map(l => l.split(d).length - 1))
    if (n > bestN) { best = d; bestN = n }
  }
  return best
}


export function parseTime(raw: string): number {
  const s = raw.trim()
  if (!s) return NaN
  if (/^\d{10}(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000)
  if (/^\d{13}$/.test(s)) return Number(s)
  const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|UTC|[+-]\d{2}:?\d{2})?$/i)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0', frac = '0', tz] = m
    let t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se, Math.round(Number('0.' + frac) * 1000))
    if (tz && !/^(z|utc)$/i.test(tz)) {
      const sign = tz[0] === '-' ? -1 : 1
      const digits = tz.slice(1).replace(':', '')
      t -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60000
    }
    return t
  }
  // US style from spreadsheets: 10/1/2026 7:00(:00)( AM)
  const u = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i)
  if (u) {
    let h = Number(u[4] ?? 0)
    if (u[7]) h = (h % 12) + (/pm/i.test(u[7]) ? 12 : 0)
    return Date.UTC(+u[3], +u[1] - 1, +u[2], h, Number(u[5] ?? 0), Number(u[6] ?? 0))
  }
  return NaN
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(v => {
    const s = typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : v
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n') + '\n'
}

export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * Numbers as DSP exports write them: 1,234.50 / $12 / "--" / 45.2% / (12.00).
 * European exports (1.234,50 or 12,5) are read too: when both separators appear the last one is the decimal;
 * a lone comma is a decimal when `decimalComma` is set (semicolon-delimited files) or it is not followed by exactly 3 digits.
 */
export function parseNum(raw: string, decimalComma = false): number {
  let s = (raw ?? '').trim().replace(/[\s\u00a0$€£]/g, '').replace(/^[A-Z]{3}(?=[\d.(-])/, '').replace(/(?<=\d)[A-Z]{3}$/, '')
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  const commas = (s.match(/,/g) ?? []).length
  const euro = lastComma > lastDot && (lastDot >= 0 || (commas === 1 && (decimalComma || !/^,\d{3}\D*$/.test(s.slice(lastComma)))))
  const dotThousands = decimalComma && lastComma < 0 && /^-?\(?\d{1,3}(\.\d{3})+\D*$/.test(s)
  s = euro || dotThousands ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  if (s === '' || s === '--' || s === '-' || /^(null|n\/a|na)$/i.test(s)) return NaN
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1)
  if (s.endsWith('%')) return Number(s.slice(0, -1)) / 100
  return Number(s)
}

/** Rates may arrive as 0.45, 45 or 45%. Anything above 1 is read as a percentage. */
export const asRate = (n: number) => (n > 1 ? n / 100 : n)

export type Kind = 'placements' | 'flight' | 'freq'
export type Source = 'stackadapt' | 'ttd' | 'dv360' | 'gads' | 'generic'
type FieldType = 'day' | 'num' | 'rate' | 'str'
export interface FieldSpec { key: string; label: string; required?: boolean; type: FieldType; aliases: string[] }

export const KINDS: Record<Kind, { title: string; blurb: string; fields: FieldSpec[] }> = {
  placements: {
    title: 'Placement report',
    blurb: 'Domain, app or placement performance',
    fields: [
      { key: 'placement', label: 'Domain / app / placement', required: true, type: 'str', aliases: ['domain', 'site', 'app_url', 'app/url', 'placement_url', 'placement', 'site_domain', 'site/app', 'app/site', 'inventory', 'url', 'app', 'bundle', 'app_bundle', 'publisher_domain', 'site_name', 'where_ads_showed'] },
      { key: 'impressions', label: 'Impressions', required: true, type: 'num', aliases: ['impressions', 'impr.', 'impr', 'imps', 'billable_impressions', 'won_impressions'] },
      { key: 'spend', label: 'Spend', required: true, type: 'num', aliases: ['spend', 'cost', 'total_cost', 'media_cost', 'advertiser_cost_(usd)', 'advertiser_cost_(adv_currency)', 'advertiser_cost', 'partner_cost_(adv_currency)', 'media_cost_(adv_currency)', 'partner_cost_(usd)', 'total_media_cost_(advertiser_currency)', 'media_cost_(advertiser_currency)', 'revenue_(adv_currency)', 'cost_(usd)', 'spend_(usd)', 'amount_spent'] },
      { key: 'clicks', label: 'Clicks', type: 'num', aliases: ['clicks', 'click', 'total_clicks'] },
      { key: 'conversions', label: 'Conversions', type: 'num', aliases: ['conversions', 'conv.', 'total_conversions', 'all_last_click_+_view_conversions', 'total_click_+_view_conversions', 'conversion', 'purchases', 'post-click_conversions', 'actions'] },
      { key: 'revenue', label: 'Conversion value', type: 'num', aliases: ['conv._value', 'conversion_value', 'revenue', 'conversion_revenue', 'total_conversion_value'] },
      { key: 'viewability', label: 'Viewability rate', type: 'rate', aliases: ['viewability', 'viewability_rate', 'active_view:_%_viewable_impressions', 'viewable_rate', '%_viewable', 'viewable_%', 'in-view_rate', 'measured_viewability'] },
      { key: 'ivt', label: 'IVT rate', type: 'rate', aliases: ['ivt', 'ivt_rate', 'ivt_%', 'invalid_traffic', 'invalid_traffic_rate', 'givt_+_sivt_rate', 'fraud_rate', 'sivt_rate'] },
      { key: 'frequency', label: 'Avg frequency', type: 'num', aliases: ['frequency', 'avg._frequency', 'average_frequency', 'avg_frequency', 'avg._impr._freq._per_user'] },
      { key: 'date', label: 'Date', type: 'day', aliases: ['date', 'day', 'report_date'] },
      { key: 'campaign', label: 'Campaign', type: 'str', aliases: ['campaign', 'campaign_name', 'campaign_group', 'insertion_order'] },
      { key: 'line', label: 'Line item / ad group', type: 'str', aliases: ['line_item', 'line_item_name', 'ad_group', 'ad_group_name', 'adgroup', 'ad_set'] },
    ],
  },
  flight: {
    title: 'Flight plan',
    blurb: 'Budget and dates per line item, for pacing',
    fields: [
      { key: 'line', label: 'Line item / campaign', required: true, type: 'str', aliases: ['line_item', 'line', 'campaign', 'ad_group', 'name', 'line_item_name'] },
      { key: 'budget', label: 'Budget', required: true, type: 'num', aliases: ['budget', 'total_budget', 'flight_budget', 'lifetime_budget'] },
      { key: 'start', label: 'Start date', required: true, type: 'day', aliases: ['start', 'start_date', 'flight_start', 'begin'] },
      { key: 'end', label: 'End date', required: true, type: 'day', aliases: ['end', 'end_date', 'flight_end', 'finish'] },
    ],
  },
  freq: {
    title: 'Frequency distribution',
    blurb: 'Users by number of exposures',
    fields: [
      { key: 'frequency', label: 'Frequency (exposures)', required: true, type: 'num', aliases: ['frequency', 'exposures', 'impressions_per_user', 'frequency_bucket', 'freq'] },
      { key: 'users', label: 'Users / households', required: true, type: 'num', aliases: ['users', 'unique_users', 'uniques', 'households', 'reach', 'unique_households', 'people'] },
      { key: 'impressions', label: 'Impressions', type: 'num', aliases: ['impressions', 'impr.', 'imps'] },
      { key: 'conversions', label: 'Conversions', type: 'num', aliases: ['conversions', 'conv.'] },
    ],
  },
}

export const SOURCES: Record<Source, string> = {
  stackadapt: 'StackAdapt domain report',
  ttd: 'The Trade Desk site list report',
  dv360: 'DV360 placement report',
  gads: 'Google Ads placement report',
  generic: 'Generic CSV',
}

export const normHeader = (h: string) => h.trim().toLowerCase().replace(/^"|"$/g, '').replace(/\s+/g, '_')

export type Mapping = Record<string, number>

export function autoMap(kind: Kind, headers: string[]): Mapping {
  const hs = headers.map(normHeader)
  const map: Mapping = {}
  const used = new Set<number>()
  for (const f of KINDS[kind].fields) {
    for (const a of f.aliases) {
      const i = hs.findIndex((h, j) => !used.has(j) && h === a)
      if (i >= 0) { map[f.key] = i; used.add(i); break }
    }
  }
  return map
}

/** Header signatures of each DSP export. */
export function detectSource(headers: string[]): Source {
  const hs = new Set(headers.map(normHeader))
  if (hs.has('app/url') || hs.has('active_view:_%_viewable_impressions') || hs.has('insertion_order') || hs.has('revenue_(adv_currency)')) return 'dv360'
  if (hs.has('advertiser_cost_(usd)') || hs.has('partner_cost_(usd)') || hs.has('advertiser_cost_(adv_currency)') || hs.has('partner_cost_(adv_currency)') || hs.has('all_last_click_+_view_conversions') || (hs.has('site') && hs.has('ad_group'))) return 'ttd'
  if (hs.has('impr.') || hs.has('conv.') || hs.has('placement_url') || hs.has('where_ads_showed')) return 'gads'
  if (hs.has('campaign_group') || (hs.has('domain') && (hs.has('ecpm') || hs.has('cost')) && !hs.has('site'))) return 'stackadapt'
  return 'generic'
}

/**
 * Finds the header row. Google Ads and DV360 put a title and a date range above the header,
 * so take the first of the top 10 rows that maps the required columns of some kind.
 */
export function findHeader(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) if (detectKind(rows[i])) return i
  return 0
}

export function detectKind(headers: string[]): Kind | null {
  let best: Kind | null = null
  let bestScore = 0
  for (const kind of Object.keys(KINDS) as Kind[]) {
    const map = autoMap(kind, headers)
    if (!KINDS[kind].fields.every(f => !f.required || f.key in map)) continue
    const score = Object.keys(map).length + (kind === 'placements' ? 0.5 : 0)
    if (score > bestScore) { best = kind; bestScore = score }
  }
  return best
}

export interface Issue { line: number; message: string }
export interface Validated<T> { rows: T[]; issues: Issue[]; skipped: number; total: number }

const isFooter = (rec: string[], width: number) => {
  const filled = rec.filter(c => c.trim()).length
  return /^[\w ./()-]{2,40}:$/.test((rec[0] ?? '').trim()) && filled <= 2 && filled < width
}

const TOTAL_ROW = /^(total|totals|grand total|summary)\b/i

/** Turns raw records into typed rows with a line-numbered report of every problem. `header` is the index of the header row. */
export function validate(kind: Kind, csv: { rows: string[][]; lines: number[]; delim?: string }, map: Mapping, header = 0): Validated<PlacementRow | FlightLine | FreqBucket> {
  const fields = KINDS[kind].fields
  const issues: Issue[] = []
  const out: Record<string, unknown>[] = []
  let skipped = 0
  const total = csv.rows.length - header - 1
  for (const f of fields) if (f.required && !(f.key in map)) issues.push({ line: csv.lines[header] ?? 1, message: `Required column "${f.label}" is not mapped` })
  if (issues.length) return { rows: [], issues, skipped: total, total }
  const decimalComma = csv.delim === ';'
  const width = csv.rows[header]?.length ?? 0
  for (let r = header + 1; r < csv.rows.length; r++) {
    const rec = csv.rows[r]
    const line = csv.lines[r]
    if (rec.every(c => !c.trim())) continue
    // DV360 and Campaign Manager append a footer after the data: "Report Time:", "Date Range:", "Group By:", filters.
    if (isFooter(rec, width)) {
      issues.push({ line, message: `Report footer from here on ignored (${csv.rows.length - r} lines)` })
      break
    }
    const first = rec[map[fields[0].key]] ?? ''
    if (TOTAL_ROW.test(first.trim()) || TOTAL_ROW.test((rec[0] ?? '').trim())) { skipped++; issues.push({ line, message: 'Totals row skipped' }); continue }
    // DV360 writes its grand total as a row with every dimension blank and only metrics filled.
    if (kind === 'placements' && !first.trim() && (r === csv.rows.length - 1 || isFooter(csv.rows[r + 1], width))) {
      skipped++; issues.push({ line, message: 'Totals row skipped (no placement, metrics only)' }); continue
    }
    const obj: Record<string, unknown> = {}
    let bad = false
    for (const f of fields) {
      const idx = map[f.key]
      if (idx === undefined) continue
      const raw = rec[idx] ?? ''
      if (f.type === 'str') {
        const v = raw.trim()
        if (f.required && !v) { issues.push({ line, message: `${f.label} is empty` }); bad = true }
        else if (v) obj[f.key] = v
        continue
      }
      if (f.type === 'day') {
        const t = parseTime(raw)
        if (Number.isNaN(t)) {
          if (f.required || raw.trim()) { issues.push({ line, message: `${f.label} "${raw.slice(0, 40)}" is not a date` }); bad = true }
          continue
        }
        obj[f.key] = dayOf(t)
        continue
      }
      const n = parseNum(raw, decimalComma)
      if (Number.isNaN(n)) {
        if (raw.trim() && !/^(--|-|null|n\/a|na)$/i.test(raw.trim())) { issues.push({ line, message: `${f.label} "${raw.slice(0, 40)}" is not a number` }); bad = true }
        else if (f.required) { issues.push({ line, message: `${f.label} is empty` }); bad = true }
        continue
      }
      if (n < 0) { issues.push({ line, message: `${f.label} is negative (${n})` }); bad = true; continue }
      obj[f.key] = f.type === 'rate' ? asRate(n) : n
    }
    if (bad) { skipped++; continue }
    if (kind === 'placements') { obj.clicks ??= 0; obj.conversions ??= 0 }
    if (kind === 'flight' && String(obj.end) < String(obj.start)) { issues.push({ line, message: 'End date is before start date' }); skipped++; continue }
    if (kind === 'placements' && Number(obj.clicks) > Number(obj.impressions) && Number(obj.impressions) > 0) issues.push({ line, message: 'More clicks than impressions (kept; worth checking)' })
    out.push(obj)
  }
  return { rows: out as never, issues, skipped, total }
}

/** Known-MFA / block list upload: one entry per line, or a CSV whose first column holds the domains. Comments (#) ignored. */
export function parseList(text: string): string[] {
  const out: string[] = []
  for (const l of text.split(/\r?\n/)) {
    const v = l.split(/[,\t;]/)[0].trim().replace(/^"|"$/g, '')
    if (!v || v.startsWith('#') || /^(domain|site|url|placement|app)s?$/i.test(v)) continue
    out.push(v)
  }
  return out
}
