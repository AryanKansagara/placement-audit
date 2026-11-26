import type { PlacementKind } from './types.ts'

// Second-level labels that are public suffixes under these country codes, from the Public Suffix List
// (publicsuffix.org, version 2026-11-24, ICANN section). Regional and industry suffixes beyond MULTI are not included.
const SECOND_LEVEL: Record<string, string> = {
  com: 'ac af ag ai al am ar au aw az ba bb bd bh bi bj bm bn bo br bs bt by bz ci cm cn co cu cv cw cy dm do dz ec ee eg es et fj fm fr ge gh gi gl gn gp gr gt gu gy hk hn hr ht im in io iq jo kg kh ki km kp kw ky kz la lb lc lk lr lv ly mg mk ml mo ms mt mu mv mw mx my na nf ng ni nr om pa pe pf ph pk pl pr ps pt py qa re ro sa sb sc sd sg sh sl sn so ss st sv sy tj tm tn to tr tt tw ua ug uy uz vc ve vi vn vu ws ye zm',
  net: 'ac ae af ag ai al am ar au az ba bb bd bh bj bm bn bo br bs bt bw bz ci cm cn co cu cv cw cy dm do dz ec eg et fj fm ge gg gh gl gn gp gr gt gu gy hk hn ht id il im in io iq ir je jo kg kh ki kn kw ky kz la lb lc lk lr ls lv ly ma me mk ml mo ms mt mu mv mw mx my mz na nf ng ni nr nz om pa pe ph pk pl pn pr ps pt py qa rw sa sb sc sd sg sh sl so ss st sy th tj tm tn to tr tt tw ua uk uy uz vc ve vi vn vu ws ye zm',
  org: 'ac ae af ag ai al am ao ar au az ba bb bd bh bi bj bm bn bo br bs bt bw bz ci cn co cu cv cw cy dm do dz ec ee eg es et fj fm ge gg gh gi gl gn gp gr gt gu gy hk hn ht hu il im in io iq ir je jo kg kh ki km kn kp kw ky kz la lb lc lk lr ls lv ly ma me mg mk ml mn mo ms mt mu mv mw mx my mz na ng ni nr nz om pa pe pf ph pk pl pn pr ps pt py qa ro rs rw sa sb sc sd se sg sh sk sl sn so ss st sv sy sz tj tm tn to tr tt tw ua ug uk uy uz vc ve vi vn vu ws ye zm zw',
  edu: 'ac af al ao ar au az ba bb bd bh bi bj bm bn bo br bs bt bz ci cn co cu cv cw dm do dz ec ee eg es et fj fm gd ge gh gi gl gn gp gr gt gu gy hk hn ht in io iq it jo kg kh ki km kn kp kw ky kz la lb lc lk lr ls lv ly me mg mk ml mn mo ms mt mv mw mx my mz ng ni nr om pa pe pf ph pk pl pn pr ps pt py qa rs sa sb sc sd sg sl sn so ss st sv sy tj tm to tr tt tw ua ug uy vc ve vg vn vu ws ye zm',
  gov: 'ac ae af al ao ar as au az ba bb bd bf bh bm bn br bs bt bw by bz cd cl cm cn co cx cy cz dm do dz ec ee eg et fj gd ge gh gi gn gr gu gy hk ie il in io iq ir it jo kg kh ki km kn kp kw kz la lb lc lk lr ls lt lv ly ma me mg mk ml mn mo mr ms mu mv mw my mz na ng nr om ph pk pl pn pr ps pt pw py qa rs rw sa sb sc sd sg sh sl so ss sx sy tj tl tm tn to tr tt tw ua ug uk vc ve vn ws ye zm zw',
  co: 'ae ag am ao at az bb bd bi bj bw bz ci cl cm cr dm gg gl gy hu id il im in io ir it je jp ke kr lc ls ma me mg mu mw mz na ni nz om pn rs rw ss st sz th tj tm tt tz ug uk us uz ve vi zm zw',
  ac: 'ae at bd be bw ci cn cr cy eg fj gn id il im in ir jp ke kr lk ls ma me ml mu mw mz ni nz pa pk pr rs rw se sz th tz ug uk vn zm zw',
  mil: 'ac ae al ar az ba bd bo br by cl cn co cy do ec eg fj gh gt hn id in io iq jo kg km kr kz lv mg mv my mz ng ni no nz pe ph pl py qa rw sh st sy tj tm to tr tt tw tz ug uy vc ve ye zm zw',
  gob: 'ar bo cl cu do ec es gt hn mx ni pa pe pk sv ve',
  go: 'ci cr id it jp ke kr th tj tz ug',
  ne: 'jp ke kr tz ug us',
  or: 'at bi ci cr id it jp ke kr mu th tz ug us',
  gouv: 'ci fr ht km ml sn',
  info: 'az bb bd bj bo ec eg et fj gu ht hu in ke ki la ls ml mv nf ni nr pl pr ro sd tn tr tt tz ve vn zm',
  biz: 'az bb cy et fj gh id in ki ls mv mw my ni nr pk pl pr ss tj tr tt vn zm',
  nom: 'ag co es fr io km mg nc ni pa pe pl ro tm ve',
  sch: 'ae bd id ir jo lk ly ng qa sa ss zm',
  web: 'bo do gu id lk nf ni pk tj tr ve',
  pro: 'az br cy ec fj ht in mv om pr tt vn',
  name: 'az eg et fj hr mk mv my ng pr qa tj tr tt vn',
}
// Every second level under these country codes is a suffix (*.np and so on).
const WILDCARD = new Set(['ck', 'er', 'fk', 'jm', 'mm', 'np', 'pg'])
// Shared hosts in the list's private section: each customer is a separate site.
const SHARED = ['blogspot.com', 'github.io', 'gitlab.io', 'wixsite.com', 'netlify.app', 'vercel.app', 'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com', 'herokuapp.com', 'myshopify.com', 'altervista.org']

// Two-level public suffixes. Not the full Public Suffix List; enough for eTLD+1 on real reports.
const MULTI = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'net.nz', 'co.za', 'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'or.kr', 'co.in', 'net.in', 'org.in',
  'com.br', 'net.br', 'org.br', 'com.mx', 'com.ar', 'com.co', 'com.tr', 'com.sg', 'com.my', 'com.ph', 'com.hk', 'com.tw', 'com.cn', 'com.vn',
  'co.id', 'or.id', 'co.il', 'co.th', 'in.th', 'com.pk', 'com.ng', 'com.eg', 'com.sa', 'com.pe', 'com.ua', 'com.pl', 'qc.ca', 'on.ca',
  ...Object.entries(SECOND_LEVEL).flatMap(([l, ccs]) => ccs.split(' ').map(cc => `${l}.${cc}`)), ...SHARED,
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
  // "App name (com.bundle.id)" or "App name (id123456789)" as some app reports label them
  const named = s.match(/\(\s*((?:id)?\d{9,10}|[a-z][\w-]*(?:\.[\w-]+){2,})\s*\)$/)
  if (named && !s.startsWith('(')) return normalize(named[1])
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
  const n = MULTI.has(two) || WILDCARD.has(parts[parts.length - 1]) ? 3 : 2
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
