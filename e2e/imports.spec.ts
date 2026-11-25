import { card, choose, expect, fixture, HAND, importFile, keys, newAudit, row, saved, tab, test } from './fixtures'

test('StackAdapt-style report: detected, subdomains and URLs grouped', async ({ page }) => {
  await newAudit(page)
  const text = 'Date,Campaign Group,Campaign,Domain,Impressions,Clicks,Conversions,Cost,eCPM\n'
    + '2026-11-01,G,C,www.a.example,1000,2,1,10,10\n2026-11-02,G,C,https://a.example/x?y=1,1000,2,1,20,20\n2026-11-02,G,C,com.example.puzzle,500,1,0,5,10\n'
  await choose(page, { name: 'sa.csv', text })
  await expect(card(page, 'sa.csv').locator('select').first()).toHaveValue('placements')
  await expect(card(page, 'sa.csv').locator('select').first().locator('option:checked')).toHaveText('StackAdapt domain report')
  await card(page, 'sa.csv').getByRole('button', { name: 'Import 3 rows' }).click()
  await tab(page, 'Placements')
  await expect(row(page, 'a.example')).toContainText('$30')
  await expect(row(page, 'a.example')).toContainText('2,000')
  await expect(row(page, 'com.example.puzzle')).toContainText('App')
})

test('The Trade Desk: currency column and Click + View conversions', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'ttd.csv', buffer: fixture('ttd-site-report.csv') }, 4)
  await tab(page, 'Placements')
  expect(await keys(page)).toEqual(['devweekly.example', 'you-wont-believe-these-pics.example', 'com.example.flashlightultra', 'id1234567890'])
  // 412.07 / 4 conversions = $103.02
  await expect(row(page, 'devweekly.example')).toContainText('$103.02')
})

test('DV360: totals row and footer are not delivery', async ({ page }) => {
  await newAudit(page)
  await choose(page, { name: 'dv.csv', buffer: fixture('dv360-app-url.csv') })
  await expect(card(page, 'dv.csv')).toContainText('DV360 placement report')
  await expect(card(page, 'dv.csv')).toContainText('Totals row skipped')
  await expect(card(page, 'dv.csv')).toContainText('Report footer from here on ignored')
  await card(page, 'dv.csv').getByRole('button', { name: 'Import 4 rows' }).click()
  // 152.73 + 48.20 + 11.62 + 4.11 = 216.66
  await expect(page.getByText('Spend audited').locator('..')).toContainText('$217')
})

test('Google Ads UTF-16 tab file: title rows, totals, app placements', async ({ page }) => {
  await newAudit(page)
  await choose(page, { name: 'gads.csv', buffer: fixture('gads-where-ads-showed-utf16.csv') })
  await expect(card(page, 'gads.csv')).toContainText('header on line 3')
  await expect(card(page, 'gads.csv')).toContainText('Google Ads placement report')
  await card(page, 'gads.csv').getByRole('button', { name: 'Import 4 rows' }).click()
  await tab(page, 'Placements')
  expect((await keys(page)).sort()).toEqual(['anonymous.google', 'cloudops-journal.example', 'com.example.solitaire', 'id1234567890'])
})

test('European semicolon file', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'eu.csv', buffer: fixture('eu-semicolon.csv') }, 3)
  await tab(page, 'Placements')
  await expect(row(page, 'growthdesk.example')).toContainText('$1,034')
  await expect(row(page, 'cloudops-journal.example')).toContainText('18,402')
})

test('BOM, CRLF and quoted newlines', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'bom.csv', text: '﻿domain,campaign,impressions,spend\r\na.example,"Line one\r\nline two","1,000",10\r\nb.example,C,2000,20\r\n' }, 2)
  await tab(page, 'Placements')
  expect(await keys(page)).toEqual(['b.example', 'a.example'])
})

test('columns can be mapped by hand, and required ones are enforced', async ({ page }) => {
  await newAudit(page)
  await choose(page, { name: 'odd.csv', text: 'where,shown,paid\na.example,1000,10\n' })
  const c = card(page, 'odd.csv')
  await expect(c).toContainText('do not match a report we know')
  await c.locator('select').first().selectOption('placements')
  await expect(c).toContainText('Required column "Spend" is not mapped')
  await expect(c.getByRole('button', { name: 'Import 0 rows' })).toBeDisabled()
  await c.getByLabel('Domain / app / placement').selectOption('0')
  await c.getByLabel(/^Impressions/).selectOption('1')
  await c.getByLabel(/^Spend/).selectOption('2')
  await c.getByRole('button', { name: 'Import 1 rows' }).click()
  await tab(page, 'Placements')
  await expect(row(page, 'a.example')).toContainText('$10')
})

test('known-MFA list: pasted and uploaded entries flag their placements', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'r.csv', text: 'domain,impressions,spend\nnews.junk.example,5000,10\nfine.example,5000,10\ncom.example.flash,5000,10\n' }, 3)
  await tab(page, 'Data')
  await page.getByLabel('Known-MFA list').fill('# mine\njunk.example\n')
  await page.getByRole('button', { name: 'Add to list' }).click()
  await expect(page.locator('.cov', { hasText: 'Known-MFA list' })).toContainText('1 entries')
  await page.locator('label', { hasText: 'Upload list' }).locator('input').setInputFiles({ name: 'l.csv', mimeType: 'text/csv', buffer: Buffer.from('domain,why\ncom.example.flash,x\n') })
  await expect(page.locator('.cov', { hasText: 'Known-MFA list' })).toContainText('2 entries')
  await tab(page, 'Placements')
  await expect(row(page, 'junk.example').locator('.score-pill')).toHaveText('60')
  await expect(row(page, 'com.example.flash').locator('.score-pill')).toHaveText('60')
  await expect(row(page, 'fine.example').locator('.score-pill')).toHaveText('0')
})

test.describe('files that cannot be used', () => {
  for (const [name, text, message] of [
    ['empty.csv', '', 'has no data rows'],
    ['header.csv', 'domain,impressions,spend\n', 'has no data rows'],
    ['book.xlsx', 'PK\u0003\u0004 not a csv', 'is a spreadsheet'],
  ]) {
    test(name, async ({ page }) => {
      await newAudit(page)
      await choose(page, { name, text })
      await expect(page.locator('.toast')).toContainText(message)
      await expect(page.locator('.pending')).toHaveCount(0)
    })
  }

  test('an unrelated file offers no import', async ({ page }) => {
    await newAudit(page)
    await choose(page, { name: 'notes.csv', text: 'colour,size\nred,10\nblue,12\n' })
    await expect(card(page, 'notes.csv')).toContainText('do not match a report we know')
    await expect(page.getByRole('button', { name: /^Import \d/ })).toHaveCount(0)
  })

  test('a file whose rows are all bad cannot be imported and says why', async ({ page }) => {
    await newAudit(page)
    await choose(page, { name: 'bad.csv', text: 'domain,impressions,spend\na.example,lots,10\nb.example,100,-5\n,100,5\nc.example,100,\n' })
    const c = card(page, 'bad.csv')
    for (const m of ['Impressions "lots" is not a number', 'Spend is negative (-5)', 'Domain / app / placement is empty', 'Spend is empty']) await expect(c).toContainText(m)
    await expect(c.getByRole('button', { name: 'Import 0 rows' })).toBeDisabled()
    const r = await saved(page, () => c.getByRole('button', { name: 'Download report' }).click())
    expect(r.name).toBe('bad-validation.csv')
    expect(r.text).toContain('line,issue\n2,"Impressions ""lots"" is not a number"\n')
  })

  test('a truncated last row is skipped with its line number', async ({ page }) => {
    await newAudit(page)
    await choose(page, { name: 'cut.csv', text: 'domain,impressions,spend\na.example,1000,10\nb.example,20' })
    await expect(card(page, 'cut.csv').locator('.report')).toContainText('1 row ready, 1 skipped')
    await expect(card(page, 'cut.csv')).toContainText('line 3 Spend is empty')
  })
})

test('markup in names is shown as text', async ({ page }) => {
  await newAudit(page)
  const evil = '<img src=x onerror=alert(1)>'
  page.on('dialog', () => { throw new Error('script ran') })
  await importFile(page, { name: 'x.csv', text: `domain,campaign,impressions,spend\n"${evil}.example",<b>c</b>,5000,10\n` }, 1)
  await tab(page, 'Placements')
  await expect(page.locator('table.placements')).toContainText(`${evil}.example`)
  await page.locator('table.placements').getByRole('button', { name: 'Block', exact: true }).click()
  await expect(page.locator('table.placements').getByRole('button', { name: 'Reset block' })).toBeVisible()
  expect(await page.locator('table.placements img').count()).toBe(0)
  await page.goto(page.url().replace(/\/placements$/, '/report'))
  await expect(page.getByRole('heading', { name: 'Flagged placements' })).toBeVisible()
  await expect(page.locator('.report-table')).toContainText(`${evil}.example`)
  expect(await page.locator('.report-doc img').count()).toBe(0)
})

test('importing again replaces the report and can be undone', async ({ page }) => {
  await newAudit(page)
  await importFile(page, { name: 'one.csv', text: HAND }, 7)
  await tab(page, 'Data')
  await importFile(page, { name: 'two.csv', text: 'domain,impressions,spend\nz.example,1000,5\n' }, 1)
  await expect(page.getByText('Spend audited').locator('..')).toContainText('$5')
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Spend audited').locator('..')).toContainText('$800')
})
