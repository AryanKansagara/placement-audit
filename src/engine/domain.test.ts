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

test('bundles that end like a domain are still apps', () => {
  for (const s of ['com.weather.app', 'com.example.tv', 'com.example.news', 'net.example.io', 'org.example.info', 'com.example.de', 'com.example.game', 'br.com.example.news', 'uk.co.example.player', 'air.com.example.tv', 'de.example.reader', 'tv.example.android']) {
    assert.deepEqual(normalize(s), { key: s, kind: 'app', store: 'android' }, s)
  }
})

test('hosts that start like a bundle are still sites', () => {
  for (const [s, k] of [['nl.example.be', 'example.be'], ['de.example.xyz', 'example.xyz'], ['fr.example.eu', 'example.eu'], ['app.example.ch', 'example.ch'], ['com.example.com', 'example.com'], ['com.example.co.uk', 'example.co.uk'], ['de.example.com', 'example.com'], ['tv.news.example', 'news.example'], ['br.com.example.org', 'example.org'], ['https://com.example.com/app', 'example.com']]) {
    assert.deepEqual(normalize(s), { key: k, kind: 'web' }, s)
  }
})
