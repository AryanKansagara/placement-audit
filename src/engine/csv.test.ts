import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap, detectKind, findHeader, parseCsv, parseNum, parseTime, validate } from './csv.ts'
import type { PlacementRow } from './types.ts'

const read = (text: string) => {
  const csv = parseCsv(text)
  const h = findHeader(csv.rows)
  const kind = detectKind(csv.rows[h])!
  const v = validate(kind, csv, autoMap(kind, csv.rows[h]), h)
  return { ...v, rows: v.rows as PlacementRow[] }
}
const col = (text: string, k: keyof PlacementRow) => read(text).rows.map(r => r[k])

test('decimal mark: a tab-separated German report', () => {
  const t = 'Domain\tImpressions\tCost\na.example\t18.402\t152,73\nb.example\t1.204\t1.034,10\nc.example\t902\t1.500\n'
  assert.deepEqual(col(t, 'impressions'), [18402, 1204, 902])
  assert.deepEqual(col(t, 'spend'), [152.73, 1034.1, 1500])
  assert.deepEqual(read(t).issues, [])
  const note = read(t.replace('152,73', '152').replace('1.034,10', '2').replace('18.402', '18402,0'))
  assert.match(note.issues[0].message, /Spend: "1\.500" was read as 1500, because other numbers in the file use a decimal comma/)
})

test('decimal mark: whole-number impressions settle the file when nothing else does', () => {
  assert.deepEqual(col('Domain\tImpressions\tCost\na.example\t18.402\t1.500\n', 'spend'), [1500])
  assert.deepEqual(col('domain;impressions;spend\na.example;"18,402";1,500\n', 'spend'), [1500])
})

test('decimal mark: a semicolon file with dot decimals', () => {
  assert.deepEqual(col('domain;impressions;spend\na.example;1000;12.345\nb.example;1000;3.5\n', 'spend'), [12.345, 3.5])
})

test('decimal mark: US files read as before', () => {
  const t = 'domain,impressions,spend,frequency\na.example,"1,234","1,234.50",1.234\nb.example,"1,234,567",12.345,2.5\nc.example,"12,34,567",7,3\n'
  assert.deepEqual(col(t, 'impressions'), [1234, 1234567, 1234567])
  assert.deepEqual(col(t, 'spend'), [1234.5, 12.345, 7])
  assert.deepEqual(col(t, 'frequency'), [1.234, 2.5, 3])
})

test('decimal mark: a leading zero or four digits before a comma is never a thousands group', () => {
  assert.deepEqual(col('domain,impressions,spend\na.example,10,"0,125"\nb.example,10,"1234,567"\n', 'spend'), [0.125, 1234.567])
  assert.equal(parseNum('0.125', true), 0.125)
})

test('decimal mark: contradictory values are reported', () => {
  const v = read('domain,impressions,spend\na.example,10,"12,5"\nb.example,10,3.5\nc.example,10,"1,234"\n')
  assert.deepEqual(v.rows.map(r => r.spend), [12.5, 3.5, 1234])
  assert.match(v.issues[0].message, /mixes decimal commas and decimal points, so "1,234" was read as 1234/)
})

test('numbers that only JavaScript understands are not metrics', () => {
  for (const s of ['Infinity', '0x10', '1e999', '1.2.3', '%', '$']) assert.ok(Number.isNaN(parseNum(s)), s)
  assert.equal(parseNum('1e3'), 1000)
  assert.equal(parseNum('+5'), 5)
  assert.equal(parseNum('.5'), 0.5)
})

test('decimal mark: a cut-off or stray value does not change the other rows', () => {
  for (const tail of ['b.example,"1,2', 'b.example,"1,23"', 'b.example,10,"1,2']) {
    const v = read(`domain,impressions,spend\na.example,"1,234","2,345"\nd.example,"3,456","5,678"\n${tail}`)
    assert.deepEqual(v.rows.slice(0, 2).map(r => [r.impressions, r.spend]), [[1234, 2345], [3456, 5678]], tail)
  }
})

test('rates: a column in percentage points keeps its small values small', () => {
  const t = 'domain,impressions,spend,ivt\na.example,10,1,0.8\nb.example,10,1,31.5\nc.example,10,1,0.5%\nd.example,10,1,1\ne.example,10,1,0\n'
  assert.deepEqual(col(t, 'ivt'), [0.008, 0.315, 0.005, 0.01, 0])
  assert.match(read(t).issues[0].message, /IVT rate: values without a % sign go up to 31.5, so the column was read as percentages \(0.8 is 0.8%\)/)
  assert.deepEqual(col('domain,impressions,spend,ivt\na.example,10,1,"0,8"\nb.example,10,1,"31,5"\n', 'ivt'), [0.008, 0.315])
})

test('rates: fractions and % values stay what they were', () => {
  const t = 'domain,impressions,spend,ivt,viewability\na.example,10,1,0.8,0.71\nb.example,10,1,31.5%,0.9\nc.example,10,1,1,1\n'
  assert.deepEqual(col(t, 'ivt'), [0.8, 0.315, 1])
  assert.deepEqual(col(t, 'viewability'), [0.71, 0.9, 1])
  assert.deepEqual(read(t).issues, [])
})

test('rates: one viewability fraction above 1 does not turn the column into percentages', () => {
  assert.deepEqual(col('domain,impressions,spend,viewability\na.example,10,1,0.71\nb.example,10,1,0.68\nc.example,10,1,1.02\n', 'viewability'), [0.71, 0.68, 0.0102])
  assert.deepEqual(col('domain,impressions,spend,viewability\na.example,10,1,71\nb.example,10,1,68\nc.example,10,1,0.5\n', 'viewability'), [0.71, 0.68, 0.005])
})

test('a row with more values than headers is refused; empty trailing cells are not', () => {
  const v = read('domain,impressions,spend\na.example,1000,10.00,,\nb.example,1,234,10.50\nc.example,"1,234",10.50\n')
  assert.deepEqual(v.rows.map(r => [r.placement, r.impressions, r.spend]), [['a.example', 1000, 10], ['c.example', 1234, 10.5]])
  assert.equal(v.skipped, 1)
  assert.deepEqual(v.issues, [{ line: 3, message: 'Row has 4 values for 3 columns, so it was not read. A number such as 1,234 may need quotes' }])
})

const dates = (...ds: string[]) => read('date,domain,impressions,spend\n' + ds.map(d => `${d},a.example,1,1\n`).join(''))

test('dates: a column with a first number above 12 is day first throughout', () => {
  assert.deepEqual(dates('13/11/2026', '02/11/2026', '2026-11-03').rows.map(r => r.date), ['2026-11-13', '2026-11-02', '2026-11-03'])
  assert.deepEqual(dates('02/11/2026', '11/13/2026').rows.map(r => r.date), ['2026-02-11', '2026-11-13'])
  assert.deepEqual(dates('02/11/2026 7:30 PM', '13/11/2026 23:59').rows.map(r => r.date), ['2026-11-02', '2026-11-13'])
  assert.deepEqual(dates('02/11/2026', '3/1/2026').rows.map(r => r.date), ['2026-02-11', '2026-03-01'])
  assert.deepEqual(dates('02/11/2026', '13/11/2026').issues, [])
})

test('dates: the other date column of a flight plan settles an ambiguous one', () => {
  const f = read('line item,budget,start date,end date\nA,100,01/11/2026,30/11/2026\n').rows as unknown as { start: string; end: string }[]
  assert.deepEqual([f[0].start, f[0].end], ['2026-11-01', '2026-11-30'])
})

test('dates: impossible dates are not dates', () => {
  for (const s of ['2026-02-31', '2026-13-01', '2026-00-10', '2026/02/30', '2/30/2026', '13/13/2026', '0/1/2026', '2026-11-01 25:00', '2026-11-01 10:60']) {
    assert.ok(Number.isNaN(parseTime(s)), s)
    const v = dates(s, '2026-11-02')
    assert.deepEqual(v.rows.map(r => r.date), ['2026-11-02'], s)
    assert.deepEqual(v.issues, [{ line: 2, message: `Date "${s}" is not a date` }])
  }
  for (const s of ['2028-02-29', '2026-11-01T23:59:59Z', '2026-11-01 24:00', '12/31/2026 11:59 PM', '2026-11-01 00:30 +05:30']) assert.ok(!Number.isNaN(parseTime(s)), s)
  assert.deepEqual(dates('31/02/2026', '02/11/2026').rows.map(r => r.date), ['2026-11-02'])
  assert.deepEqual(dates('13/13/2026', '02/11/2026').rows.map(r => r.date), ['2026-02-11'])
})

test('dates: a column in both orders is reported and its ambiguous dates are not guessed', () => {
  const v = dates('13/11/2026', '11/14/2026', '02/11/2026', '05/05/2026', '2026-11-01')
  assert.deepEqual(v.rows.map(r => r.date), ['2026-11-13', '2026-11-14', '2026-05-05', '2026-11-01'])
  assert.match(v.issues[0].message, /Date: some dates are day first \(13\/11\/2026\) and some month first \(11\/14\/2026\)/)
  assert.deepEqual(v.issues[1], { line: 4, message: 'Date "02/11/2026" could be day first or month first' })
})

test('an unclosed quote is reported with its line, and nothing from it on is read', () => {
  const t = 'domain,impressions,spend\na.example,1000,10\n"b.example,1000,10\nc.example,1000,10\nd.example,1000,10\n'
  for (const s of [t, t.replace(/\n/g, '\r\n')]) {
    const v = read(s)
    assert.deepEqual(v.rows.map(r => r.placement), ['a.example'])
    assert.deepEqual([v.skipped, v.total], [1, 2])
    assert.deepEqual(v.issues, [{ line: 3, message: 'The quote (") opened on line 3 never closes, so that row and the rest of the file after it were not read' }])
  }
  // Cut off inside a quoted last field, or right after its opening quote; earlier quoted newlines still count as lines.
  for (const cut of ['b.example,10,"1,2', 'b.example,10,"', '"', '"b.exa', '"b.example","1,2""']) {
    const v = read(`domain,impressions,spend,campaign\na.example,1000,10,"one\ntwo"\n${cut}`)
    assert.deepEqual(v.rows.map(r => r.campaign), ['one\ntwo'], cut)
    assert.deepEqual(v.issues.map(i => i.line), [4], cut)
    assert.match(v.issues[0].message, /opened on line 4 never closes/)
  }
})

test('closed quotes and stray quotes inside a value are not reported', () => {
  for (const s of ['"a.example","1,000","10"', 'a "b" c.example,1000,10', 'a.example,1000,10,"x ""y"" z"', '"a.example",1000,"10"\n']) {
    const csv = parseCsv(`domain,impressions,spend,note\n${s}`)
    assert.equal(csv.unclosed, undefined, s)
    assert.equal(csv.rows.length, 2, s)
  }
})

test('totals rows are skipped in every wording', () => {
  for (const label of ['Total', 'totals', 'Grand Total', 'Total: account', 'Total: Display Network', 'Total - Campaigns', 'Totals (25 rows)', 'Total for all placements', 'Summary', 'Summary:', 'Total Display']) {
    assert.deepEqual(read(`domain,impressions,spend\na.example,1000,10\n${label},1000,10\n`).rows.map(r => r.placement), ['a.example'], label)
    for (const blank of ['', '--', 'All']) assert.deepEqual(read(`campaign,domain,impressions,spend\nC,a.example,1000,10\n${label},${blank},1000,10\nC,z.example,1,1\n`).rows.map(r => r.placement), ['a.example', 'z.example'], `${label} ${blank}`)
  }
})

test('names that start with "Total" or "Summary" are delivery', () => {
  const t = 'campaign,domain,impressions,spend\nTotal Wellness Q4,a.example,10,1\nSummary Sale,com.example.game,10,1\nBrand,total-home.example,10,1\nBrand,total.com,10,1\nBrand,https://summary.example/x,10,1\nTotal - TV,id1234567890,10,1\nBrand,Total Battle (com.example.battle),10,1\n'
  assert.equal(read(t).rows.length, 7)
  assert.deepEqual(read(t).issues, [])
  const f = read('line item,budget,start date,end date\nTotal TV,100,2026-11-01,2026-11-30\nTotal,100,2026-11-01,2026-11-30\nTotal budget,100,,\n')
  assert.equal(f.rows.length, 1)
})
