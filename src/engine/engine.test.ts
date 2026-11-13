import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domainPattern, normalize } from './domain.ts'
import { frequencyWaste, median, projectWhatIf, robustZ, runAudit, totalsOf } from './audit.ts'
import { readFileSync } from 'node:fs'
import { autoMap, decodeBytes, detectKind, detectSource, findHeader, parseCsv, parseList, parseNum, sniffDelimiter, validate } from './csv.ts'
import { allowlist, blocklist, compare, snapshotOf } from './exports.ts'
import { pacing } from './pacing.ts'
import { generate, SAMPLES, sampleConfig, sampleHistory } from './sample.ts'
import { DEFAULT_CONFIG, type Dataset, type PlacementRow } from './types.ts'

const ds = (rows: PlacementRow[], extra: Partial<Dataset> = {}): Dataset => ({ rows, flight: [], freq: [], knownMfa: [], ...extra })
const row = (placement: string, impressions: number, spend: number, clicks = 0, conversions = 0, extra: Partial<PlacementRow> = {}): PlacementRow => ({ placement, impressions, spend, clicks, conversions, ...extra })

test('normalize: URLs and subdomains collapse to the registrable domain', () => {
  assert.equal(normalize('https://www.News.Example.com/path?q=1').key, 'example.com')
  assert.equal(normalize('m.example.co.uk').key, 'example.co.uk')
  assert.equal(normalize('blog.shop.example.com.au:443').key, 'example.com.au')
  assert.equal(normalize('example.com.').key, 'example.com')
})

test('normalize: app bundles, store ids and Google Ads app placements', () => {
  assert.deepEqual(normalize('com.example.puzzle'), { key: 'com.example.puzzle', kind: 'app', store: 'android' })
  assert.deepEqual(normalize('mobileapp::1-1234567890'), { key: 'id1234567890', kind: 'app', store: 'ios' })
  assert.equal(normalize('mobileapp::2-com.example.app').key, 'com.example.app')
  assert.equal(normalize('1234567890').key, 'id1234567890')
  assert.equal(normalize('https://play.google.com/store/apps/details?id=com.example.game&hl=en').key, 'com.example.game')
  assert.equal(normalize('roku:418822').kind, 'ctv')
  // A real domain that happens to start with com. is still a domain when it ends in a web TLD.
  assert.equal(normalize('com.example.com').kind, 'web')
})

test('domain patterns: slideshow, hyphen-heavy and random names; apps never judged', () => {
  assert.ok(domainPattern('top-10-celeb-photos-daily.example', 'web'))
  assert.ok(domainPattern('xkqzv7381-news.example', 'web'))
  assert.ok(domainPattern('brtnmlx.example', 'web'))
  assert.equal(domainPattern('devweekly.example', 'web'), null)
  assert.equal(domainPattern('nytimes.com', 'web'), null)
  assert.equal(domainPattern('com.example.flashlightultra', 'app'), null)
})

test('robust z-score uses median and MAD, resistant to the outlier itself', () => {
  const z = robustZ([1, 1.1, 0.9, 1.05, 0.95, 10])
  assert.ok(z[5] > 3.5)
  assert.ok(Math.abs(z[0]) < 1)
  assert.deepEqual(robustZ([2, 2, 2]), [0, 0, 0])
  assert.equal(median([3, 1, 2, 10]), 2.5)
})

test('parseNum handles currency, thousands, percents, dashes and accounting negatives', () => {
  assert.equal(parseNum('$1,234.50'), 1234.5)
  assert.equal(parseNum('45.2%'), 0.452)
  assert.ok(Number.isNaN(parseNum('--')))
  assert.equal(parseNum('(12.00)'), -12)
  assert.equal(parseNum('USD12.5'), 12.5)
})

test('format detection: each DSP export maps to its source and the placement kind', () => {
  const ttd = ['Date', 'Campaign', 'Ad Group', 'Site', 'Impressions', 'Clicks', 'Advertiser Cost (USD)', 'All Last Click + View Conversions']
  const dv = ['Date', 'Insertion Order', 'Line Item', 'App/URL', 'Impressions', 'Clicks', 'Total Conversions', 'Revenue (Adv Currency)', 'Active View: % Viewable Impressions']
  const ga = ['Placement', 'Placement URL', 'Type', 'Campaign', 'Ad group', 'Impr.', 'Clicks', 'Cost', 'Conversions', 'Conv. value']
  const sa = ['Date', 'Campaign Group', 'Campaign', 'Domain', 'Impressions', 'Clicks', 'Conversions', 'Cost', 'eCPM']
  assert.equal(detectSource(ttd), 'ttd')
  assert.equal(detectSource(dv), 'dv360')
  assert.equal(detectSource(ga), 'gads')
  assert.equal(detectSource(sa), 'stackadapt')
  assert.equal(detectSource(['domain', 'impressions', 'spend']), 'generic')
  for (const h of [ttd, dv, ga, sa]) assert.equal(detectKind(h), 'placements')
  const m = autoMap('placements', dv)
  assert.equal(m.placement, 3)
  assert.equal(m.spend, 7)
  assert.equal(m.viewability, 8)
  assert.equal(detectKind(['Line Item', 'Budget', 'Start Date', 'End Date']), 'flight')
  assert.equal(detectKind(['Frequency', 'Unique Users', 'Impressions']), 'freq')
})

test('header row is found below Google Ads title rows; totals rows are skipped with line numbers', () => {
  const text = 'Placement report\n"November 1, 2026 - November 7, 2026"\nPlacement,Impr.,Clicks,Cost,Conversions\nexample.com,"1,000",5,$4.00,1\nbad.example,abc,1,2,0\nTotal: account,"1,000",5,4.00,1\n'
  const csv = parseCsv(text)
  const h = findHeader(csv.rows)
  assert.equal(h, 2)
  const v = validate('placements', csv, autoMap('placements', csv.rows[h]), h)
  assert.equal(v.rows.length, 1)
  assert.equal((v.rows[0] as PlacementRow).impressions, 1000)
  assert.deepEqual(v.issues.map(i => i.line), [5, 6])
  assert.match(v.issues[0].message, /Impressions "abc" is not a number/)
})

test('validation: rates as 45 or 45% become 0.45; missing required mapping is reported', () => {
  const csv = parseCsv('domain,impressions,spend,viewability,ivt\na.example,100,1,45,2.5%\n')
  const v = validate('placements', csv, autoMap('placements', csv.rows[0]))
  const r = v.rows[0] as PlacementRow
  assert.equal(r.viewability, 0.45)
  assert.equal(r.ivt, 0.025)
  assert.equal(r.clicks, 0)
  const miss = validate('placements', csv, { placement: 0 })
  assert.equal(miss.rows.length, 0)
  assert.ok(miss.issues.some(i => /Impressions/.test(i.message)))
})

test('flight plan validation rejects end before start', () => {
  const csv = parseCsv('line item,budget,start date,end date\nA,"10,000",2026-11-01,2026-11-30\nB,500,2026-11-30,2026-11-01\n')
  const v = validate('flight', csv, autoMap('flight', csv.rows[0]))
  assert.equal(v.rows.length, 1)
  assert.equal(v.skipped, 1)
})

test('audit groups raw labels by normalized key and sums metrics', () => {
  const a = runAudit(ds([row('www.a.example', 1000, 5, 2, 1), row('https://a.example/x', 1000, 5, 2, 1), row('b.example', 500, 3)]), DEFAULT_CONFIG)
  const p = a.placements.find(x => x.key === 'a.example')!
  assert.equal(p.impressions, 2000)
  assert.equal(p.spend, 10)
  assert.equal(p.raw.length, 2)
  assert.equal(a.totals.spend, 13)
})

test('high IVT plus low viewability flags a placement; one weak signal does not', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(`good${i}.example`, 10000, 100, 20, 5, { viewability: 0.7, ivt: 0.01 }))
  rows.push(row('bad.example', 10000, 100, 20, 0, { viewability: 0.3, ivt: 0.25 }))
  rows.push(row('gray.example', 10000, 100, 20, 5, { viewability: 0.45, ivt: 0.01 }))
  const a = runAudit(ds(rows), DEFAULT_CONFIG)
  const bad = a.placements.find(p => p.key === 'bad.example')!
  const gray = a.placements.find(p => p.key === 'gray.example')!
  assert.ok(bad.flagged)
  assert.ok(bad.signals.some(s => s.id === 'ivt') && bad.signals.some(s => s.id === 'viewability'))
  assert.ok(!gray.flagged)
  assert.ok(gray.score > 0 && gray.score < 40)
  assert.equal(a.spendAtRisk, 100)
})

test('CTR outlier and low CPM signals fire against campaign medians', () => {
  const rows = Array.from({ length: 15 }, (_, i) => row(`site${i}.example`, 10000, 100 + i, 20 + (i % 3), 2))
  rows.push(row('clicky.example', 10000, 30, 400, 0))
  const a = runAudit(ds(rows), DEFAULT_CONFIG)
  const c = a.placements.find(p => p.key === 'clicky.example')!
  assert.ok(c.signals.some(s => s.id === 'ctr'))
  assert.ok(c.signals.some(s => s.id === 'cpm'))
  assert.ok(c.ctrZ! > 3.5)
})

test('small placements are not judged on statistical signals', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(`site${i}.example`, 10000, 100, 20, 2))
  rows.push(row('tiny.example', 50, 0.1, 10, 0, { viewability: 0.1 }))
  const t = runAudit(ds(rows), DEFAULT_CONFIG).placements.find(p => p.key === 'tiny.example')!
  assert.equal(t.signals.length, 0)
})

test('impression concentration with zero conversions is flagged as a signal', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(`site${i}.example`, 10000, 100, 20, 10))
  rows.push(row('sink.example', 30000, 300, 60, 0))
  const s = runAudit(ds(rows), DEFAULT_CONFIG).placements.find(p => p.key === 'sink.example')!
  assert.ok(s.signals.some(x => x.id === 'concentration'))
})

test('known-MFA list matches the domain and its subdomains; overrides win', () => {
  const rows = [row('news.junk.example', 5000, 10), row('fine.example', 5000, 10), row('other.example', 5000, 10)]
  const a = runAudit(ds(rows, { knownMfa: ['junk.example'] }), DEFAULT_CONFIG)
  assert.ok(a.placements.find(p => p.key === 'junk.example')!.flagged)
  const b = runAudit(ds(rows, { knownMfa: ['junk.example'] }), { ...DEFAULT_CONFIG, overrides: { 'junk.example': 'allow', 'fine.example': 'block' } })
  assert.ok(!b.placements.find(p => p.key === 'junk.example')!.flagged)
  assert.ok(b.placements.find(p => p.key === 'fine.example')!.flagged)
})

test('what-if: reallocated spend converts at the clean median and CPA falls', () => {
  const t = totalsOf([{ impressions: 0, clicks: 0, conversions: 100, spend: 10000 }])
  const w = projectWhatIf(t, [{ spend: 2000, conversions: 2, revenue: 0 }], 0.012, 0)
  assert.equal(w.excludedSpend, 2000)
  assert.equal(w.projectedConversions, 100 - 2 + 24)
  assert.equal(w.before.cpa, 100)
  assert.ok(Math.abs(w.after.cpa! - 10000 / 122) < 1e-9)
})

test('frequency waste from a distribution counts exposures beyond the cap', () => {
  const t = totalsOf([{ impressions: 1000, clicks: 0, conversions: 0, spend: 100 }])
  const f = frequencyWaste([{ frequency: 2, users: 100 }, { frequency: 10, users: 80 }], [], 6, t)
  assert.equal(f.source, 'distribution')
  assert.equal(f.wastedImpressions, 320)
  assert.ok(Math.abs(f.share - 320 / 1000) < 1e-9)
  assert.ok(Math.abs(f.wastedSpend - 32) < 1e-9)
})

test('frequency waste falls back to per-placement average frequency', () => {
  const a = runAudit(ds([row('a.example', 1000, 10, 0, 0, { frequency: 12 }), row('b.example', 1000, 10, 0, 0, { frequency: 3 })]), { ...DEFAULT_CONFIG, freqCap: 6 })
  assert.equal(a.freq.source, 'placement')
  assert.equal(a.freq.wastedImpressions, 500)
  assert.equal(a.freq.wastedSpend, 5)
})

test('pacing: expected vs actual, status and the daily budget needed to land', () => {
  const rows: PlacementRow[] = []
  for (let d = 1; d <= 10; d++) rows.push({ ...row('a.example', 100, 50), date: `2026-11-${String(d).padStart(2, '0')}`, line: 'L1' })
  const [p] = pacing([{ line: 'L1', budget: 3000, start: '2026-11-01', end: '2026-11-30' }], rows)
  assert.equal(p.elapsed, 10)
  assert.equal(p.spent, 500)
  assert.equal(p.expected, 1000)
  assert.equal(p.status, 'under')
  assert.equal(p.neededDaily, 2500 / 20)
  assert.equal(p.currentDaily, 50)
  assert.equal(p.series.length, 30)
  assert.ok(Number.isNaN(p.series[20].actual))
})

test('pacing matches by campaign when there is no line item, and flags over-pacing', () => {
  const rows = [1, 2].map(d => ({ ...row('a.example', 100, 300), date: `2026-11-0${d}`, campaign: 'Camp' }))
  const [p] = pacing([{ line: 'camp', budget: 3000, start: '2026-11-01', end: '2026-11-30' }], rows)
  assert.equal(p.status, 'over')
})

test('blocklists: DSP shapes for web and app placements', () => {
  const a = runAudit(ds([row('junk.example', 5000, 20), row('com.example.flash', 5000, 10), row('id1900000966', 5000, 5)], { knownMfa: ['junk.example', 'com.example.flash', 'id1900000966'] }), DEFAULT_CONFIG)
  assert.equal(blocklist(a.flagged, 'gads'), 'Placement\njunk.example\nmobileapp::2-com.example.flash\nmobileapp::1-1900000966\n')
  assert.equal(blocklist(a.flagged, 'ttd'), 'junk.example\ncom.example.flash\n1900000966\n')
  assert.ok(blocklist(a.flagged, 'stackadapt').startsWith('domain\n'))
  assert.ok(blocklist(a.flagged, 'plain', 'Audit 1').startsWith('# Audit 1\njunk.example'))
  assert.match(blocklist(a.flagged, 'reasons'), /Matches your uploaded list/)
})

test('allowlist keeps clean converting placements only', () => {
  const rows = Array.from({ length: 8 }, (_, i) => row(`s${i}.example`, 10000, 100, 20, i % 2))
  rows.push(row('bad.example', 10000, 100, 20, 3, { ivt: 0.4, viewability: 0.2 }))
  const al = allowlist(runAudit(ds(rows), DEFAULT_CONFIG))
  assert.equal(al.length, 4)
  assert.ok(!al.some(p => p.key === 'bad.example'))
})

test('compare: resolved, newly flagged and leaking exclusions', () => {
  const cfg = DEFAULT_CONFIG
  const a = snapshotOf(runAudit(ds([row('x.example', 1000, 50), row('y.example', 1000, 50), row('ok.example', 1000, 50, 0, 1)], { knownMfa: ['x.example', 'y.example'] }), cfg), 'a', 'A')
  const b = snapshotOf(runAudit(ds([row('y.example', 1000, 20), row('z.example', 1000, 10), row('ok.example', 1000, 50, 0, 1)], { knownMfa: ['z.example'] }), cfg), 'b', 'B')
  const c = compare(a, b)
  assert.deepEqual(c.resolved.sort(), ['x.example', 'y.example'])
  assert.deepEqual(c.added.map(x => x[0]), ['z.example'])
  assert.deepEqual(c.leaking, [['y.example', 20]])
  assert.ok(c.spendAtRiskDelta < 0)
})

test('parseList reads one-per-line and first-column CSV lists, skipping headers and comments', () => {
  assert.deepEqual(parseList('# my list\ndomain\njunk.example\n"other.example",reason\n\n'), ['junk.example', 'other.example'])
})

test('sample: B2B native has about 22% of spend on flagged junk and a lower projected CPA', () => {
  const def = SAMPLES.find(s => s.id === 'northwind')!
  const a = runAudit(generate(def), sampleConfig(def))
  assert.ok(a.riskShare > 0.17 && a.riskShare < 0.27, `risk share ${a.riskShare}`)
  assert.ok(a.flagged.length >= 25)
  assert.ok(a.whatIf.after.cpa! < a.whatIf.before.cpa!)
  // No legit domain is flagged in the synthetic data.
  assert.ok(!a.flagged.some(p => p.key === 'devweekly.example'))
})

test('sample: CTV campaign has frequency waste and under-pacing; samples are deterministic', () => {
  const def = SAMPLES.find(s => s.id === 'lumen')!
  const d1 = generate(def)
  const a = runAudit(d1, sampleConfig(def))
  assert.ok(a.freq.share > 0.15, `freq share ${a.freq.share}`)
  const p = pacing(d1.flight, d1.rows)
  assert.ok(p.some(l => l.status === 'under'))
  assert.equal(JSON.stringify(generate(def).rows.slice(0, 5)), JSON.stringify(d1.rows.slice(0, 5)))
  let n = 0
  const h = sampleHistory(def, () => String(n++))
  assert.equal(h.length, 1)
  assert.ok(h[0].riskShare > a.riskShare)
})

test('sample: ROAS campaign projects higher ROAS after exclusions', () => {
  const def = SAMPLES.find(s => s.id === 'harbor')!
  const a = runAudit(generate(def), sampleConfig(def))
  assert.ok(a.totals.roas! > 0)
  assert.ok(a.whatIf.after.roas! > a.whatIf.before.roas!)
})

// Fixtures mirror the real export layouts (header names, title/footer rows, encodings) with synthetic values.
const fixture = (name: string) => {
  const csv = parseCsv(decodeBytes(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))))
  const header = findHeader(csv.rows)
  const kind = detectKind(csv.rows[header])!
  return { csv, header, kind, source: detectSource(csv.rows[header]), v: validate(kind, csv, autoMap(kind, csv.rows[header]), header) }
}

test('Google Ads "Excel .csv": UTF-16LE, tab-separated, title rows, Total rows, Placement URL preferred', () => {
  const f = fixture('gads-where-ads-showed-utf16.csv')
  assert.equal(f.csv.delim, '\t')
  assert.equal(f.header, 2)
  assert.equal(f.source, 'gads')
  assert.equal(f.v.rows.length, 4)
  assert.equal(f.v.skipped, 2)
  const keys = (f.v.rows as PlacementRow[]).map(r => normalize(r.placement).key)
  assert.deepEqual(keys, ['cloudops-journal.example', 'com.example.solitaire', 'id1234567890', 'anonymous.google'])
  assert.equal((f.v.rows as PlacementRow[])[0].impressions, 12840)
})

test('DV360: YYYY/MM/DD dates, blank-dimension totals row and the report footer are not read as data', () => {
  const f = fixture('dv360-app-url.csv')
  assert.equal(f.source, 'dv360')
  const rows = f.v.rows as PlacementRow[]
  assert.equal(rows.length, 4)
  assert.equal(rows[0].date, '2026-10-01')
  assert.equal(rows[0].viewability, 0.6812)
  assert.equal(normalize(rows[2].placement).key, 'com.example.solitaire')
  assert.equal(f.v.skipped, 1)
  assert.ok(f.v.issues.some(i => /footer/.test(i.message)))
  assert.ok(!f.v.issues.some(i => /is empty|not a number/.test(i.message)))
})

test('The Trade Desk: "(Adv Currency)" cost columns and Click + View conversions map', () => {
  const f = fixture('ttd-site-report.csv')
  assert.equal(f.source, 'ttd')
  const rows = f.v.rows as PlacementRow[]
  assert.equal(rows.length, 4)
  assert.equal(rows[0].spend, 412.07)
  assert.equal(rows[0].conversions, 4)
  assert.equal(rows[0].line, 'NW | Native | Prospecting')
  assert.equal(normalize(rows[3].placement).key, 'id1234567890')
})

test('European semicolon CSV: decimal commas and dot thousands', () => {
  const f = fixture('eu-semicolon.csv')
  assert.equal(f.csv.delim, ';')
  const rows = f.v.rows as PlacementRow[]
  assert.deepEqual(rows.map(r => r.spend), [152.73, 9.5, 1034.1])
  assert.deepEqual(rows.map(r => r.impressions), [18402, 1204, 902])
  assert.deepEqual(rows.map(r => Math.round(r.viewability! * 1000) / 1000), [0.681, 0.55, 0.61])
})

test('parseNum: separator rules for US and European numbers', () => {
  assert.equal(parseNum('1,234'), 1234)
  assert.equal(parseNum('1,234,567.89'), 1234567.89)
  assert.equal(parseNum('12,5'), 12.5)
  assert.equal(parseNum('1.234,50 €'), 1234.5)
  assert.equal(parseNum('1.234', true), 1234)
  assert.equal(parseNum('1.5', true), 1.5)
  assert.equal(parseNum('1,234', true), 1.234)
  assert.equal(parseNum('12.50 USD'), 12.5)
})

test('sniffDelimiter ignores a title line and commas inside a quoted date range', () => {
  assert.equal(sniffDelimiter('Report\n"Oct 1, 2026 - Oct 31, 2026"\nA\tB\tC\tD\n1\t2\t3\t4\n'), '\t')
  assert.equal(sniffDelimiter('a,b;c\n1,2;3'), ',')
})

test('decodeBytes: UTF-8 with BOM, UTF-16LE with and without BOM', () => {
  const s = 'Domain,Spend\nexample.com,1\n'
  assert.equal(parseCsv(decodeBytes(new TextEncoder().encode('﻿' + s))).rows[0][0], 'Domain')
  const le = new Uint8Array([...s].flatMap(c => [c.charCodeAt(0), 0]))
  assert.equal(decodeBytes(le), s)
  assert.equal(decodeBytes(new Uint8Array([0xff, 0xfe, ...le])), s)
})

test('normalize: "App name (bundle)" labels resolve to the bundle or store id', () => {
  assert.equal(normalize('Solitaire Classic Example (com.example.solitaire)').key, 'com.example.solitaire')
  assert.equal(normalize('Puzzle Example (id1234567890)').key, 'id1234567890')
  assert.equal(normalize('Example News (example.com)').kind, 'web')
})
