import { useState } from 'react'
import { deleteProject, getDefaults, getProjects, setDefaults, type Defaults } from './store.ts'
import { exportAll, RAW_SYNC_LIMIT, useSync } from './sync.ts'
import { ask, download, setTheme, toast, useDark } from './ui.tsx'

export default function Settings() {
  const [d, setD] = useState<Defaults>(getDefaults)
  const dark = useDark()
  const sync = useSync()
  const save = (p: Partial<Defaults>) => { const next = { ...d, ...p }; setD(next); setDefaults(next); toast('Saved', { tone: 'ok', ttl: 1500 }) }

  return (
    <section className="page narrow settings">
      <div className="eyebrow">Settings</div>
      <h1>Settings</h1>

      <div className="panel">
        <h2>Defaults for new audits</h2>
        <p className="muted small">Existing audits keep their own settings; change those from the audit toolbar.</p>
        <label className="field"><span>Flag at risk score</span><input type="number" min="5" max="100" step="5" value={d.threshold} onChange={e => save({ threshold: Math.min(100, Math.max(5, Number(e.target.value))) })} /></label>
        <label className="field"><span>Viewability floor (%)</span><input type="number" min="0" max="100" step="5" value={Math.round(d.minViewability * 100)} onChange={e => save({ minViewability: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })} /></label>
        <label className="field"><span>IVT limit (%)</span><input type="number" min="0.5" max="50" step="0.5" value={+(d.maxIvt * 100).toFixed(1)} onChange={e => save({ maxIvt: Math.min(50, Math.max(0.5, Number(e.target.value))) / 100 })} /></label>
        <label className="field"><span>Effective frequency cap</span><input type="number" min="1" max="50" value={d.freqCap} onChange={e => save({ freqCap: Math.min(50, Math.max(1, Number(e.target.value))) })} /></label>
        <label className="field"><span>Minimum impressions for statistical signals</span><input type="number" min="0" step="500" value={d.minImpressions} onChange={e => save({ minImpressions: Math.max(0, Number(e.target.value)) })} /></label>
        <label className="field"><span>Goal</span><select value={d.goal} onChange={e => save({ goal: e.target.value as Defaults['goal'] })}><option value="cpa">CPA (cost per conversion)</option><option value="roas">ROAS (conversion value / spend)</option></select></label>
      </div>

      <div className="panel">
        <h2>Appearance</h2>
        <div className="seg-control" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" aria-checked={!dark} className={!dark ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
          <button type="button" role="radio" aria-checked={dark} className={dark ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>

      <div className="panel">
        <h2>Your data</h2>
        <p>Audits live in this browser (IndexedDB). {sync.user ? <>Signed in as <b>{sync.user.email}</b>: settings, overrides, change logs, snapshots and raw reports under {(RAW_SYNC_LIMIT / 1e6).toFixed(1)} MB per audit sync to your account.</> : 'Sign in from the account menu (top right) to sync across devices. It is optional.'}</p>
        <div className="row gap wrap">
          <button type="button" className="btn ghost" onClick={async () => download(`placement-audit-export-${new Date().toISOString().slice(0, 10)}.json`, await exportAll())}>Export all my data (JSON)</button>
          <button type="button" className="btn danger-ghost" onClick={async () => {
            const list = getProjects()
            if (!list.length) { toast('Nothing to delete'); return }
            if (!(await ask('Delete all local audits?', `Removes ${list.length} audit${list.length > 1 ? 's' : ''} from this browser${sync.user ? ' and from your cloud account' : ''}. You can undo for a few seconds.`, 'Delete everything'))) return
            const undos = await Promise.all(list.map(p => deleteProject(p.id)))
            toast(`Deleted ${list.length} audits`, { undo: () => { for (const u of undos) void u() } })
          }}>Delete all audits</button>
        </div>
      </div>

      <div className="panel">
        <h2>Keyboard shortcuts</h2>
        <dl className="shortcuts">
          <div><dt><kbd>1</kbd>&ndash;<kbd>6</kbd></dt><dd>Switch audit tabs</dd></div>
          <div><dt><kbd>/</kbd></dt><dd>Search placements</dd></div>
          <div><dt><kbd>S</kbd></dt><dd>Save a snapshot</dd></div>
          <div><dt><kbd>P</kbd></dt><dd>Printable client report</dd></div>
          <div><dt><kbd>&#8984;</kbd>/<kbd>Ctrl</kbd> <kbd>Z</kbd></dt><dd>Undo the last override or delete</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>Show shortcuts in an audit</dd></div>
        </dl>
      </div>
    </section>
  )
}
