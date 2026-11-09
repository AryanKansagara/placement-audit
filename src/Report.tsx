import { useEffect } from 'react'
import { SIGNALS } from './engine/audit.ts'
import { logChange, useAudit, useProject } from './projectData.ts'
import { fmtCpa, fmtNum, fmtRoas, KIND_LABEL } from './Project.tsx'
import { Treemap } from './Treemap.tsx'
import { fmtPct, fmtUsd, Link, Monogram, ThemeToggle } from './ui.tsx'

export default function Report({ id }: { id: string }) {
  const { loading, project, ds } = useProject(id)
  const { audit, pace } = useAudit(ds, project?.config)
  useEffect(() => { if (project) document.title = `Audit report: ${project.name}` }, [project?.name])
  if (loading) return <div className="boot" role="status"><span className="spinner" /> Building the report</div>
  if (!project || !audit) return <section className="page narrow center"><h1>Nothing to report yet</h1><p className="muted">Import a placement report first.</p><Link href={project ? `/app/p/${id}/data` : '/app'} className="btn primary">Go to data</Link></section>
  const t = audit.totals, w = audit.whatIf
  const roas = project.config.goal === 'roas'
  const off = pace.filter(p => p.status === 'under' || p.status === 'over')
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <div className="report-page">
      <div className="report-bar no-print">
        <Link href={`/app/p/${id}`} className="btn ghost sm">&larr; Back to the audit</Link>
        <div className="row gap-sm"><ThemeToggle /><button type="button" className="btn primary sm" onClick={() => { void logChange(id, 'Printed client report'); print() }}>Print or save as PDF</button></div>
      </div>
      <article className="report-doc">
        <header className="report-head">
          <div className="row gap-sm"><Monogram /><span className="eyebrow">Placement audit</span></div>
          <h1>{project.name}</h1>
          <p className="muted">{audit.period.from ? `Delivery ${audit.period.from} to ${audit.period.to}` : 'Full report period'} · prepared {today}{project.sampleId ? ' · synthetic sample data' : ''}</p>
        </header>

        <section>
          <h2>Summary</h2>
          <p className="report-lede">
            Of <b>{fmtUsd(t.spend)}</b> spent across {audit.placements.length} placements, <b>{fmtUsd(audit.spendAtRisk)} ({fmtPct(audit.riskShare, 1)})</b> went to {audit.flagged.length} placements that failed our quality checks: made-for-advertising patterns, invalid traffic, low viewability or inventory that took impressions without converting.
            {w.excludedSpend > 0 && <> Excluding them and moving that budget to proven placements is projected to take {roas ? 'ROAS' : 'CPA'} from <b>{roas ? fmtRoas(w.before.roas) : fmtCpa(w.before.cpa)}</b> to <b>{roas ? fmtRoas(w.after.roas) : fmtCpa(w.after.cpa)}</b>.</>}
            {audit.freq.source !== 'none' && audit.freq.wastedSpend > 0 && <> A further <b>{fmtUsd(audit.freq.wastedSpend)}</b> bought impressions past a frequency of {audit.freq.cap} per person.</>}
          </p>
          <div className="report-kpis">
            <div><span>Spend</span><b>{fmtUsd(t.spend)}</b></div>
            <div><span>Impressions</span><b>{fmtNum(t.impressions)}</b></div>
            <div><span>Conversions</span><b>{fmtNum(t.conversions)}</b></div>
            <div><span>{roas ? 'ROAS' : 'CPA'}</span><b>{roas ? fmtRoas(t.roas) : fmtCpa(t.cpa)}</b></div>
            <div className="bad"><span>Spend at risk</span><b>{fmtUsd(audit.spendAtRisk)}</b></div>
            <div className="good"><span>Projected {roas ? 'ROAS' : 'CPA'}</span><b>{roas ? fmtRoas(w.after.roas) : fmtCpa(w.after.cpa)}</b></div>
          </div>
        </section>

        <section className="avoid-break">
          <h2>Where the budget went</h2>
          <p className="small muted">Each tile is a placement sized by spend. Red tiles were flagged.</p>
          <Treemap placements={audit.placements} excluded={false} interactive={false} height={300} />
        </section>

        <section>
          <h2>Flagged placements</h2>
          <p className="small muted">Top {Math.min(40, audit.flagged.length)} of {audit.flagged.length} by spend. Score is out of 100; placements at {project.config.threshold} or more are excluded.</p>
          <table className="data compact report-table">
            <thead><tr><th>Placement</th><th>Type</th><th className="num">Spend</th><th className="num">Score</th><th>Why</th></tr></thead>
            <tbody>{audit.flagged.slice(0, 40).map(p => <tr key={p.key}><th scope="row" className="break">{p.key}</th><td>{KIND_LABEL[p.kind]}</td><td className="num">{fmtUsd(p.spend)}</td><td className="num">{p.score}</td><td className="small">{p.signals.map(s => s.detail).join('; ')}</td></tr>)}</tbody>
          </table>
        </section>

        {pace.length > 0 && (
          <section className="avoid-break">
            <h2>Pacing</h2>
            <table className="data compact">
              <thead><tr><th>Line item</th><th className="num">Budget</th><th className="num">Spent</th><th className="num">Pace</th><th className="num">Needed per day</th></tr></thead>
              <tbody>{pace.map(l => <tr key={l.line}><th scope="row">{l.line}</th><td className="num">{fmtUsd(l.budget)}</td><td className="num">{fmtUsd(l.spent)}</td><td className="num">{fmtPct(l.pace)}</td><td className="num">{l.status === 'done' ? 'Ended' : fmtUsd(l.neededDaily)}</td></tr>)}</tbody>
            </table>
            {off.length > 0 && <p className="small">{off.length} line item{off.length > 1 ? 's are' : ' is'} more than 10% off even pacing; the daily figure is what lands each one on budget by its end date.</p>}
          </section>
        )}

        <section className="avoid-break">
          <h2>What we are changing</h2>
          <ol className="report-actions">
            <li>Block the {audit.flagged.length} flagged placements on every line item (list attached).</li>
            {audit.freq.share > 0.05 && <li>Cap frequency at {audit.freq.cap} exposures per person.</li>}
            {off.length > 0 && <li>Adjust daily budgets on {off.map(l => l.line).join(', ')}.</li>}
            <li>Re-run this audit next week and confirm the blocked placements no longer receive spend.</li>
          </ol>
        </section>

        <section className="avoid-break">
          <h2>Method</h2>
          <p className="small">Placements are grouped by registrable domain or app ID. Each one earns points from the signals below; statistical signals need at least {fmtNum(project.config.minImpressions)} impressions. The projection assumes moved budget converts at the median rate of clean placements ({(w.cleanConvPerDollar * 1000).toFixed(2)} conversions per $1,000), which is an estimate, not a guarantee.</p>
          <dl className="method-list small">{Object.entries(SIGNALS).filter(([k]) => k !== 'manual').map(([k, s]) => <div key={k}><dt>{s.label} <span className="muted">(up to {s.max})</span></dt><dd>{s.help}</dd></div>)}</dl>
        </section>
        <footer className="report-foot small muted">Prepared with Placement Audit. Independent tool, not affiliated with any DSP.</footer>
      </article>
    </div>
  )
}
