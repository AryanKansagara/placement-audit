import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { SIGNALS, type Audit, type Placement } from './engine/audit.ts'
import type { LinePacing } from './engine/pacing.ts'
import type { Dataset, Override } from './engine/types.ts'
import { logChange, useAudit, useProject } from './projectData.ts'
import { uuid, type Project } from './store.ts'
import { snapshotOf } from './engine/exports.ts'
import { Treemap } from './Treemap.tsx'
import { fmtPct, fmtUsd, go, isTyping, Link, Modal, SyntheticBadge, toast } from './ui.tsx'

const Panels = lazy(() => import('./Panels.tsx'))
const DataTab = lazy(() => import('./Import.tsx'))

export const TABS = [
  ['overview', 'Overview'], ['placements', 'Placements'], ['pacing', 'Pacing & frequency'], ['exclusions', 'Exclusions'], ['history', 'History'], ['data', 'Data'],
] as const
export type Tab = (typeof TABS)[number][0]

export interface TabProps {
  project: Project
  ds: Dataset
  audit: Audit
  pace: LinePacing[]
  update(p: Partial<Project>): void
  setOverride(key: string, v: Override | null): void
  openPlacement(key: string): void
  saveSnapshot(): void
}

export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmtCpa = (n: number | null) => (n === null ? '—' : fmtUsd(n, 2))
export const fmtRoas = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)}x`)
export const KIND_LABEL = { web: 'Web', app: 'App', ctv: 'CTV' } as const

export default function ProjectView({ id, tab: rawTab }: { id: string; tab: string }) {
  const { loading, project, ds, setConfig, update, reload } = useProject(id)
  const tab = (TABS.some(t => t[0] === rawTab) ? rawTab : 'overview') as Tab
  const { audit, pace } = useAudit(ds, project?.config)
  const [help, setHelp] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => { if (project) document.title = `${project.name} · Placement Audit` }, [project?.name])

  const setTab = (t: Tab) => go(`/app/p/${id}${t === 'overview' ? '' : '/' + t}`, { keepScroll: true })

  const setOverride = (key: string, v: Override | null) => {
    if (!project) return
    const before = project.config.overrides
    const overrides = { ...before }
    if (v) overrides[key] = v
    else delete overrides[key]
    void logChange(id, v === 'allow' ? 'Allowed placement' : v === 'block' ? 'Blocked placement' : 'Cleared override', key, { config: { ...project.config, overrides } })
    toast(v ? `${v === 'allow' ? 'Allowed' : 'Blocked'} ${key}` : `Cleared override on ${key}`, { undo: () => void logChange(id, 'Undid override', key, { config: { ...project.config, overrides: before } }) })
  }

  const saveSnapshot = () => {
    if (!project || !audit) return
    const label = audit.period.from ? `${audit.period.from} to ${audit.period.to}` : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const snap = snapshotOf(audit, uuid(), label)
    const prev = project.snapshots
    void logChange(id, 'Snapshot saved', `${label}: ${fmtUsd(audit.spendAtRisk)} at risk (${fmtPct(audit.riskShare, 1)})`, { snapshots: [...prev, snap] })
    toast(`Saved a snapshot of ${label}`, { tone: 'ok', undo: () => void update({ snapshots: prev }) })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return
      const n = Number(e.key)
      if (n >= 1 && n <= TABS.length) { e.preventDefault(); setTab(TABS[n - 1][0]) }
      else if (e.key === '?') setHelp(true)
      else if (e.key === 's' && audit) saveSnapshot()
      else if (e.key === 'p' && audit) go(`/app/p/${id}/report`)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  if (loading) return <div className="boot" role="status"><span className="spinner" /> Scoring placements</div>
  if (!project) return (
    <section className="page narrow center">
      <h1>Audit not found</h1>
      <p className="muted">It may have been deleted, or it lives on another device and has not synced yet.</p>
      <Link href="/app" className="btn primary">Back to audits</Link>
    </section>
  )

  const noData = !audit
  const effectiveTab: Tab = noData ? 'data' : tab
  const cfg = project.config
  const sel = detail && audit ? audit.placements.find(p => p.key === detail) ?? null : null

  return (
    <section className="page project">
      <div className="project-head">
        <div className="crumbs"><Link href="/app">Audits</Link><span aria-hidden="true">/</span></div>
        <div className="row between wrap gap">
          <div className="row gap-sm wrap">
            <h1 className="project-title">{project.name}</h1>
            {project.sampleId && <SyntheticBadge />}
          </div>
          {audit && (
            <div className="row gap-sm wrap">
              <Link href={`/app/p/${id}/report`} className="btn primary sm" title="Shortcut: P">Client report</Link>
              <Link href={`/app/p/${id}/exclusions`} className="btn ghost sm">Exclusion lists</Link>
              <button type="button" className="btn ghost sm" onClick={saveSnapshot} title="Shortcut: S">Save snapshot</button>
            </div>
          )}
        </div>
        {audit && (
          <div className="controls">
            <label className="ctl"><span>Flag at score</span>
              <input type="number" min="5" max="100" step="5" value={cfg.threshold} onChange={e => { const v = Number(e.target.value); if (v >= 5 && v <= 100) void setConfig({ threshold: v }) }} />
            </label>
            <label className="ctl"><span>Viewability floor %</span>
              <input type="number" min="0" max="100" step="5" value={Math.round(cfg.minViewability * 100)} onChange={e => { const v = Number(e.target.value); if (v >= 0 && v <= 100) void setConfig({ minViewability: v / 100 }) }} />
            </label>
            <label className="ctl"><span>IVT limit %</span>
              <input type="number" min="0.5" max="50" step="0.5" value={+(cfg.maxIvt * 100).toFixed(1)} onChange={e => { const v = Number(e.target.value); if (v > 0 && v <= 50) void setConfig({ maxIvt: v / 100 }) }} />
            </label>
            <label className="ctl"><span>Frequency cap</span>
              <input type="number" min="1" max="50" step="1" value={cfg.freqCap} onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= 50) void setConfig({ freqCap: v }) }} />
            </label>
            <label className="ctl"><span>Min impressions</span>
              <input type="number" min="0" step="500" value={cfg.minImpressions} onChange={e => { const v = Number(e.target.value); if (v >= 0) void setConfig({ minImpressions: v }) }} />
            </label>
            <label className="ctl"><span>Goal</span>
              <select value={cfg.goal} onChange={e => void setConfig({ goal: e.target.value as 'cpa' | 'roas' })}><option value="cpa">CPA</option><option value="roas">ROAS</option></select>
            </label>
          </div>
        )}
        <nav className="tabs" aria-label="Audit sections">
          {TABS.map(([t, label], i) => (
            <Link key={t} href={`/app/p/${id}${t === 'overview' ? '' : '/' + t}`} aria-current={effectiveTab === t ? 'page' : undefined} className={noData && t !== 'data' ? 'disabled' : ''} title={`Shortcut: ${i + 1}`}>
              {label}
              {t === 'placements' && audit && audit.flagged.length > 0 && <span className="count bad">{audit.flagged.length}</span>}
              {t === 'pacing' && pace.some(p => p.status === 'under' || p.status === 'over') && <span className="count warn">{pace.filter(p => p.status === 'under' || p.status === 'over').length}</span>}
              {t === 'history' && project.snapshots.length > 0 && <span className="count">{project.snapshots.length}</span>}
            </Link>
          ))}
          <button type="button" className="linkish small kbd-help" onClick={() => setHelp(true)}>Shortcuts <kbd>?</kbd></button>
        </nav>
      </div>

      <Suspense fallback={<div className="boot" role="status"><span className="spinner" /> Loading</div>}>
        {effectiveTab === 'data' || !audit || !ds
          ? <DataTab project={project} ds={ds} update={update} reload={reload} />
          : (() => {
            const props: TabProps = { project, ds, audit, pace, update, setOverride, openPlacement: setDetail, saveSnapshot }
            if (effectiveTab === 'overview') return <Overview {...props} onTab={setTab} />
            if (effectiveTab === 'placements') return <Placements {...props} />
            return <Panels {...props} tab={effectiveTab} />
          })()}
      </Suspense>

      <Modal open={!!sel} onClose={() => setDetail(null)} title={sel?.key ?? ''} wide>
        {sel && audit && <PlacementDetail p={sel} audit={audit} threshold={cfg.threshold} setOverride={setOverride} />}
      </Modal>

      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <dl className="shortcuts">
          <div><dt><kbd>1</kbd>&ndash;<kbd>6</kbd></dt><dd>Switch tabs</dd></div>
          <div><dt><kbd>S</kbd></dt><dd>Save a snapshot of this audit</dd></div>
          <div><dt><kbd>P</kbd></dt><dd>Open the printable client report</dd></div>
          <div><dt><kbd>/</kbd></dt><dd>Search placements</dd></div>
          <div><dt><kbd>&#8984;</kbd>/<kbd>Ctrl</kbd> <kbd>Z</kbd></dt><dd>Undo the last override or delete</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>This list</dd></div>
        </dl>
      </Modal>
    </section>
  )
}

// ---------- Placement detail ----------

function PlacementDetail({ p, audit, threshold, setOverride }: { p: Placement; audit: Audit; threshold: number; setOverride(k: string, v: Override | null): void }) {
  return (
    <div className="stack-md">
      <div className="row gap-sm wrap">
        <span className={`chip ${p.flagged ? 'bad' : p.score >= 15 ? 'warn' : 'good'}`}>{p.flagged ? 'Flagged' : p.score >= 15 ? 'Watch' : 'Clean'}</span>
        <span className="chip">{KIND_LABEL[p.kind]}</span>
        {p.override && <span className="chip">Override: {p.override}</span>}
        {p.raw.some(r => r.toLowerCase() !== p.key) && <span className="muted small">Seen as {p.raw.slice(0, 3).join(', ')}</span>}
      </div>
      <div className="score-meter" aria-label={`Risk score ${p.score} of 100; flag threshold ${threshold}`}>
        <div className="score-track"><span style={{ width: `${p.score}%` }} className={p.flagged ? 'bad' : ''} /><i style={{ left: `${threshold}%` }} title={`Threshold ${threshold}`} /></div>
        <b>{p.score}</b><small>/ 100</small>
      </div>
      {p.signals.length ? (
        <table className="data compact">
          <thead><tr><th>Signal</th><th>Evidence</th><th className="num">Points</th></tr></thead>
          <tbody>{p.signals.map(s => <tr key={s.id}><th scope="row">{SIGNALS[s.id].label}</th><td>{s.detail}</td><td className="num">+{s.points}</td></tr>)}</tbody>
        </table>
      ) : <p className="muted">No risk signals fired for this placement.</p>}
      <dl className="mini-stats five">
        <div><dt>Spend</dt><dd>{fmtUsd(p.spend)}</dd></div>
        <div><dt>Share</dt><dd>{fmtPct(p.spend / (audit.totals.spend || 1), 1)}</dd></div>
        <div><dt>Impressions</dt><dd>{fmtNum(p.impressions)}</dd></div>
        <div><dt>CTR</dt><dd>{fmtPct(p.ctr, 2)}</dd></div>
        <div><dt>CPM</dt><dd>{fmtUsd(p.cpm, 2)}</dd></div>
        <div><dt>Conversions</dt><dd>{fmtNum(p.conversions)}</dd></div>
        <div><dt>CPA</dt><dd>{fmtCpa(p.cpa)}</dd></div>
        <div><dt>Viewability</dt><dd>{p.viewability === null ? '—' : fmtPct(p.viewability)}</dd></div>
        <div><dt>IVT</dt><dd>{p.ivt === null ? '—' : fmtPct(p.ivt, 1)}</dd></div>
        <div><dt>Avg frequency</dt><dd>{p.frequency === null ? '—' : p.frequency.toFixed(1)}</dd></div>
      </dl>
      <div className="row gap-sm wrap end">
        {p.override && <button type="button" className="btn ghost sm" onClick={() => setOverride(p.key, null)}>Clear override</button>}
        {p.override !== 'allow' && <button type="button" className="btn ghost sm" onClick={() => setOverride(p.key, 'allow')}>Allow (never flag)</button>}
        {p.override !== 'block' && <button type="button" className="btn danger-ghost sm" onClick={() => setOverride(p.key, 'block')}>Block</button>}
      </div>
    </div>
  )
}

// ---------- Overview ----------

function Overview({ project, audit, pace, openPlacement, onTab }: TabProps & { onTab(t: Tab): void }) {
  const [excluded, setExcluded] = useState(false)
  const t = audit.totals
  const w = audit.whatIf
  const roas = project.config.goal === 'roas'
  const alerts = pace.filter(p => p.status === 'under' || p.status === 'over')
  const delta = roas ? (w.before.roas && w.after.roas ? w.after.roas / w.before.roas - 1 : 0) : (w.before.cpa && w.after.cpa ? 1 - w.after.cpa / w.before.cpa : 0)
  return (
    <div className="tab-body">
      <div className="kpis">
        <div className="kpi"><span>Spend audited</span><b>{fmtUsd(t.spend)}</b><small>{fmtNum(t.impressions)} impressions, {audit.placements.length} placements{audit.period.from ? `, ${audit.period.from} to ${audit.period.to}` : ''}</small></div>
        <button type="button" className="kpi clickable bad" onClick={() => onTab('placements')}><span>Spend at risk</span><b>{fmtUsd(audit.spendAtRisk)}</b><small>{fmtPct(audit.riskShare, 1)} of spend on {audit.flagged.length} flagged placements</small></button>
        <div className="kpi good"><span>{roas ? 'ROAS' : 'CPA'} after exclusions</span><b>{roas ? fmtRoas(w.after.roas) : fmtCpa(w.after.cpa)}</b><small>from {roas ? fmtRoas(w.before.roas) : fmtCpa(w.before.cpa)} ({fmtPct(delta, 0)} {roas ? 'higher' : 'lower'})</small></div>
        <button type="button" className={`kpi clickable${audit.freq.share > 0.1 ? ' warn' : ''}`} onClick={() => onTab('pacing')}><span>Frequency waste</span><b>{audit.freq.source === 'none' ? '—' : fmtUsd(audit.freq.wastedSpend)}</b><small>{audit.freq.source === 'none' ? 'No frequency data in the report' : `${fmtPct(audit.freq.share, 1)} of impressions past a cap of ${audit.freq.cap}`}</small></button>
        <button type="button" className={`kpi clickable${alerts.length ? ' warn' : ''}`} onClick={() => onTab('pacing')}><span>Pacing</span><b>{pace.length ? `${alerts.length} of ${pace.length}` : '—'}</b><small>{pace.length ? alerts.length ? 'line items off pace' : 'line items on pace' : 'Add a flight plan on the Data tab'}</small></button>
      </div>

      <div className="panel">
        <div className="panel-head wrap">
          <div>
            <h2>Where the spend went</h2>
            <p className="muted small">Each tile is a placement sized by spend. Red tiles are flagged, amber ones carry a weak signal. Click a tile for its evidence.</p>
          </div>
          <div className="row gap-sm wrap">
            <span className="legend"><span><i className="sw flag" />Flagged</span><span><i className="sw warn" />Watch</span><span><i className="sw ok" />Clean</span></span>
            <button type="button" className={`btn ${excluded ? 'ghost' : 'primary'} sm`} aria-pressed={excluded} onClick={() => setExcluded(e => !e)}>{excluded ? 'Show current spend' : 'Preview exclusions'}</button>
          </div>
        </div>
        <Treemap placements={audit.placements} excluded={excluded} onSelect={openPlacement} height={440} />
        {excluded && <p className="small muted what-if-note">Flagged spend ({fmtUsd(w.excludedSpend)}) moves to clean placements in proportion to their current spend. It is projected to convert at the clean median of {(w.cleanConvPerDollar * 1000).toFixed(2)} conversions per $1,000, adding {fmtNum(w.excludedSpend * w.cleanConvPerDollar)} conversions and losing the {fmtNum(w.lostConversions)} the flagged set delivered.</p>}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Biggest flagged placements</h2><button type="button" className="linkish small" onClick={() => onTab('placements')}>All placements &rarr;</button></div>
          {audit.flagged.length ? (
            <ol className="rank">
              {audit.flagged.slice(0, 8).map((p, i) => (
                <li key={p.key}>
                  <span className="rank-n">{i + 1}</span>
                  <div className="rank-body">
                    <div className="row between gap-sm"><button type="button" className="linkish strong break" onClick={() => openPlacement(p.key)}>{p.key}</button><b>{fmtUsd(p.spend)}</b></div>
                    <div className="sig-chips">{p.signals.slice(0, 3).map(s => <span key={s.id} className="sig">{SIGNALS[s.id].label} <b>+{s.points}</b></span>)}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="muted">Nothing crossed the threshold of {project.config.threshold}. Lower it in the controls above to see borderline placements.</p>}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Spend by inventory type</h2></div>
          <div className="kind-bars">
            {(['web', 'app', 'ctv'] as const).filter(k => audit.byKind[k].count).map(k => {
              const b = audit.byKind[k]
              return (
                <div key={k} className="kind-bar">
                  <div className="row between"><strong>{KIND_LABEL[k]}</strong><span className="small muted">{b.count} placements · {fmtUsd(b.spend)}</span></div>
                  <div className="bar"><span className="clean" style={{ width: `${(b.spend - b.atRisk) / t.spend * 100}%` }} /><span className="risk" style={{ width: `${b.atRisk / t.spend * 100}%` }} /></div>
                  <small className="muted">{fmtUsd(b.atRisk)} at risk ({fmtPct(b.spend ? b.atRisk / b.spend : 0)} of {KIND_LABEL[k].toLowerCase()} spend)</small>
                </div>
              )
            })}
          </div>
          <h3 className="h4">Next steps</h3>
          <ul className="next-steps">
            <li><Link href={`/app/p/${project.id}/exclusions`}>Download the exclusion list</Link> for your DSP ({audit.flagged.length} entries).</li>
            <li><Link href={`/app/p/${project.id}/report`}>Print the client report</Link> with the evidence for each flag.</li>
            <li>Save a snapshot now, re-import next week, and compare on the History tab.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// ---------- Placements table ----------

type Filter = 'all' | 'flagged' | 'watch' | 'clean' | 'overrides'
type SortKey = 'spend' | 'score' | 'impressions' | 'ctr' | 'cpm' | 'cpa' | 'viewability' | 'ivt'

function Placements({ audit, setOverride, openPlacement }: TabProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: 'spend', desc: true })
  const [limit, setLimit] = useState(100)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === '/' && !isTyping(e)) { e.preventDefault(); document.getElementById('pl-search')?.focus() } }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = audit.placements.filter(p =>
      (filter === 'all' || (filter === 'flagged' && p.flagged) || (filter === 'watch' && !p.flagged && p.score > 0) || (filter === 'clean' && !p.flagged && p.score === 0) || (filter === 'overrides' && p.override))
      && (!ql || p.key.includes(ql) || p.raw.some(r => r.toLowerCase().includes(ql))))
    const val = (p: Placement): number => (sort.k === 'cpa' ? p.cpa ?? Infinity : sort.k === 'viewability' ? p.viewability ?? -1 : sort.k === 'ivt' ? p.ivt ?? -1 : p[sort.k])
    return list.sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)))
  }, [audit, filter, q, sort])
  const counts = { all: audit.placements.length, flagged: audit.flagged.length, watch: audit.placements.filter(p => !p.flagged && p.score > 0).length, clean: audit.placements.filter(p => !p.flagged && p.score === 0).length, overrides: audit.placements.filter(p => p.override).length }
  const th = (k: SortKey, label: string) => (
    <th className="num" aria-sort={sort.k === k ? (sort.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" className="sort" onClick={() => setSort(s => ({ k, desc: s.k === k ? !s.desc : true }))}>{label}{sort.k === k ? (sort.desc ? ' ↓' : ' ↑') : ''}</button>
    </th>
  )
  return (
    <div className="tab-body">
      <div className="panel">
        <div className="panel-head wrap">
          <div className="seg-control sm" role="radiogroup" aria-label="Filter placements">
            {(['all', 'flagged', 'watch', 'clean', 'overrides'] as Filter[]).map(f => <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? 'on' : ''} onClick={() => { setFilter(f); setLimit(100) }}>{f[0].toUpperCase() + f.slice(1)} <span className="muted">{counts[f]}</span></button>)}
          </div>
          <label className="search"><span className="sr">Search placements</span><input id="pl-search" type="search" placeholder="Search domains and apps  /" value={q} onChange={e => setQ(e.target.value)} /></label>
        </div>
        <div className="table-wrap">
          <table className="data placements">
            <thead><tr><th>Placement</th>{th('score', 'Risk')}{th('spend', 'Spend')}{th('impressions', 'Impr.')}{th('ctr', 'CTR')}{th('cpm', 'CPM')}{th('cpa', 'CPA')}{th('viewability', 'Viewable')}{th('ivt', 'IVT')}<th>Signals</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {rows.slice(0, limit).map(p => (
                <tr key={p.key} className={p.flagged ? 'row-bad' : ''}>
                  <th scope="row"><button type="button" className="linkish break pl-name" onClick={() => openPlacement(p.key)}>{p.key}</button><small className="muted"> {KIND_LABEL[p.kind]}</small></th>
                  <td className="num"><span className={`score-pill ${p.flagged ? 'bad' : p.score >= 15 ? 'warn' : 'ok'}`}>{p.score}</span></td>
                  <td className="num">{fmtUsd(p.spend)}</td>
                  <td className="num">{fmtNum(p.impressions)}</td>
                  <td className="num">{fmtPct(p.ctr, 2)}</td>
                  <td className="num">{fmtUsd(p.cpm, 2)}</td>
                  <td className="num">{fmtCpa(p.cpa)}</td>
                  <td className="num">{p.viewability === null ? '—' : fmtPct(p.viewability)}</td>
                  <td className="num">{p.ivt === null ? '—' : fmtPct(p.ivt, 1)}</td>
                  <td><div className="sig-chips">{p.signals.slice(0, 2).map(s => <span key={s.id} className="sig" title={s.detail}>{SIGNALS[s.id].label}</span>)}{p.signals.length > 2 && <span className="sig more">+{p.signals.length - 2}</span>}</div></td>
                  <td className="actions">
                    {p.override
                      ? <button type="button" className="btn ghost xs" onClick={() => setOverride(p.key, null)}>Reset {p.override}</button>
                      : p.flagged
                        ? <button type="button" className="btn ghost xs" onClick={() => setOverride(p.key, 'allow')}>Allow</button>
                        : <button type="button" className="btn ghost xs" onClick={() => setOverride(p.key, 'block')}>Block</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="muted center">No placements match.</p>}
        {rows.length > limit && <div className="center-x row"><button type="button" className="btn ghost sm" onClick={() => setLimit(l => l + 200)}>Show more ({rows.length - limit} left)</button></div>}
      </div>
    </div>
  )
}
