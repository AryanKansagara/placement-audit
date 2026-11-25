import { card, choose, DAILY, expect, fixture, FLIGHT, HAND, importFile, keys, kpi, newAudit, row, saved, tab, test } from './fixtures'

// Each test states the correct behavior for a filed bug; test.fail marks the ones not fixed yet.

test('#2 a percentage-point column reads 0.8 as 0.8%', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'r.csv', text: 'domain,impressions,spend,IVT %\na.example,10000,100,0.8\nb.example,10000,100,31.5\n' }, 2)
  await tab(page, 'Placements')
  await expect(row(page, 'b.example')).toContainText('31.5%')
  await expect(row(page, 'a.example')).toContainText('0.8%', { timeout: 3000 })
})

test('#3 a German tab-separated report', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'r.tsv', text: 'Domain\tImpressions\tCost\na.example\t18.402\t152,73\nb.example\t1.204\t1.034,10\n' }, 2)
  await expect(kpi(page, 'Spend audited')).toContainText('$1,187')
  // 18,402 + 1,204
  await expect(kpi(page, 'Spend audited')).toContainText('19,606 impressions', { timeout: 3000 })
})

test('#3 a semicolon file with dot decimals', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'r.csv', text: 'domain;impressions;spend\na.example;1000;12.345\nb.example;1000;3.5\n' }, 2)
  await expect(kpi(page, 'Spend audited').locator('b')).toHaveText('$16', { timeout: 3000 })
})

test('#4 country suffixes are not placements', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'r.csv', text: 'domain,impressions,spend\njunk.co.ke,1000,20\nnews.co.ke,1000,10\n' }, 2)
  await tab(page, 'Placements')
  await expect(page.locator('table.placements tbody tr')).not.toHaveCount(0)
  expect(await keys(page)).toEqual(['junk.co.ke', 'news.co.ke'])
})

test('#5 bundles that end like a domain stay apps; language subdomains stay sites', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'r.csv', text: 'domain,impressions,spend\ncom.weather.app,1000,20\nnl.example.be,1000,10\n' }, 2)
  await tab(page, 'Placements')
  await expect(page.locator('table.placements tbody tr')).toHaveCount(2)
  expect(await keys(page)).toEqual(['com.weather.app', 'example.be'])
})

test('#6 campaigns and sites that start with "Total" are kept', async ({ page }) => {
  await newAudit(page)
  await choose(page, { name: 'r.csv', text: 'campaign,domain,impressions,spend\nTotal Wellness Q4,a.example,1000,10\nBrand,total-home.example,1000,10\nBrand,z.example,1000,10\nTotal,,3000,30\n' })
  await expect(card(page, 'r.csv').locator('.report')).toContainText('3 rows ready, 1 skipped', { timeout: 3000 })
})

test('#7 a row with an unquoted thousands comma is refused', async ({ page }) => {
  await newAudit(page)
  await choose(page, { name: 'r.csv', text: 'domain,impressions,spend\na.example,1000,10.00\nb.example,1,234,10.50\n' })
  await expect(card(page, 'r.csv').locator('.report')).toContainText('1 row ready, 1 skipped', { timeout: 3000 })
})

test.fail('#8 an unclosed quote is reported', async ({ page }) => {
  await newAudit(page)
  await choose(page, { name: 'r.csv', text: 'domain,impressions,spend\na.example,1000,10\n"b.example,1000,10\nc.example,1000,10\n' })
  await expect(card(page, 'r.csv').locator('.report')).toContainText('1 row ready')
  await expect(card(page, 'r.csv').locator('.report')).toContainText(/quote/i, { timeout: 3000 })
})

test('#9 day-first dates', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'r.csv', text: 'date,domain,impressions,spend\n13/11/2026,a.example,1000,10\n02/11/2026,a.example,1000,10\n' }, 2)
  await expect(kpi(page, 'Spend audited')).toContainText('2026-11-02 to 2026-11-13', { timeout: 3000 })
})

test.fail('#10 the 10+ frequency bucket', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'h.csv', text: HAND }, 7)
  await tab(page, 'Data')
  await choose(page, { name: 'f.csv', text: 'frequency,users,impressions\n2,100,200\n10+,80,1600\n' })
  await card(page, 'f.csv').getByRole('button', { name: /^Import \d rows/ }).click()
  await tab(page, 'Overview')
  // 1600 - 80 x 6 = 1,120 of 1,800
  await expect(kpi(page, 'Frequency waste')).toContainText('62.2% of impressions', { timeout: 3000 })
})

test('#11 a campaign-level flight plan', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'f.csv', text: FLIGHT.replace('Line A', 'Camp') }, 1)
  await importFile(page, { name: 'd.csv', text: DAILY.replace('date,', 'campaign,date,').replace(/^2026/gm, 'Camp,2026') }, 5)
  await tab(page, 'Pacing')
  await expect(page.locator('.pace-card')).toContainText('Spent$600', { timeout: 3000 })
})

test('#12 a report without dates has no pacing verdict', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'f.csv', text: FLIGHT }, 1)
  await importFile(page, { name: 'd.csv', text: 'line item,domain,impressions,spend\nLine A,a.example,10000,600\n' }, 1)
  await expect(kpi(page, 'Pacing')).toContainText('Needs a report broken out by day')
  await tab(page, 'Pacing')
  await expect(page.getByRole('heading', { name: 'Pacing by line item' })).toBeVisible()
  await expect(page.getByText('Under-pacing', { exact: true })).toHaveCount(0, { timeout: 3000 })
  await expect(page.getByText('Pacing needs a report broken out by day')).toBeVisible()
  await page.getByRole('link', { name: 'Client report', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What we are changing' })).toBeVisible()
  await expect(page.locator('.report-actions')).not.toContainText('Adjust daily budgets')
})

test('#13 a small leaking placement is found in a long tail', async ({ page }) => {
  test.slow()
  await newAudit(page)
  const tail = Array.from({ length: 600 }, (_, i) => `site${i}.example,10000,100\n`).join('')
  await importFile(page, { name: 'a.csv', text: `domain,impressions,spend\n${tail}small.example,10000,20\n` }, 601)
  await tab(page, 'Data')
  await page.getByLabel('Known-MFA list').fill('small.example')
  await page.getByRole('button', { name: 'Add to list' }).click()
  await expect(page.locator('.cov', { hasText: 'Known-MFA list' })).toContainText('1 entries')
  await page.getByRole('button', { name: 'Save snapshot' }).click()
  await expect(page.getByRole('link', { name: /^History ?1$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Save snapshot' }).click()
  await tab(page, 'History')
  await expect(page.locator('.kpi', { hasText: 'Leaking exclusions' }).locator('b')).toHaveText('1', { timeout: 3000 })
})

test('#13 snapshots cut off by an earlier version are not called a success', async ({ page }) => {
  test.slow()
  await newAudit(page)
  const tail = Array.from({ length: 600 }, (_, i) => `site${i}.example,10000,100\n`).join('')
  await importFile(page, { name: 'a.csv', text: `domain,impressions,spend\n${tail}small.example,10000,20\nbig.example,10000,9000\n` }, 602)
  await tab(page, 'Data')
  await page.getByLabel('Known-MFA list').fill('small.example\nbig.example')
  await page.getByRole('button', { name: 'Add to list' }).click()
  await expect(page.locator('.cov', { hasText: 'Known-MFA list' })).toContainText('2 entries')
  await page.getByRole('button', { name: 'Save snapshot' }).click()
  await expect(page.getByRole('link', { name: /^History ?1$/ })).toBeVisible()
  await importFile(page, { name: 'b.csv', text: `domain,impressions,spend\n${tail}small.example,10000,20\n` }, 601)
  await expect(kpi(page, 'Spend at risk')).toContainText('$20')
  await page.getByRole('button', { name: 'Save snapshot' }).click()
  await expect(page.getByRole('link', { name: /^History ?2$/ })).toBeVisible()
  // Cut the stored snapshots the way the earlier version did.
  await page.evaluate(() => new Promise<void>((res, rej) => {
    const open = indexedDB.open('placement-audit')
    open.onsuccess = () => {
      const s = open.result.transaction('projects', 'readwrite').objectStore('projects')
      const all = s.getAll()
      all.onsuccess = () => {
        const p = all.result[0]
        for (const x of p.snapshots) x.spendBy = Object.fromEntries(Object.entries(x.spendBy).slice(0, 500))
        const put = s.put(p)
        put.onsuccess = () => res()
        put.onerror = () => rej(put.error)
      }
    }
  }))
  await page.reload()
  await tab(page, 'History')
  await expect(page.locator('.kpi', { hasText: 'Leaking exclusions' })).toContainText('2 unknown')
  await expect(page.locator('.verdict')).toContainText('cannot show whether the exclusions worked')
  await expect(page.locator('.partial-note')).toBeVisible()
})

test.fail('#14 undoing one override keeps the next one', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'h.csv', text: HAND }, 7)
  await tab(page, 'Placements')
  await row(page, 'clean1.example').getByRole('button', { name: 'Block' }).click()
  await expect(row(page, 'clean1.example').getByRole('button', { name: 'Reset block' })).toBeVisible()
  await row(page, 'clean2.example').getByRole('button', { name: 'Block' }).click()
  await expect(row(page, 'clean2.example').getByRole('button', { name: 'Reset block' })).toBeVisible()
  await page.locator('.toast', { hasText: 'Blocked clean1.example' }).getByRole('button', { name: 'Undo' }).click()
  await expect(row(page, 'clean1.example').getByRole('button', { name: 'Block', exact: true })).toBeVisible()
  await expect(row(page, 'clean2.example').getByRole('button', { name: 'Reset block' })).toBeVisible({ timeout: 3000 })
})

test.fail('#15 importing the placement report keeps the other dropped file', async ({ page }) => {
  await newAudit(page)
  await choose(page, { name: 'daily.csv', text: DAILY }, { name: 'flight.csv', text: FLIGHT })
  await expect(page.locator('.pending')).toHaveCount(2)
  await card(page, 'daily.csv').getByRole('button', { name: 'Import 5 rows' }).click()
  await expect(page.locator('.toast', { hasText: 'Imported 5' })).toBeVisible()
  await tab(page, 'Data')
  await expect(card(page, 'flight.csv')).toBeVisible({ timeout: 3000 })
})

test.fail('#16 the reasons CSV does not carry formulas', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'r.csv', text: 'domain,impressions,spend\n=1+1,1000,20\n' }, 1)
  await tab(page, 'Placements')
  await page.locator('table.placements').getByRole('button', { name: 'Block', exact: true }).click()
  await tab(page, 'Exclusions')
  await page.getByRole('radio', { name: /^With reasons/ }).click()
  const f = await saved(page, () => page.getByRole('button', { name: 'Download', exact: true }).click())
  expect(f.text).toContain('1+1')
  expect(f.text).not.toMatch(/^=/m)
})

test('#17 placeholders are not exported to a DSP list', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'dv.csv', buffer: fixture('dv360-app-url.csv') }, 4)
  await tab(page, 'Placements')
  await row(page, 'low volume inventory').getByRole('button', { name: 'Block', exact: true }).click()
  await tab(page, 'Exclusions')
  await expect(page.locator('.code pre')).toContainText('domain')
  await expect(page.locator('.code pre')).not.toContainText('low volume inventory', { timeout: 3000 })
  await expect(page.locator('.names-note')).toContainText('1 flagged entry is not in the upload lists')
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled()
  for (const f of [/^Plain list/, /^The Trade Desk/, /^DV360/, /^Google Ads/]) {
    await page.getByRole('radio', { name: f }).click()
    await expect(page.locator('.code pre')).not.toContainText('low volume inventory')
  }
  await page.getByRole('radio', { name: /^With reasons/ }).click()
  await expect(page.locator('.code pre')).toContainText('low volume inventory')
})

test('#25 two imports in quick succession are both kept', async ({ page }) => {
  await newAudit(page)
  await choose(page, { name: 'flight.csv', text: FLIGHT }, { name: 'f.csv', text: 'frequency,users\n2,100\n' })
  await expect(page.locator('.pending')).toHaveCount(2)
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('.pending .btn.primary').forEach(b => b.click()))
  await expect(page.locator('.pending')).toHaveCount(0)
  await expect(page.locator('.cov', { hasText: 'Frequency report' })).toContainText('1 buckets')
  await expect(page.locator('.cov', { hasText: 'Flight plan' })).toContainText('1 line items', { timeout: 3000 })
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('.cov', { hasText: 'Frequency report' })).toContainText('1 buckets')
  await expect(page.locator('.cov', { hasText: 'Flight plan' })).toContainText('1 line items')
  await expect(page.locator('tbody tr')).toHaveCount(2)
})

test('#25 a pasted and an uploaded list added together are both kept', async ({ page }) => {
  await newAudit(page)
  await page.getByLabel('Known-MFA list').fill('a.example')
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('label.btn input[type=file]')!
    const files = new DataTransfer()
    files.items.add(new File(['b.example\n'], 'l.txt'))
    input.files = files.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    ;[...document.querySelectorAll('button')].find(b => b.textContent === 'Add to list')!.click()
  })
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await expect(page.locator('.cov', { hasText: 'Known-MFA list' })).toContainText('2 entries', { timeout: 3000 })
})

test('#25 two quick imports into a sample land in one new audit', async ({ page }) => {
  await page.goto('/app?sample=northwind&tab=data')
  await choose(page, { name: 'h.csv', text: HAND }, { name: 'flight.csv', text: FLIGHT })
  await expect(page.locator('.pending')).toHaveCount(2)
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('.pending .btn.primary').forEach(b => b.click()))
  await expect(page.getByRole('heading', { name: 'My campaign audit' })).toBeVisible()
  await expect(kpi(page, 'Spend audited')).toContainText('$800')
  await tab(page, 'Data')
  await expect(page.locator('.cov', { hasText: 'Flight plan' })).toContainText('1 line items')
  await page.goto('/app')
  await expect(page.getByRole('link', { name: 'My campaign audit' })).toHaveCount(1)
})

test('#25 undoing an import keeps what was added after it', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'one.csv', text: HAND }, 7)
  await tab(page, 'Data')
  await importFile(page, { name: 'two.csv', text: 'domain,impressions,spend\nz.example,1000,5\n' }, 1)
  await expect(kpi(page, 'Spend audited')).toContainText('$5')
  await tab(page, 'Data')
  await page.getByLabel('Known-MFA list').fill('a.example')
  await page.getByRole('button', { name: 'Add to list' }).click()
  await expect(page.locator('.cov', { hasText: 'Known-MFA list' })).toContainText('1 entries')
  await page.locator('.toast', { hasText: 'Imported 1 ' }).getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.cov', { hasText: 'Placement report' })).toContainText('7 rows')
  await expect(page.locator('.cov', { hasText: 'Known-MFA list' })).toContainText('1 entries')
  await expect(page.locator('tbody tr')).toHaveCount(2)
})
