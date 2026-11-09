import { useMemo, useState } from 'react'
import { allowlist, blocklist, compare, FORMATS, type ListFormat } from './engine/exports.ts'
import type { LinePacing } from './engine/pacing.ts'
import { logChange } from './projectData.ts'
import { fmtCpa, fmtNum, type Tab, type TabProps } from './Project.tsx'
import { ask, CopyButton, download, Empty, fmtDay, fmtPct, fmtUsd, signed, toast } from './ui.tsx'

export default function Panels(props: TabProps & { tab: Tab }) {
  if (props.tab === 'pacing') return <Pacing {...props} />
  if (props.tab === 'exclusions') return <Exclusions {...props} />
  return <History {...props} />
}

// ---------- Pacing & frequency ----------

const STATUS: Record<LinePacing['status'], string> = { on: 'On pace', under: 'Under-pacing', over: 'Over-pacing', done: 'Flight ended', 'not-started': 'Not started' }

function PaceChart({ l }: { l: LinePacing }) {
  const W = 560, H = 170, P = 6
  const x = (i: number) => P + (i / Math.max(1, l.series.length - 1)) * (W - 2 * P)
  const y = (v: number) => H - P - (v / (l.budget * 1.15 || 1)) * (H - 2 * P)
  const exp = l.series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.expected).toFixed(1)}`).join('')
  const act = l.series.filter(s => !Number.isNaN(s.actual))
  const actPath = act.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.actual).toFixed(1)}`).join('')
  const last = act.length - 1
  const proj = last >= 0 ? `M${x(last).toFixed(1)},${y(act[last].actual).toFixed(1)}L${x(l.series.length - 1).toFixed(1)},${y(l.projected).toFixed(1)}` : ''
  const area = act.length ? `${actPath}L${x(last).toFixed(1)},${H - P}L${x(0).toFixed(1)},${H - P}Z` : ''
  return (
    <svg className="pace-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${l.line}: ${fmtUsd(l.spent)} spent of ${fmtUsd(l.expected)} expected by ${l.asOf}`}>
      <line className="budget-line" x1={P} x2={W - P} y1={y(l.budget)} y2={y(l.budget)} />
      <text className="chart-label" x={W - P} y={y(l.budget) - 5} textAnchor="end">Budget {fmtUsd(l.budget)}</text>
      <path className="exp" d={exp} />
      {area && <path className={`act-area ${l.status}`} d={area} />}
      {actPath && <path className={`act ${l.status}`} d={actPath} />}
      {proj && <path className="proj" d={proj} />}
      {last >= 0 && <circle className={`act-dot ${l.status}`} cx={x(last)} cy={y(act[last].actual)} r="4" />}
    </svg>
  )
}

function Pacing({ audit, pace }: TabProps) {
  const f = audit.freq
  const maxU = Math.max(1, ...f.buckets.map(b => b.impressions))
  return (
    <div className="tab-body">
      <div className="panel">
        <div className="panel-head wrap"><h2>Pacing by line item</h2><span className="muted small">Even pacing. Under below 90% of expected, over above 110%.</span></div>
        {!pace.length ? <Empty title="No flight plan yet"><p className="muted">Add a CSV with line item, budget, start and end dates on the Data tab. Pacing needs a report broken out by day.</p></Empty> : (
          <div className="pace-grid">
            {pace.map(l => (
              <article key={l.line} className={`pace-card ${l.status}`}>
                <div className="row between gap-sm wrap"><h3 className="break">{l.line}</h3><span className={`chip ${l.status === 'on' ? 'good' : l.status === 'under' || l.status === 'over' ? 'warn' : ''}`}>{STATUS[l.status]}</span></div>
                <p className="small muted">{fmtDay(l.start)} to {fmtDay(l.end)} · day {l.elapsed} of {l.days} · data through {fmtDay(l.asOf)}</p>
                <PaceChart l={l} />
                <dl className="mini-stats four">
                  <div><dt>Spent</dt><dd>{fmtUsd(l.spent)}</dd></div>
                  <div><dt>Expected</dt><dd>{fmtUsd(l.expected)}</dd></div>
                  <div><dt>Pace</dt><dd className={l.status === 'on' ? '' : 'warn-text'}>{fmtPct(l.pace)}</dd></div>
                  <div><dt>Projected</dt><dd>{fmtUsd(l.projected)}</dd></div>
                </dl>
                {l.status !== 'done' && l.status !== 'not-started' && (
                  <p className="pace-advice">To land on budget: <b>{fmtUsd(l.neededDaily)}/day</b> for the remaining {l.days - l.elapsed} days, against {fmtUsd(l.currentDaily)}/day over the last week{l.currentDaily > 0 ? ` (${signed(l.neededDaily / l.currentDaily - 1, v => fmtPct(v))})` : ''}.</p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head wrap"><h2>Frequency waste</h2><span className="muted small">Effective cap: {f.cap} exposures per user. Change it in the controls above.</span></div>
        {f.source === 'none' ? <Empty title="No frequency data"><p className="muted">Upload a frequency distribution report, or include an average frequency column in the placement report.</p></Empty> : (
          <>
            <div className="kpis three">
              <div className="kpi warn"><span>Spend past the cap</span><b>{fmtUsd(f.wastedSpend)}</b><small>at the campaign&rsquo;s average CPM</small></div>
              <div className="kpi"><span>Impressions past the cap</span><b>{fmtNum(f.wastedImpressions)}</b><small>{fmtPct(f.share, 1)} of impressions</small></div>
              <div className="kpi"><span>Method</span><b>{f.source === 'distribution' ? 'Distribution' : 'Per placement'}</b><small>{f.source === 'distribution' ? 'From your frequency report' : 'From average frequency per placement'}</small></div>
            </div>
            {f.buckets.length > 0 && (
              <div className="freq-chart" role="img" aria-label="Impressions by exposure count, with the share beyond the cap highlighted">
                {f.buckets.map(b => (
                  <div key={b.frequency} className="freq-col" title={`${b.frequency} exposures: ${fmtNum(b.users)} users, ${fmtNum(b.impressions)} impressions, ${fmtNum(b.beyond)} past the cap`}>
                    <div className="freq-bar" style={{ height: `${(b.impressions / maxU) * 100}%` }}>
                      <span className="beyond" style={{ height: `${b.impressions ? (b.beyond / b.impressions) * 100 : 0}%` }} />
                    </div>
                    <small>{b.frequency}</small>
                  </div>
                ))}
              </div>
            )}
            <p className="small muted">Every impression a user sees beyond the cap is counted as waste and priced at the campaign CPM. For a CTV launch a cap of 4 to 8 a week is common; for retargeting, higher.</p>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- Exclusions ----------

function Exclusions({ project, audit }: TabProps) {
  const [format, setFormat] = useState<ListFormat>('stackadapt')
  const [scope, setScope] = useState<'all' | 'web' | 'app'>('all')
  const list = useMemo(() => audit.flagged.filter(p => scope === 'all' || (scope === 'web' ? p.kind === 'web' : p.kind !== 'web')), [audit, scope])
  const date = new Date().toISOString().slice(0, 10)
  const header = `${project.name} exclusions, ${date}\n${list.length} placements, ${fmtUsd(list.reduce((a, p) => a + p.spend, 0))} spend, threshold ${project.config.threshold}`
  const text = blocklist(list, format, header)
  const allow = useMemo(() => allowlist(audit), [audit])
  const fileBase = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const save = (name: string, body: string, what: string) => { download(name, body, name.endsWith('.csv') ? 'text/csv' : 'text/plain'); void logChange(project.id, what, `${name} (${body.trim().split('\n').length} lines)`) }
  return (
    <div className="tab-body">
      <div className="panel">
        <div className="panel-head wrap">
          <div><h2>Exclusion list</h2><p className="muted small">{list.length} flagged placements, {fmtUsd(list.reduce((a, p) => a + p.spend, 0))} of spend. Allowed placements are left out; blocked ones are in.</p></div>
          <div className="seg-control sm" role="radiogroup" aria-label="Inventory">
            {(['all', 'web', 'app'] as const).map(s => <button key={s} type="button" role="radio" aria-checked={scope === s} className={scope === s ? 'on' : ''} onClick={() => setScope(s)}>{s === 'all' ? 'All' : s === 'web' ? 'Web' : 'Apps & CTV'}</button>)}
          </div>
        </div>
        <div className="format-grid" role="radiogroup" aria-label="Format">
          {(Object.keys(FORMATS) as ListFormat[]).map(f => (
            <button key={f} type="button" role="radio" aria-checked={format === f} className={`format${format === f ? ' on' : ''}`} onClick={() => setFormat(f)}>
              <strong>{FORMATS[f].label}</strong><small>.{FORMATS[f].ext}</small>
            </button>
          ))}
        </div>
        <p className="small format-note"><b>{FORMATS[format].label}:</b> {FORMATS[format].note} <span className="muted">Shapes checked November 2026; confirm in the upload dialog, since platforms change these.</span></p>
        <div className="code">
          <div className="code-head"><span>{`${fileBase}-exclusions-${format}.${FORMATS[format].ext}`}</span>
            <div className="row gap-sm"><CopyButton text={text} /><button type="button" className="btn primary sm" disabled={!list.length} onClick={() => save(`${fileBase}-exclusions-${format}-${date}.${FORMATS[format].ext}`, text, `Exported ${FORMATS[format].label} exclusion list`)}>Download</button></div>
          </div>
          <pre><code>{text.split('\n').slice(0, 40).join('\n')}{text.split('\n').length > 40 ? `\n… ${text.split('\n').length - 40} more lines` : ''}</code></pre>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Allowlist</h2><span className="muted small">{allow.length} placements</span></div>
          <p className="small muted">Clean placements (score under 20) that delivered conversions. Use it as an inclusion list for a tighter prospecting line, or to sanity-check the exclusions.</p>
          <ul className="allow-list">{allow.slice(0, 8).map(p => <li key={p.key}><span className="break">{p.key}</span><span className="muted small">{fmtUsd(p.spend)} · CPA {fmtCpa(p.cpa)}</span></li>)}</ul>
          <div className="row gap-sm wrap">
            <button type="button" className="btn ghost sm" disabled={!allow.length} onClick={() => save(`${fileBase}-allowlist-${date}.txt`, blocklist(allow, 'plain'), 'Exported allowlist')}>Download allowlist</button>
            <CopyButton text={blocklist(allow, 'plain')} label="Copy" />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Before you upload</h2></div>
          <ul className="checks small">
            <li>Exclusions apply to new auctions only; spend already delivered is not refunded. Ask your rep about IVT credits for the high-IVT domains.</li>
            <li>DSP block lists usually match the domain you give and its subdomains. Lists here are registrable domains, so subdomains are covered.</li>
            <li>For CTV, many DSPs block by app or channel ID rather than name. Check the placement IDs in your DSP before uploading CTV rows.</li>
            <li>Re-run the audit after a week and compare on the History tab: anything still spending is a list that did not land.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// ---------- History ----------

function History({ project, audit, update, saveSnapshot }: TabProps) {
  const snaps = [...project.snapshots].sort((a, b) => a.at - b.at)
  const [ai, setAi] = useState(Math.max(0, snaps.length - 2))
  const [bi, setBi] = useState(snaps.length - 1)
  const c = snaps.length >= 2 && snaps[ai] && snaps[bi] && ai !== bi ? compare(snaps[ai], snaps[bi]) : null
  const removeSnap = async (id: string) => {
    if (!(await ask('Delete this snapshot?', 'It is removed from this device and your cloud account. You can undo for a few seconds.', 'Delete snapshot'))) return
    const prev = project.snapshots
    void update({ snapshots: prev.filter(s => s.id !== id) })
    void import('./sync.ts').then(m => m.deleteSnapshotCloud(id))
    toast('Snapshot deleted', { undo: () => void update({ snapshots: prev }) })
  }
  const sinceLast = snaps.length ? audit.riskShare - snaps[snaps.length - 1].riskShare : null
  return (
    <div className="tab-body">
      <div className="panel">
        <div className="panel-head wrap">
          <div><h2>Snapshots</h2><p className="muted small">Save one per week or month. Each keeps the totals, the flagged list and spend per placement, so later audits can tell whether exclusions held.</p></div>
          <button type="button" className="btn primary sm" onClick={saveSnapshot}>Save current audit</button>
        </div>
        {sinceLast !== null && <p className="small">Current audit vs the last snapshot: risk share <b className={sinceLast <= 0 ? 'good-text' : 'bad-text'}>{signed(sinceLast * 100, v => v.toFixed(1) + ' pts')}</b> ({fmtPct(audit.riskShare, 1)} now).</p>}
        {!snaps.length ? <Empty title="No snapshots yet"><p className="muted">Save this audit, apply the exclusions, and import next week&rsquo;s report to see the change.</p></Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Snapshot</th><th className="num">Spend</th><th className="num">At risk</th><th className="num">Risk share</th><th className="num">Flagged</th><th className="num">CPA</th><th className="num">Freq. waste</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>{snaps.map(s => (
                <tr key={s.id}>
                  <th scope="row">{s.label}<br /><small className="muted">saved {new Date(s.at).toLocaleDateString()}</small></th>
                  <td className="num">{fmtUsd(s.spend)}</td><td className="num">{fmtUsd(s.spendAtRisk)}</td><td className="num">{fmtPct(s.riskShare, 1)}</td><td className="num">{s.flaggedCount}</td><td className="num">{fmtCpa(s.cpa)}</td><td className="num">{fmtUsd(s.freqWaste)}</td>
                  <td className="actions"><button type="button" className="btn danger-ghost xs" onClick={() => void removeSnap(s.id)}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {snaps.length >= 2 && (
        <div className="panel">
          <div className="panel-head wrap">
            <h2>Compare</h2>
            <div className="row gap-sm wrap">
              <label className="ctl inline"><span>From</span><select value={ai} onChange={e => setAi(Number(e.target.value))}>{snaps.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}</select></label>
              <label className="ctl inline"><span>To</span><select value={bi} onChange={e => setBi(Number(e.target.value))}>{snaps.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}</select></label>
            </div>
          </div>
          {!c ? <p className="muted">Pick two different snapshots.</p> : (
            <>
              <div className="kpis">
                <div className={`kpi ${c.riskShareDelta <= 0 ? 'good' : 'bad'}`}><span>Risk share</span><b>{signed(c.riskShareDelta * 100, v => v.toFixed(1) + ' pts')}</b><small>{fmtPct(c.a.riskShare, 1)} to {fmtPct(c.b.riskShare, 1)}</small></div>
                <div className={`kpi ${c.spendAtRiskDelta <= 0 ? 'good' : 'bad'}`}><span>Spend at risk</span><b>{signed(c.spendAtRiskDelta, v => fmtUsd(v))}</b><small>{fmtUsd(c.a.spendAtRisk)} to {fmtUsd(c.b.spendAtRisk)}</small></div>
                <div className={`kpi ${c.cpaDelta === null ? '' : c.cpaDelta <= 0 ? 'good' : 'bad'}`}><span>CPA</span><b>{c.cpaDelta === null ? '—' : signed(c.cpaDelta, v => fmtUsd(v, 2))}</b><small>{fmtCpa(c.a.cpa)} to {fmtCpa(c.b.cpa)}</small></div>
                <div className={`kpi ${c.leaking.length ? 'warn' : 'good'}`}><span>Leaking exclusions</span><b>{c.leaking.length}</b><small>flagged before, still spending</small></div>
              </div>
              <p className="verdict">{c.riskShareDelta < -0.02 && !c.leaking.length ? 'The exclusions worked: risk share fell and nothing flagged before is still taking spend.' : c.riskShareDelta < 0 ? `Risk share fell, but ${c.leaking.length} previously flagged placement${c.leaking.length === 1 ? ' is' : 's are'} still taking spend. Check that the list was attached to every line item.` : 'Risk share did not fall. Either the list was not applied, or new junk replaced the old (see newly flagged).'}</p>
              <div className="grid-3">
                <div><h3 className="h4">Still spending ({c.leaking.length})</h3><ul className="mini-list">{c.leaking.slice(0, 10).map(([k, s]) => <li key={k}><span className="break">{k}</span><b>{fmtUsd(s)}</b></li>)}{!c.leaking.length && <li className="muted">None</li>}</ul></div>
                <div><h3 className="h4">Newly flagged ({c.added.length})</h3><ul className="mini-list">{c.added.slice(0, 10).map(([k, s]) => <li key={k}><span className="break">{k}</span><b>{fmtUsd(s)}</b></li>)}{!c.added.length && <li className="muted">None</li>}</ul></div>
                <div><h3 className="h4">Resolved ({c.resolved.length})</h3><ul className="mini-list">{c.resolved.slice(0, 10).map(k => <li key={k}><span className="break">{k}</span></li>)}{!c.resolved.length && <li className="muted">None</li>}</ul></div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h2>Change log</h2><span className="muted small">{project.changelog?.length ?? 0} entries</span></div>
        {!project.changelog?.length ? <p className="muted">Exports, overrides, imports and snapshots are recorded here.</p> : (
          <ol className="changelog">
            {[...project.changelog].reverse().slice(0, 60).map((e, i) => <li key={i}><time>{new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time><span><b>{e.action}</b>{e.detail && <> · <span className="break">{e.detail}</span></>}</span></li>)}
          </ol>
        )}
      </div>
    </div>
  )
}
