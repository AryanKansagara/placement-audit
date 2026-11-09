// Synthetic campaigns. Every domain, app and company here is invented (.example domains, com.example bundles).
import { runAudit } from './audit.ts'
import { snapshotOf, type Snapshot } from './exports.ts'
import { dayNum, dayStr } from './pacing.ts'
import { DEFAULT_CONFIG, type Config, type Dataset, type FlightLine, type FreqBucket, type PlacementRow } from './types.ts'

export interface SampleDef {
  id: string
  name: string
  blurb: string
  seed: number
  from: string
  to: string
  lines: FlightLine[]
  total: number // spend over the data window
  junkShare: number // share of spend on junk inventory
  revenue?: number // revenue per conversion, for ROAS samples
  kind: 'native' | 'ctv' | 'display'
  config?: Partial<Config>
}

export const SAMPLES: SampleDef[] = [
  {
    id: 'northwind', name: 'Northwind Cloud: B2B native', kind: 'native', seed: 11,
    blurb: 'Native lead-gen for a SaaS brand. A long tail of slideshow domains eats about a fifth of spend.',
    from: '2026-10-15', to: '2026-11-07', total: 86_000, junkShare: 0.22,
    lines: [
      { line: 'NW | Native | Prospecting', budget: 120_000, start: '2026-10-15', end: '2026-11-30' },
      { line: 'NW | Native | Retargeting', budget: 36_000, start: '2026-10-15', end: '2026-11-30' },
    ],
  },
  {
    id: 'lumen', name: 'Lumen Streaming: CTV + in-app', kind: 'ctv', seed: 29,
    blurb: 'A subscription launch on CTV and mobile apps. Heavy frequency waste, junk apps, and a flight running behind.',
    from: '2026-11-01', to: '2026-11-07', total: 41_000, junkShare: 0.14,
    lines: [
      { line: 'LUMEN | CTV | Launch', budget: 150_000, start: '2026-11-01', end: '2026-11-30' },
      { line: 'LUMEN | In-app | Launch', budget: 60_000, start: '2026-11-01', end: '2026-11-30' },
    ],
    config: { freqCap: 6 },
  },
  {
    id: 'harbor', name: 'Harbor & Pine: retail display (ROAS)', kind: 'display', seed: 47, revenue: 92,
    blurb: 'Open-web display for an online furniture shop, measured on ROAS. Cheap inventory that never sells.',
    from: '2026-10-20', to: '2026-11-07', total: 52_000, junkShare: 0.17,
    lines: [{ line: 'HP | Display | Holiday', budget: 95_000, start: '2026-10-20', end: '2026-12-15' }],
    config: { goal: 'roas' },
  },
]

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const GOOD_WEB = ['cloudops-journal', 'devweekly', 'saasbrief', 'cfo-insider', 'techledger', 'datacenter-dive', 'infraweekly', 'securityreview', 'buildersnotes', 'stackreader', 'productpulse', 'growthdesk', 'revopsreport', 'itleaders', 'thecloudpost', 'engineeringdaily', 'opsquarterly', 'b2bmarketer', 'finance-times-ish', 'cxomonthly', 'startupgazette', 'analyticsbeat', 'developertimes', 'networkworld-ish', 'clouddigest', 'mlreview', 'workplacetech', 'hrtechnews', 'smbadvisor', 'venturewire', 'citywire-news', 'morningledger', 'thedatabrief', 'remotework-hq', 'salesopsdaily', 'digitalcfo', 'automation-today', 'platformnews', 'bizjournalist', 'theopsletter', 'saasmetrics', 'cloudnative-news', 'techboardroom', 'enterpriseweek', 'apiweekly', 'kubeletter', 'devsecops-news', 'outsideweather', 'dailyrecipes', 'hometheory', 'sportsfinal', 'localnews-metro', 'healthwise', 'travelnotes', 'parentingpost', 'scienceline', 'autoreview', 'gardenweekly', 'moneysense-ish', 'carefulshopper']
const JUNK_WEB = ['top-10-celeb-photos-daily', 'you-wont-believe-these-pics', 'amazing-facts-slideshow-hub', 'trivia-quiz-zone-daily', 'viral-buzz-gallery', 'shocking-before-after-photos', 'daily-tips-and-life-hacks', 'celebs-then-and-now-gallery', 'top-50-things-you-missed', 'unbelievable-pics-today', 'the-best-recipes-daily-slides', 'quiz-time-trivia-world', 'xkqzv7381-news', 'brtnmlx', 'trendin-now-photos', 'fact-finder-slideshow', 'buzz-worthy-gallery-now', 'health-tips-slideshow-daily', 'money-hacks-top-20-list', 'pet-pics-gallery-daily', 'travel-photos-you-must-see', 'home-hacks-top-25-list', 'retro-celeb-gallery-hub', 'zqw88412media', 'dailyfeedhub', 'newsfeed-aggregate-247', 'quick-quiz-play-now', 'gallery-of-the-day', 'insane-facts-top-100', 'auto-pics-slideshow-hub', 'kwrtpxl', 'sports-bloopers-gallery', 'house-flip-photos-daily', 'mom-hacks-list-of-30', 'garden-tips-gallery-daily', 'weird-history-photos-hub', 'tech-gadget-gallery-10', 'diet-hacks-top-15-list', 'royal-family-photo-gallery', 'old-movies-trivia-quiz']
const GOOD_CTV = ['ctv:northlight-tv', 'ctv:cinemaplex-channel', 'ctv:newsnow-live', 'ctv:sportsdesk-tv', 'ctv:homeandgarden-tv', 'ctv:kidszone-channel', 'ctv:docuverse', 'ctv:foodnetwork-ish', 'ctv:comedycellar-tv', 'ctv:outdoors-channel', 'roku:418822', 'roku:503311', 'roku:611207', 'roku:702955', 'roku:388104', 'ctv:streamhub-movies', 'ctv:musicbox-live', 'ctv:classic-tv-plus', 'ctv:weather-now', 'ctv:anime-stream-x']
const JUNK_CTV = ['roku:990417', 'roku:990522', 'ctv:screensaver-fireplace', 'ctv:aquarium-4k-loop', 'roku:991184', 'ctv:free-movies-247-loop', 'ctv:radio-visualizer']
const GOOD_APP = ['com.example.newsreader', 'com.example.weatherpro', 'com.example.recipebox', 'com.example.fitnesscoach', 'id1900000101', 'id1900000117', 'com.example.podcastplayer', 'com.example.sudokuclassic', 'com.example.transitmaps', 'id1900000142', 'com.example.bookclub', 'com.example.chesspro']
const JUNK_APP = ['com.example.flashlightultra', 'com.example.junkcleanerboost', 'com.example.batterysaverpro', 'id1900000966', 'com.example.wallpaperhd4k', 'com.example.qrscannerfree', 'com.example.vpnfastfree', 'id1900000981']

const tld = (s: string) => (s.includes(':') || s.startsWith('com.') || /^id\d/.test(s) ? s : s + '.example')

export function generate(def: SampleDef, opts: { from?: string; to?: string; junkShare?: number; seed?: number } = {}): Dataset {
  const r = rng(opts.seed ?? def.seed)
  const from = opts.from ?? def.from, to = opts.to ?? def.to
  const junkShare = opts.junkShare ?? def.junkShare
  const days: string[] = []
  for (let d = dayNum(from); d <= dayNum(to); d++) days.push(dayStr(d))
  const pick = <T,>(xs: T[], n: number) => xs.slice(0, n)
  const good = def.kind === 'ctv' ? [...GOOD_CTV, ...GOOD_APP] : pick(GOOD_WEB, def.kind === 'native' ? 60 : 48).concat(def.kind === 'display' ? GOOD_APP.slice(0, 6) : [])
  const junk = def.kind === 'ctv' ? [...JUNK_CTV, ...JUNK_APP] : pick(JUNK_WEB, def.kind === 'native' ? 40 : 28).concat(def.kind === 'display' ? JUNK_APP.slice(0, 4) : [])
  const zipf = (n: number) => Array.from({ length: n }, (_, i) => 1 / Math.pow(i + 1.5, 0.95) * (0.7 + 0.6 * r()))
  const gw = zipf(good.length), jw = zipf(junk.length).map(w => Math.pow(w, 0.4)) // junk is a flatter long tail
  const gs = gw.reduce((a, b) => a + b, 0), js = jw.reduce((a, b) => a + b, 0)

  // A few legit placements carry one weak signal so the score has a visible middle band.
  const gray = new Set([5, 13, 22, 31].filter(i => i < good.length))
  type Profile = { cpm: number; ctr: number; cvr: number; view: number | undefined; ivt: number; freq: number }
  const profile = (isJunk: boolean, i: number, key: string): Profile => {
    const isCtv = key.startsWith('ctv:') || key.startsWith('roku:')
    const isApp = !isCtv && !key.includes('-') && (key.startsWith('com.') || key.startsWith('id'))
    if (def.kind === 'ctv') {
      if (isJunk) return { cpm: isCtv ? 9 + 5 * r() : 1.2 + r(), ctr: isCtv ? 0 : 0.02 + 0.02 * r(), cvr: 0.000002, view: isCtv ? undefined : 0.3 + 0.12 * r(), ivt: 0.12 + 0.3 * r(), freq: isCtv ? 14 + 10 * r() : 9 + 6 * r() }
      return { cpm: isCtv ? 28 + 10 * r() : 6 + 4 * r(), ctr: isCtv ? 0 : 0.004 + 0.003 * r(), cvr: isCtv ? 0.00006 + 0.00004 * r() : 0.00012 + 0.0001 * r(), view: isCtv ? undefined : 0.62 + 0.2 * r(), ivt: 0.004 + 0.012 * r(), freq: isCtv ? 4 + 5 * r() : 3 + 3 * r() }
    }
    if (isJunk) return { cpm: 2.2 + 2.2 * r(), ctr: 0.009 + 0.008 * r(), cvr: r() < 0.35 ? 0.000004 : 0, view: 0.22 + 0.2 * r(), ivt: 0.07 + 0.38 * r(), freq: 4 + 4 * r() }
    const base: Profile = { cpm: (def.kind === 'native' ? 9.5 : 6.5) + 4 * r(), ctr: (def.kind === 'native' ? 0.0022 : 0.0011) * (0.7 + 0.6 * r()), cvr: (def.kind === 'native' ? 0.0005 : 0.00032) * (0.4 + 1.2 * r()), view: 0.6 + 0.22 * r(), ivt: 0.004 + 0.014 * r(), freq: 1.6 + 2.4 * r() }
    if (isApp) base.view = 0.55 + 0.2 * r()
    if (gray.has(i)) base.view = 0.42 + 0.05 * r()
    return base
  }

  const rows: PlacementRow[] = []
  const lines = def.lines.map(l => l.line)
  const lineShare = def.lines.map(l => l.budget)
  const lsum = lineShare.reduce((a, b) => a + b, 0)
  const emit = (key: string, spend: number, p: Profile, i: number) => {
    // CTV channels go to the CTV line, apps to the in-app line; native retargeting gets the top quality domains.
    let li = 0
    if (lines.length > 1) {
      if (def.kind === 'ctv') li = key.startsWith('ctv:') || key.startsWith('roku:') ? 0 : 1
      else li = i % 5 === 1 && !key.includes('-') ? 1 : r() < lineShare[1] / lsum * 0.3 ? 1 : 0
    }
    for (let d = 0; d < days.length; d++) {
      // Ramp-up over the first days and weekday dips; CTV runs behind plan (under-delivery).
      const ramp = Math.min(1, 0.45 + d * 0.12)
      const dow = new Date(days[d] + 'T00:00:00Z').getUTCDay()
      const weekend = dow === 0 || dow === 6 ? 0.8 : 1.05
      const dayShare = ramp * weekend * (0.85 + 0.3 * r())
      const s = spend / days.length * dayShare
      if (s < 0.5) continue
      const impressions = Math.max(1, Math.round(s / p.cpm * 1000))
      const clicks = Math.round(impressions * p.ctr * (0.8 + 0.4 * r()))
      const expConv = impressions * p.cvr
      const conversions = Math.floor(expConv) + (r() < expConv % 1 ? 1 : 0)
      rows.push({
        date: days[d], campaign: def.name.split(':')[0], line: lines[li], placement: rawLabel(key, r),
        impressions, clicks, conversions, spend: Math.round(s * 100) / 100,
        ...(def.revenue ? { revenue: Math.round(conversions * def.revenue * (0.6 + 0.8 * r()) * 100) / 100 } : {}),
        ...(p.view !== undefined ? { viewability: Math.round(p.view * 1000) / 1000 } : {}),
        ivt: Math.round(p.ivt * 1000) / 1000, frequency: Math.round(p.freq * 10) / 10,
      })
    }
  }
  good.forEach((k, i) => emit(tld(k), def.total * (1 - junkShare) * gw[i] / gs, profile(false, i, k), i))
  junk.forEach((k, i) => emit(tld(k), def.total * junkShare * jw[i] / js, profile(true, i, k), i + 1000))

  const freq: FreqBucket[] = def.kind === 'ctv'
    ? [[1, 182000], [2, 96000], [3, 61000], [4, 42000], [5, 30500], [6, 22800], [7, 17400], [8, 13900], [9, 11200], [10, 9300], [12, 14200], [15, 11800], [20, 9600], [30, 6100]].map(([f, u]) => ({ frequency: f, users: u, impressions: f * u }))
    : []
  return { rows, flight: def.lines, freq, knownMfa: [] }
}

/** Exports rarely agree on how a placement is written: mix in www., full URLs and subdomains. */
function rawLabel(key: string, r: () => number): string {
  if (key.includes(':') || key.startsWith('com.') || /^id\d/.test(key)) return key
  const x = r()
  if (x < 0.15) return 'www.' + key
  if (x < 0.22) return `https://${key}/article/${Math.floor(r() * 9000)}`
  if (x < 0.27) return 'm.' + key
  return key
}

export const sampleConfig = (def: SampleDef): Config => ({ ...DEFAULT_CONFIG, ...def.config, overrides: {} })

/** An earlier audit period (before exclusions) so the compare view has history. Some junk keeps leaking. */
export function sampleHistory(def: SampleDef, id: () => string): Snapshot[] {
  const len = dayNum(def.to) - dayNum(def.from) + 1
  const prevTo = dayStr(dayNum(def.from) - 1)
  const prevFrom = dayStr(dayNum(def.from) - Math.max(7, Math.min(14, len)))
  const ds = generate(def, { from: prevFrom, to: prevTo, junkShare: Math.min(0.45, def.junkShare * 1.45), seed: def.seed + 100 })
  const a = runAudit(ds, sampleConfig(def))
  return [snapshotOf(a, id(), `Baseline ${prevFrom.slice(5)} to ${prevTo.slice(5)}`, Date.parse(prevTo + 'T18:00:00Z'))]
}

/** The sample as the CSV a DSP would export, for rehearsing the import. */
export function toExportCsv(ds: Dataset): string {
  const head = ['Date', 'Campaign', 'Line Item', 'Domain', 'Impressions', 'Clicks', 'Conversions', 'Spend', 'Conversion Value', 'Viewability', 'IVT Rate', 'Avg Frequency']
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return [head.join(','), ...ds.rows.map(r => [r.date ?? '', r.campaign ?? '', r.line ?? '', r.placement, r.impressions, r.clicks, r.conversions, r.spend.toFixed(2), r.revenue?.toFixed(2) ?? '', r.viewability !== undefined ? (r.viewability * 100).toFixed(1) + '%' : '', r.ivt !== undefined ? (r.ivt * 100).toFixed(1) + '%' : '', r.frequency ?? ''].map(v => esc(String(v))).join(','))].join('\n') + '\n'
}
