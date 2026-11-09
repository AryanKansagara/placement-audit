export type PlacementKind = 'web' | 'app' | 'ctv'

/** One row of a placement / domain / app report, after mapping. Rates are 0..1. */
export interface PlacementRow {
  date?: string // YYYY-MM-DD when the export is broken out by day
  campaign?: string
  line?: string // line item / ad group / ad set
  placement: string // raw domain, URL, app name or bundle id as exported
  impressions: number
  clicks: number
  conversions: number
  spend: number
  revenue?: number
  viewability?: number
  ivt?: number
  frequency?: number // average impressions per user on this placement
}

/** Flight plan: one line item with a budget and dates (inclusive). */
export interface FlightLine {
  line: string
  budget: number
  start: string
  end: string
}

/** One bucket of a frequency distribution report: `users` people saw the ad `frequency` times. */
export interface FreqBucket {
  frequency: number
  users: number
  impressions?: number
  conversions?: number
}

export interface Dataset {
  rows: PlacementRow[]
  flight: FlightLine[]
  freq: FreqBucket[]
  /** Uploaded known-MFA / block list (normalized keys). */
  knownMfa: string[]
}

export type Override = 'allow' | 'block'

export interface Config {
  /** Score at or above which a placement is flagged. */
  threshold: number
  /** Effective frequency cap: impressions per user beyond this are counted as waste. */
  freqCap: number
  /** Placements under this many impressions are not scored on statistical signals. */
  minImpressions: number
  /** Viewability below this counts against a placement. */
  minViewability: number
  /** IVT above this counts against a placement. */
  maxIvt: number
  goal: 'cpa' | 'roas'
  overrides: Record<string, Override>
}

export const DEFAULT_CONFIG: Config = {
  threshold: 40,
  freqCap: 6,
  minImpressions: 1000,
  minViewability: 0.5,
  maxIvt: 0.05,
  goal: 'cpa',
  overrides: {},
}

export const EMPTY_DATASET: Dataset = { rows: [], flight: [], freq: [], knownMfa: [] }
