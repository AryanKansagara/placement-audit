import type { PlacementKind } from './types.ts'

// Two-level public suffixes common in ad logs. Not the full Public Suffix List; enough for eTLD+1 on real reports.
const MULTI = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'net.nz', 'co.za', 'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'or.kr', 'co.in', 'net.in', 'org.in',
  'com.br', 'net.br', 'org.br', 'com.mx', 'com.ar', 'com.co', 'com.tr', 'com.sg', 'com.my', 'com.ph', 'com.hk', 'com.tw', 'com.cn', 'com.vn',
  'co.id', 'or.id', 'co.il', 'co.th', 'in.th', 'com.pk', 'com.ng', 'com.eg', 'com.sa', 'com.pe', 'com.ua', 'com.pl', 'qc.ca', 'on.ca',
])

// Reverse-DNS app bundles start with these (com.example.game). Domains never do once the scheme is stripped.
const BUNDLE_HEAD = /^(com|net|org|io|tv|air|de|fr|uk|jp|co|me|app|mobi|ru|br|in|es|it|nl|kr|cn)\.[a-z0-9_-]+\.[a-z0-9_.-]+$/i
const TLDS_ONLY_IN_DOMAINS = /\.(com|net|org|io|tv|co|app|me|info|news|biz|us|uk|ca|au|de|fr|example)$/i

export interface Normalized {
  /** Stable key used for grouping and for exclusion lists. */
  key: string
  kind: PlacementKind
  /** Store for apps (ios / android / roku / unknown). */
  store?: 'ios' | 'android' | 'roku' | 'ctv' | 'unknown'
}

/**
 * Normalizes a placement as DSPs export it:
 *  - URLs and hosts → registrable domain (eTLD+1): https://www.news.example.co.uk/a → example.co.uk
 *  - Google Ads app placements (mobileapp::2-com.foo.bar) → com.foo.bar
 *  - iOS store ids (id123456789 or 9-10 digits) and reverse-DNS bundles → app keys
 */
export function normalize(raw: string): Normalized {
  let s = raw.trim().toLowerCase().replace(/^"|"$/g, '')
  if (!s) return { key: '', kind: 'web' }
  // Google Ads: mobileapp::1-<itunes id> / mobileapp::2-<android package>
  const g = s.match(/^mobileapp::(\d)-(.+)$/)
  if (g) return { key: g[1] === '1' ? 'id' + g[2].replace(/^id/, '') : g[2], kind: 'app', store: g[1] === '1' ? 'ios' : 'android' }
  // CTV markers some exports prefix: "ctv:", "roku:"
  const c = s.match(/^(ctv|roku|firetv|tvos|samsung|lg|vizio)[:/](.+)$/)
  if (c) return c[1] === 'roku' ? { key: 'roku:' + c[2].trim(), kind: 'ctv', store: 'roku' } : { key: c[2].trim(), kind: 'ctv', store: 'ctv' }
  if (/^id\d{6,12}$/.test(s)) return { key: s, kind: 'app', store: 'ios' }
  if (/^\d{9,10}$/.test(s)) return { key: 'id' + s, kind: 'app', store: 'ios' }
  if (/^\d{4,8}$/.test(s)) return { key: 'roku:' + s, kind: 'ctv', store: 'roku' }
  // Play store / app store URLs
  const play = s.match(/play\.google\.com\/store\/apps\/details\?id=([\w.]+)/)
  if (play) return { key: play[1], kind: 'app', store: 'android' }
  const apple = s.match(/apps\.apple\.com\/.*\/id(\d+)/)
  if (apple) return { key: 'id' + apple[1], kind: 'app', store: 'ios' }
  if (!s.includes('/') && BUNDLE_HEAD.test(s) && !TLDS_ONLY_IN_DOMAINS.test(s)) return { key: s, kind: 'app', store: 'android' }
  // Web: strip scheme, credentials, path, port, trailing dot
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^[^@/]*@/, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return { key: s, kind: 'web' }
  const parts = s.split('.').filter(Boolean)
  if (parts.length < 2) return { key: s, kind: 'web' }
  const two = parts.slice(-2).join('.')
  const n = MULTI.has(two) ? 3 : 2
  return { key: parts.slice(-n).join('.'), kind: 'web' }
}

const SLIDESHOW = /(slide|gallery|quiz|trivia|celeb|viral|buzz|clickbait|you-?wont|wont-?believe|top-?\d+|\d+-?things|photos|pics|unbeliev|shock|amazing|daily-?(tips|facts)|lifehack|hacks|trendin|recipes?-?daily)/

/**
 * Suspicious-looking domain patterns: long hyphenated slideshow-style names and random-looking strings.
 * Returns a reason or null. Apps and CTV are never judged on name shape.
 */
export function domainPattern(key: string, kind: PlacementKind): string | null {
  if (kind !== 'web') return null
  const label = key.split('.')[0]
  const hyphens = (label.match(/-/g) ?? []).length
  if (SLIDESHOW.test(label) && (hyphens >= 1 || label.length >= 14)) return 'slideshow-style name'
  if (hyphens >= 3) return `${hyphens} hyphens in the name`
  if (label.length >= 22 && hyphens >= 2) return 'very long hyphenated name'
  const letters = label.replace(/[^a-z]/g, '')
  const digits = label.replace(/[^0-9]/g, '').length
  const vowels = (letters.match(/[aeiouy]/g) ?? []).length
  if (label.length >= 8 && digits >= 3 && letters.length >= 4) return 'random-looking string with digits'
  if (letters.length >= 9 && vowels / letters.length < 0.18) return 'random-looking string'
  if (/[bcdfghjklmnpqrstvwxz]{6,}/.test(letters)) return 'random-looking string'
  return null
}
