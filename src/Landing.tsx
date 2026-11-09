import { useMemo, useState } from 'react'
import { runAudit } from './engine/audit.ts'
import { blocklist } from './engine/exports.ts'
import { generate, SAMPLES, sampleConfig } from './engine/sample.ts'
import { SIGNALS } from './engine/audit.ts'
import { Treemap, useCountUp } from './Treemap.tsx'
import { Code, fmtPct, fmtUsd, Link } from './ui.tsx'

function HeroDemo() {
  const audit = useMemo(() => { const d = SAMPLES[0]; return runAudit(generate(d), sampleConfig(d)) }, [])
  const [excluded, setExcluded] = useState(false)
  const w = audit.whatIf
  const cpa = useCountUp(excluded ? w.after.cpa ?? 0 : w.before.cpa ?? 0)
  const risk = useCountUp(excluded ? 0 : audit.spendAtRisk)
  const drop = w.before.cpa && w.after.cpa ? 1 - w.after.cpa / w.before.cpa : 0
  return (
    <div className="hero-demo">
      <div className="hero-demo-head">
        <div>
          <div className="eyebrow mono">Live audit · synthetic B2B native campaign</div>
          <p className="small muted">{audit.placements.length} placements, {fmtUsd(audit.totals.spend)} spend. Every tile is a domain sized by spend; the glowing ones failed the risk score.</p>
        </div>
        <button type="button" className={`btn ${excluded ? 'ghost' : 'primary'} sm`} onClick={() => setExcluded(e => !e)} aria-pressed={excluded}>
          {excluded ? 'Undo exclusions' : `Exclude ${audit.flagged.length} flagged`}
        </button>
      </div>
      <Treemap placements={audit.placements} excluded={excluded} interactive={false} height={330} />
      <div className="hero-stats" aria-live="polite">
        <div className={`hs${excluded ? '' : ' bad'}`}><span>Spend at risk</span><b>{fmtUsd(risk)}</b><small>{excluded ? 'moved to clean inventory' : `${fmtPct(audit.riskShare)} of budget`}</small></div>
        <div className={`hs${excluded ? ' good' : ''}`}><span>Projected CPA</span><b>{fmtUsd(cpa, 2)}</b><small>{excluded ? `${fmtPct(drop, 0)} lower at the clean median` : 'today'}</small></div>
        <div className="hs"><span>Exclusion list</span><b>{audit.flagged.length} domains</b><small>StackAdapt, TTD, DV360, Google Ads</small></div>
      </div>
    </div>
  )
}

export function Landing() {
  const sample = useMemo(() => { const d = SAMPLES[0]; const a = runAudit(generate(d), sampleConfig(d)); return blocklist(a.flagged.slice(0, 9), 'reasons').split('\n').slice(0, 7).join('\n') }, [])
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-copy">
          <Link className="announce" href="/docs#score"><span className="announce-new">Open method</span> Every flag shows the signals and points behind it <span aria-hidden="true">&rarr;</span></Link>
          <h1>See where the programmatic budget <span className="accent">actually went.</span></h1>
          <p className="lede">Placement Audit reads your DSP placement report, scores every domain and app for made-for-advertising risk, frequency waste and pacing drift, then hands you the block list and a report your client can read.</p>
          <div className="hero-actions">
            <Link href="/app?sample=northwind" className="btn primary lg">Try the sample</Link>
            <Link href="/app" className="btn outline lg">Import your report</Link>
          </div>
          <p className="small muted">StackAdapt, The Trade Desk, DV360, Google Ads or any CSV. Runs in your browser.</p>
        </div>
        <HeroDemo />
      </section>

      <section className="section evidence">
        <div className="section-head">
          <div className="eyebrow">Heard from buyers</div>
          <h2>Hitting the CPA target is not the same as buying real media.</h2>
        </div>
        <div className="cards three">
          <article className="card quote">
            <div className="mono tag-chip">r/adops</div>
            <p>A buyer asks whether anyone keeps a shared list of made-for-advertising sites. The MFA domains winning most of their impressions rated 50 to 100% invalid traffic, and they argue that knowingly paying for fraud is wrong even when the CPA looks fine.</p>
          </article>
          <article className="card quote">
            <div className="mono tag-chip">r/programmatic</div>
            <p>A long thread on DSP fees and transparency keeps landing on one request: show me, line by line, where the money went.</p>
          </article>
          <article className="card quote">
            <div className="mono tag-chip">r/programmatic</div>
            <p>Traders asking how to move from pure campaign execution into analysis, the work clients actually remember.</p>
          </article>
        </div>
        <p className="kicker">Placement Audit is that analysis, done the same way every week, with the evidence attached.</p>
      </section>

      <section className="section steps">
        <div className="section-head">
          <div className="eyebrow">How it works</div>
          <h2>From a placement export to a block list in three steps.</h2>
        </div>
        <ol className="cards three steps-list">
          <li className="card"><span className="step-n">01</span><h3>Drop in the report</h3><p>Domain or app performance from your DSP. The format is detected from the headers, columns are mapped for you, and every rejected row comes back with its line number. Add a flight plan for pacing.</p></li>
          <li className="card"><span className="step-n">02</span><h3>Read the score</h3><p>Each placement gets a 0 to 100 risk score built from seven named signals. Allow or block anything by hand; overrides are logged and survive the next import.</p></li>
          <li className="card"><span className="step-n">03</span><h3>Ship the fix</h3><p>Download the exclusion list in your DSP&rsquo;s upload shape, print the client report, and save a snapshot. Next week the compare view shows whether the exclusions held.</p></li>
        </ol>
      </section>

      <section className="section methods" id="signals">
        <div className="section-head">
          <div className="eyebrow">A score you can defend</div>
          <h2>Seven signals, points on the label.</h2>
          <p className="muted">No black box. Flag at 40 points by default; change the threshold and limits per audit.</p>
        </div>
        <div className="cards four">
          {(['ivt', 'viewability', 'ctr', 'pattern', 'concentration', 'cpm', 'frequency', 'known'] as const).map(id => (
            <article className="card method" key={id}><div className="pts mono">up to {SIGNALS[id].max} pts</div><h3>{SIGNALS[id].label}</h3><p>{SIGNALS[id].help}</p></article>
          ))}
        </div>
      </section>

      <section className="section outputs">
        <div className="split">
          <div>
            <div className="eyebrow">Actions, not charts</div>
            <h2>The list you upload and the report you send.</h2>
            <ul className="checks">
              <li>Exclusion lists for StackAdapt, The Trade Desk, DV360 and Google Ads, apps included</li>
              <li>Allowlist of clean placements that converted</li>
              <li>What-if: exclude the flagged set, re-project CPA or ROAS at the clean median</li>
              <li>Frequency waste: spend beyond your effective cap</li>
              <li>Pacing per line item with the daily budget needed to land</li>
              <li>Printable client report and a change log per audit</li>
              <li>Weekly or monthly snapshots, with leaking exclusions called out</li>
            </ul>
          </div>
          <Code code={sample} label="Exclusions with reasons, synthetic sample" />
        </div>
      </section>

      <section className="section cta">
        <h2>Audit this week&rsquo;s placements before the next invoice.</h2>
        <p className="muted">Free, no account needed. Sign in only if you want audits on more than one device.</p>
        <div className="hero-actions center-x">
          <Link href="/app?sample=lumen" className="btn primary lg">Try the CTV sample</Link>
          <Link href="/docs" className="btn outline lg">How to export</Link>
        </div>
      </section>
    </div>
  )
}
