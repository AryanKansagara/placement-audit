import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/** Every test blocks requests outside the app's own origin and fails on an uncaught page error. */
export const test = base.extend<{ guard: { blocked: string[] } }>({
  guard: [async ({ page, baseURL }, use) => {
    const errors: string[] = []
    const blocked: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route(url => /^https?:$/.test(url.protocol) && url.origin !== baseURL, route => {
      blocked.push(route.request().url())
      return route.abort()
    })
    await use({ blocked })
    expect(errors).toEqual([])
    // Only the Google Fonts stylesheet is ever asked for; no report data or sync host is contacted while signed out.
    expect(blocked.filter(u => !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u))).toEqual([])
  }, { auto: true }],
})
export { expect }

export type File = { name: string; text?: string; buffer?: Buffer }

export async function newAudit(page: Page) {
  await page.goto('/app')
  await page.getByRole('button', { name: /^(New audit|Import your data)$/ }).click()
  await expect(page.getByRole('heading', { name: 'Import reports' })).toBeVisible()
}

export async function choose(page: Page, ...files: File[]) {
  await page.locator('.dropzone input[type=file]').setInputFiles(files.map(f => ({ name: f.name, mimeType: 'text/csv', buffer: f.buffer ?? Buffer.from(f.text!) })))
}

export const card = (page: Page, name: string): Locator => page.locator('.pending', { hasText: name })

/** Picks a file and presses Import, checking the number of rows the app says are ready. */
export async function importFile(page: Page, f: File, rows: number) {
  await choose(page, f)
  await expect(card(page, f.name).locator('.report')).toContainText(new RegExp(`^${rows.toLocaleString('en-US')} rows? ready`))
  await card(page, f.name).getByRole('button', { name: /^Import [\d,]+ rows$/ }).click()
  await expect(card(page, f.name)).toHaveCount(0)
  // The next write starts from what is on screen (#25), so wait until this one has been read back.
  await expect(page.locator('.kpi').or(page.locator('.cov.ok')).first()).toBeVisible()
}

export const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Audit sections' }).getByRole('link', { name: new RegExp(`^${name}`) }).click()

export const kpi = (page: Page, label: string) => page.locator('.kpi').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) })

export const row = (page: Page, key: string) => page.locator('table.placements tbody tr').filter({ has: page.getByRole('button', { name: key, exact: true }) })

/** The names in the Placements table, in order. */
export const keys = (page: Page) => page.locator('table.placements .pl-name').allTextContents()

export async function saved(page: Page, click: () => Promise<void>) {
  const wait = page.waitForEvent('download')
  await click()
  const d = await wait
  return { name: d.suggestedFilename(), text: readFileSync(await d.path(), 'utf8') }
}

export const fixture = (name: string) => readFileSync(new URL(`../src/engine/fixtures/${name}`, import.meta.url))

/**
 * Worked on paper: six clean sites (10,000 impressions, $100, 20 clicks, 4 conversions, 70% viewable, 1% IVT)
 * and one bad one (40,000 impressions, $200, 80 clicks, 0 conversions, 25% viewable, 15% IVT, frequency 12).
 * Totals: $800, 100,000 impressions, 24 conversions, CPA 800/24 = $33.33.
 *  IVT 15% is three times the 5% limit: 30. Viewability 25% is half the 50% floor: 25.
 *  40% of impressions, 40,000 x 24/100,000 = 9.6 conversions expected, none: 15.
 *  CTR is 0.2% everywhere and CPM $5 is 50% of the $10 median, so neither fires. Score 70.
 *  What-if: 24 - 0 + 200 x (4/100) = 32 conversions, 800/32 = $25.00, 25% lower.
 *  Frequency: 40,000 x (1 - 6/12) = 20,000 of 100,000 impressions, at $8 CPM = $160.
 */
export const HAND = 'domain,impressions,spend,clicks,conversions,viewability,ivt,frequency\n'
  + [1, 2, 3, 4, 5, 6].map(i => `clean${i}.example,"10,000",$100.00,20,4,70%,1%,3\n`).join('')
  + 'bad.example,"40,000",$200.00,80,0,25%,15%,12\n'

/** Five days at $120 against $3,000 over 30 days: 600 of 500 expected (120%), 2,400/25 = $96 a day, 600 + 25 x 120 = $3,600. */
export const DAILY = 'date,line item,domain,impressions,spend\n' + [1, 2, 3, 4, 5].map(d => `2026-11-0${d},Line A,a.example,10000,120\n`).join('')
export const FLIGHT = 'line item,budget,start date,end date\nLine A,"3,000",2026-11-01,2026-11-30\n'
