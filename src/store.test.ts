import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logChange } from './projectData.ts'
import { blankConfig, getData, getProject, saveProject, updateData, updateProject } from './store.ts'

// Node has no IndexedDB, so this runs on the in-memory fallback.
const project = (id: string) => saveProject({ id, name: id, createdAt: 1, updatedAt: 1, config: blankConfig(), snapshots: [], imports: [], changelog: [] })

test('writes started together all land', async () => {
  await project('p')
  const meta = (id: string) => ({ id, kind: 'mfa' as const, fileName: id, rows: 1, skipped: 0, at: 1 })
  await Promise.all([
    updateData('p', d => ({ ...d, freq: [{ frequency: 1, users: 1 }] })),
    updateData('p', d => ({ ...d, knownMfa: [...d.knownMfa, 'a.example'] })),
    updateData('p', d => ({ ...d, knownMfa: [...d.knownMfa, 'b.example'] })),
    logChange('p', 'one', undefined, p => ({ imports: [...p.imports, meta('1')] })),
    logChange('p', 'two', undefined, p => ({ imports: [...p.imports, meta('2')] })),
    updateProject('p', { name: 'renamed' }),
  ])
  assert.deepEqual(await getData('p'), { rows: [], flight: [], freq: [{ frequency: 1, users: 1 }], knownMfa: ['a.example', 'b.example'] })
  const p = getProject('p')!
  assert.deepEqual(p.imports.map(i => i.id), ['1', '2'])
  assert.deepEqual(p.changelog.map(e => e.action), ['one', 'two'])
  assert.equal(p.name, 'renamed')
})

test('a failed step does not block the next one', async () => {
  await project('q')
  await assert.rejects(updateData('q', () => { throw new Error('x') }))
  await updateData('q', d => ({ ...d, knownMfa: ['a.example'] }))
  assert.deepEqual((await getData('q'))!.knownMfa, ['a.example'])
  assert.equal(await updateProject('missing', { name: 'x' }), undefined)
})
