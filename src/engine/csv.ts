import { normalize } from './domain.ts'
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

/** RFC 4180 CSV (quotes, escaped quotes, CRLF, newlines in quotes). Also returns the line each record starts on and the delimiter used.
 * When a quote is still open at the end of the text, `unclosed` is its line; the record it is in is not returned. */
export function parseCsv(text: string): { rows: string[][]; lines: number[]; delim: string; unclosed?: number } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const delim = sniffDelimiter(text)
  const rows: string[][] = []
  const lines: number[] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  let quoteLine = 1
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
    if (c === '"' && field === '') { quoted = true; quoteLine = line }
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
  if (quoted) return { rows, lines, delim, unclosed: quoteLine }
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


/** Rejects what Date.UTC would roll over: month 13, 31 February, 25:00. */
function utc(y: number, mo: number, d: number, h: number, mi: number, se: number, ms = 0): number {
  const day = new Date(Date.UTC(y, mo - 1, d))
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return NaN
  if (h * 60 + mi > 1440 || mi > 59 || se > 60) return NaN
  return Date.UTC(y, mo - 1, d, h, mi, se, ms)
}

/** A slash date is month first unless `dayFirst` is set (see dateOrders). */
export function parseTime(raw: string, dayFirst = false): number {
  const s = raw.trim()
  if (!s) return NaN
  if (/^\d{10}(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000)
  if (/^\d{13}$/.test(s)) return Number(s)
  const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|UTC|[+-]\d{2}:?\d{2})?$/i)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0', frac = '0', tz] = m
    let t = utc(+y, +mo, +d, +h, +mi, +se, Math.round(Number('0.' + frac) * 1000))
    if (tz && !/^(z|utc)$/i.test(tz)) {
      const sign = tz[0] === '-' ? -1 : 1
      const digits = tz.slice(1).replace(':', '')
      t -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60000
    }
    return t
  }
  // From spreadsheets: 10/1/2026 7:00(:00)( AM)
  const u = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i)
  if (u) {
    let h = Number(u[4] ?? 0)
    if (u[7]) h = (h % 12) + (/pm/i.test(u[7]) ? 12 : 0)
    return utc(+u[3], +u[dayFirst ? 2 : 1], +u[dayFirst ? 1 : 2], h, Number(u[5] ?? 0), Number(u[6] ?? 0))
  }
  return NaN
}

export type DateOrder = 'month' | 'day' | 'mixed'

/** The order one slash date proves, or null when it could be either (2/11/2026), is neither, or is not a slash date. */
function provenOrder(raw: string): 'month' | 'day' | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/\d{4}\b/)
  const a = Number(m?.[1]), b = Number(m?.[2])
  return a > 12 && b <= 12 ? 'day' : b > 12 && a <= 12 ? 'month' : null
}

/** The order of each date column: its own dates first, then the rest of the file's, then month first. */
export function dateOrders(fields: FieldSpec[], cells: Map<string, string[]>): Map<string, DateOrder> {
  const days = fields.filter(f => f.type === 'day')
  const own = new Map(days.map(f => {
    const seen = new Set((cells.get(f.key) ?? []).map(provenOrder))
    return [f.key, seen.has('day') ? (seen.has('month') ? 'mixed' : 'day') : seen.has('month') ? 'month' : null] as [string, DateOrder | null]
  }))
  const known = new Set([...own.values()].filter(o => o === 'day' || o === 'month'))
  return new Map(days.map(f => [f.key, own.get(f.key) ?? (known.size === 1 ? [...known][0]! : 'month')]))
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
 * a lone comma is a decimal when `decimalComma` is set (see decimalMarks) or it cannot be a thousands separator.
 */
export function parseNum(raw: string, decimalComma = false): number {
  let s = bareNum(raw)
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  const commas = (s.match(/,/g) ?? []).length
  const euro = lastComma > lastDot && (lastDot >= 0 || (commas === 1 && (decimalComma || !/^,\d{3}\D*$/.test(s.slice(lastComma)) || /^\D*(0|\d{4,}),/.test(s))))
  const dotThousands = decimalComma && lastComma < 0 && /^-?\(?[1-9]\d{0,2}(\.\d{3})+\D*$/.test(s)
  s = euro || dotThousands ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  if (s === '' || s === '--' || s === '-' || /^(null|n\/a|na)$/i.test(s)) return NaN
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1)
  const pct = s.endsWith('%')
  if (pct) s = s.slice(0, -1)
  // Number() also takes "Infinity", "0x10" and "": none of them is a metric.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) || !Number.isFinite(Number(s))) return NaN
  return pct ? Number(s) / 100 : Number(s)
}

/** The cell without spaces, currency signs and currency codes. */
const bareNum = (raw: string) => (raw ?? '').trim().replace(/[\s\u00a0$€£]/g, '').replace(/^[A-Z]{3}(?=[\d.(-])/, '').replace(/(?<=\d)[A-Z]{3}$/, '')

/** Which decimal mark one cell proves: '.', ',' or null when it could be either (1.234) or neither (1234). */
export function provenMark(raw: string): '.' | ',' | null {
  const s = bareNum(raw).replace(/^\((.*)\)$/, '$1').replace(/^[+-]/, '').replace(/%$/, '')
  if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s) || /^\d*\.(\d{1,2}|\d{4,})$/.test(s) || /^(0|\d{4,})\.\d+$/.test(s) || /^\d{1,3}(,\d{2,3})+,\d{3}$/.test(s)) return '.'
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^\d*,(\d{1,2}|\d{4,})$/.test(s) || /^(0|\d{4,}),\d+$/.test(s) || /^\d{1,3}(\.\d{3}){2,}$/.test(s)) return ','
  return null
}
const ambiguous = (raw: string) => /^[+-]?\(?[1-9]\d{0,2}[.,]\d{3}\D*$/.test(bareNum(raw))

/** Counts are whole numbers, so a lone separator before three digits is a thousands separator in either style. */
const COUNTS = new Set(['impressions', 'clicks', 'users'])

/**
 * The decimal mark per number column, decided from the file itself: the column's own unambiguous values first,
 * then the whole file's, then the delimiter (semicolon files are European). Says so when the file contradicts itself.
 */
export function decimalMarks(fields: FieldSpec[], cells: Map<string, string[]>, delim?: string): { comma: Map<string, boolean>; counts: Set<string>; notes: string[] } {
  const one = (xs: ('.' | ',' | null)[]) => {
    const set = new Set(xs.filter(x => x !== null))
    return set.size === 1 ? [...set][0] : set.size ? 'both' as const : null
  }
  const num = fields.filter(f => f.type === 'num' || f.type === 'rate')
  const own = new Map(num.map(f => {
    const xs = cells.get(f.key) ?? []
    const mark = one(xs.map(provenMark))
    // One stray or cut-off "1,2" among thousands such as 1,234 proves nothing about the column.
    const outvoted = (mark === '.' || mark === ',') && xs.filter(x => ambiguous(x) && x.includes(mark)).length > xs.filter(x => provenMark(x) === mark).length
    return [f.key, outvoted ? 'both' as const : mark]
  }))
  // "18.402" impressions also proves the file's style, unless that column itself uses decimals.
  const counts = (k: string) => COUNTS.has(k) && (own.get(k) === null || own.get(k) === 'both')
  const file = one(num.flatMap(f => counts(f.key)
    ? (cells.get(f.key) ?? []).map(c => (ambiguous(c) ? (bareNum(c).includes('.') ? ',' : '.') as ',' | '.' : null))
    : [own.get(f.key) ?? null].flatMap(m => (m === 'both' ? ['.', ','] as const : [m]))))
  const comma = new Map<string, boolean>()
  const notes: string[] = []
  for (const f of num) {
    const mark = own.get(f.key) ?? null
    if (mark === '.' || mark === ',') { comma.set(f.key, mark === ','); continue }
    const chosen = file === '.' || file === ',' ? file === ',' : delim === ';'
    comma.set(f.key, chosen)
    const sample = (cells.get(f.key) ?? []).find(ambiguous)
    if (!sample || counts(f.key)) continue
    const was = `"${sample.trim().slice(0, 20)}" was read as ${parseNum(sample, chosen)}`
    if (mark === 'both' || file === 'both') notes.push(`${f.label}: the file mixes decimal commas and decimal points, so ${was}. Check it`)
    else if (chosen !== (delim === ';')) notes.push(`${f.label}: ${was}, because other numbers in the file use a decimal ${chosen ? 'comma' : 'point'}`)
  }
  return { comma, counts: new Set(num.filter(f => counts(f.key)).map(f => f.key)), notes }
}

/** Rates may arrive as 0.45, 45 or 45%. Anything above 1 is read as a percentage. */
export const asRate = (n: number) => (n > 1 ? n / 100 : n)

/**
 * Whether a rate column without % signs is in percentage points (0.8, 31.5) rather than fractions (0.008, 0.315).
 * An IVT fraction cannot pass 1, so one value above 1 is enough. Viewability can (1.02 from a measurement glitch)
 * but is rarely under 1%, so at least half of its non-zero values must be above 1.
 */
export function isPercentColumn(key: string, values: number[]): boolean {
  const nonZero = values.filter(v => v > 0)
  const above = nonZero.filter(v => v > 1).length
  return above > 0 && (key === 'ivt' || above * 2 >= nonZero.length)
}

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

/** The raw cells of each mapped number column, down to the report footer. */
function columns(fields: FieldSpec[], rows: string[][], map: Mapping, header: number): Map<string, string[]> {
  const out = new Map(fields.map(f => [f.key, [] as string[]]))
  const width = rows[header]?.length ?? 0
  for (const rec of rows.slice(header + 1)) {
    if (isFooter(rec, width)) break
    if (rec.length < width && rec === rows[rows.length - 1]) break // cut off: its last value may be incomplete
    if (rec.slice(width).some(c => c.trim())) continue // shifted: not read below
    for (const f of fields) if (map[f.key] !== undefined) out.get(f.key)!.push(rec[map[f.key]] ?? '')
  }
  return out
}

const TOTAL_WORD = /^(total|totals|grand total|summary)\b/i
/** Wording only a totals row has: "Total", "Total: account", "Totals (25 rows)", "Total - Campaigns", "Total for ...". */
const TOTAL_LABEL = /^((grand )?totals?|summary)\s*($|[:(]|[-\u2013\u2014]\s|\s[-\u2013\u2014]|\s(for|of|all|rows?)\b)/i

/** Grand-total rows repeat the spend of the rows above. A campaign, line or site merely named "Total ..." does not. */
function isTotals(kind: Kind, rec: string[], first: string): boolean {
  const lead = (rec[0] ?? '').trim()
  if (/^((grand )?totals?|summary):?$/i.test(lead)) return true
  // A real domain, app ID or bundle is delivery, whatever its campaign is called.
  if (kind === 'placements' && (/^\S+\.[^\s.]+$/.test(first) || normalize(first).kind !== 'web')) return false
  if (TOTAL_LABEL.test(first) || TOTAL_LABEL.test(lead)) return true
  // Other placement text starting with the word still reads as a totals label.
  if (kind === 'placements') return TOTAL_WORD.test(first) || TOTAL_WORD.test(lead)
  return false
}

export const unclosedMessage = (line: number) => `The quote (") opened on line ${line} never closes, so that row and the rest of the file after it were not read`

/** Turns raw records into typed rows with a line-numbered report of every problem. `header` is the index of the header row. */
export function validate(kind: Kind, csv: { rows: string[][]; lines: number[]; delim?: string; unclosed?: number }, map: Mapping, header = 0): Validated<PlacementRow | FlightLine | FreqBucket> {
  const fields = KINDS[kind].fields
  const issues: Issue[] = []
  const out: Record<string, unknown>[] = []
  let skipped = csv.unclosed ? 1 : 0
  const total = csv.rows.length - header - 1 + skipped
  for (const f of fields) if (f.required && !(f.key in map)) issues.push({ line: csv.lines[header] ?? 1, message: `Required column "${f.label}" is not mapped` })
  if (issues.length) return { rows: [], issues, skipped: total, total }
  if (csv.unclosed) issues.push({ line: csv.unclosed, message: unclosedMessage(csv.unclosed) })
  const cells = columns(fields, csv.rows, map, header)
  const marks = decimalMarks(fields, cells, csv.delim)
  for (const message of marks.notes) issues.push({ line: csv.lines[header] ?? 1, message })
  const orders = dateOrders(fields, cells)
  for (const f of fields) if (orders.get(f.key) === 'mixed') {
    const proof = (o: string) => cells.get(f.key)!.find(c => provenOrder(c) === o)!.trim().slice(0, 20)
    issues.push({ line: csv.lines[header] ?? 1, message: `${f.label}: some dates are day first (${proof('day')}) and some month first (${proof('month')}), so dates that could be either were not read` })
  }
  const points = new Set<string>()
  for (const f of fields) if (f.type === 'rate') {
    const bare = (cells.get(f.key) ?? []).filter(c => !c.includes('%')).map(c => parseNum(c, marks.comma.get(f.key))).filter(n => !Number.isNaN(n))
    if (!isPercentColumn(f.key, bare)) continue
    points.add(f.key)
    const small = bare.find(n => n > 0 && n <= 1)
    if (small !== undefined) issues.push({ line: csv.lines[header] ?? 1, message: `${f.label}: values without a % sign go up to ${bare.reduce((a, b) => Math.max(a, b), 0)}, so the column was read as percentages (${small} is ${small}%)` })
  }
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
    if (isTotals(kind, rec, first.trim())) { skipped++; issues.push({ line, message: 'Totals row skipped' }); continue }
    // DV360 writes its grand total as a row with every dimension blank and only metrics filled.
    if (kind === 'placements' && !first.trim() && (r === csv.rows.length - 1 || isFooter(csv.rows[r + 1], width))) {
      skipped++; issues.push({ line, message: 'Totals row skipped (no placement, metrics only)' }); continue
    }
    // Values past the last header mean an unquoted separator (1,234) shifted the columns: none of them can be trusted.
    if (rec.slice(width).some(c => c.trim())) {
      skipped++; issues.push({ line, message: `Row has ${rec.length} values for ${width} columns, so it was not read. A number such as 1,234 may need quotes` }); continue
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
        const order = orders.get(f.key)
        const t = parseTime(raw, order === 'day' || (order === 'mixed' && provenOrder(raw) === 'day'))
        if (order === 'mixed' && /^\d{1,2}\/\d{1,2}\//.test(raw.trim()) && !provenOrder(raw) && parseTime(raw, true) !== t) {
          issues.push({ line, message: `${f.label} "${raw.slice(0, 40)}" could be day first or month first` }); bad = true
          continue
        }
        if (Number.isNaN(t)) {
          if (f.required || raw.trim()) { issues.push({ line, message: `${f.label} "${raw.slice(0, 40)}" is not a date` }); bad = true }
          continue
        }
        obj[f.key] = dayOf(t)
        continue
      }
      const n = parseNum(raw, marks.counts.has(f.key) && ambiguous(raw) ? bareNum(raw).includes('.') : marks.comma.get(f.key))
      if (Number.isNaN(n)) {
        if (raw.trim() && !/^(--|-|null|n\/a|na)$/i.test(raw.trim())) { issues.push({ line, message: `${f.label} "${raw.slice(0, 40)}" is not a number` }); bad = true }
        else if (f.required) { issues.push({ line, message: `${f.label} is empty` }); bad = true }
        continue
      }
      if (n < 0) { issues.push({ line, message: `${f.label} is negative (${n})` }); bad = true; continue }
      obj[f.key] = f.type !== 'rate' ? n : points.has(f.key) && !raw.includes('%') ? n / 100 : asRate(n)
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
