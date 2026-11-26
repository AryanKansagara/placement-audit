import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap, detectKind, findHeader, parseCsv, parseNum, validate } from './csv.ts'
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
