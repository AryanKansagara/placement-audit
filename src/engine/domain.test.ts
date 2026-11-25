import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize } from './domain.ts'

const key = (s: string) => normalize(s).key

test('country suffixes follow the Public Suffix List', () => {
  for (const s of ['co.ke', 'com.ec', 'com.uy', 'gob.mx', 'com.gh', 'com.np', 'org.jm', 'co.zw', 'com.gr', 'co.uk', 'com.au']) {
    assert.equal(key(`https://www.junk.${s}/a`), `junk.${s}`)
    assert.equal(key(`junk.${s}`), `junk.${s}`)
    assert.equal(key(s), s)
  }
  assert.equal(key('a.b.junk.blogspot.com'), 'junk.blogspot.com')
  assert.equal(key('docs.user.github.io'), 'user.github.io')
})

test('ordinary domains are still the last two labels', () => {
  for (const s of ['example.com', 'example.de', 'example.ke', 't.co', 'example.example', 'co.example']) assert.equal(key(`www.${s}`), s)
  assert.equal(key('www.go.com'), 'go.com')
})
