import { useEffect, useState } from 'react'
import { SAMPLES } from './engine/sample.ts'
import { createBlankProject, createSampleProject } from './projectData.ts'
import { deleteProject, saveProject, useProjects, type Project } from './store.ts'
import { useSync } from './sync.ts'
import { ask, fmtPct, fmtUsd, go, Link, SyntheticBadge, toast } from './ui.tsx'

export default function Workspace() {
  const list = useProjects()
  const sync = useSync()
  const [busy, setBusy] = useState<string | null>(null)

  // /app?sample=northwind opens (or creates) the sample straight away.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const s = q.get('sample')
    const tab = q.get('tab')?.replace(/[^a-z]/g, '')
    if (!s || list === null || busy) return
    if (!SAMPLES.some(x => x.id === s)) return
    setBusy(s)
    void createSampleProject(s).then(p => go(`/app/p/${p.id}${tab ? '/' + tab : ''}`, { replace: true }))
  }, [list, busy])

  const openSample = async (id: string) => { setBusy(id); const p = await createSampleProject(id); go(`/app/p/${p.id}`) }
  const newProject = async () => {
    const name = `Campaign audit ${(list?.filter(p => !p.sampleId).length ?? 0) + 1}`
    const p = await createBlankProject(name)
    go(`/app/p/${p.id}/data`)
  }

  if (list === null || busy) return <div className="boot" role="status"><span className="spinner" /> {busy ? 'Building the synthetic campaign' : 'Opening your audits'}</div>

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Audits</h1>
          <p className="muted">One audit per account, advertiser or campaign. Each keeps its overrides, a change log and dated snapshots. {sync.user ? 'Synced to your account.' : 'Stored on this device.'}</p>
        </div>
        {list.length > 0 && <div className="row gap"><button type="button" className="btn primary" onClick={newProject}>New audit</button></div>}
      </div>

      {list.length === 0 ? (
        <div className="onboard">
          <article className="onboard-card feature">
            <div className="eyebrow">Two minutes</div>
            <h2>Try the sample</h2>
            <p>Synthetic campaigns with real-looking problems, already scored. Preview the exclusions, download a block list, print the client report.</p>
            <div className="stack-sm">
              {SAMPLES.map(s => (
                <button key={s.id} type="button" className="sample-btn" onClick={() => void openSample(s.id)}>
                  <span><strong>{s.name}</strong><small>{s.blurb}</small></span><span aria-hidden="true">&rarr;</span>
                </button>
              ))}
            </div>
          </article>
          <article className="onboard-card">
            <div className="eyebrow">Your campaign</div>
            <h2>Import your data</h2>
            <p>Export a domain or placement report from StackAdapt, The Trade Desk, DV360 or Google Ads (about two minutes, steps in the docs) and drop it in. The format is detected and columns are mapped for you.</p>
            <div className="row gap wrap">
              <button type="button" className="btn primary" onClick={newProject}>Import your data</button>
              <Link href="/docs" className="btn ghost">Export steps</Link>
            </div>
            <p className="muted small">Files are parsed in your browser and stay on this device.</p>
          </article>
        </div>
      ) : (
        <>
          <div className="project-grid">
            {list.map(p => <ProjectCard key={p.id} p={p} />)}
          </div>
          <div className="samples-row">
            <span className="muted small">Samples:</span>
            {SAMPLES.map(s => <button key={s.id} type="button" className="linkish small" onClick={() => void openSample(s.id)}>{s.name}</button>)}
          </div>
        </>
      )}
    </section>
  )
}

function ProjectCard({ p }: { p: Project }) {
  const [renaming, setRenaming] = useState(false)
  const last = [...p.snapshots].sort((a, b) => a.at - b.at).at(-1)
  return (
    <article className="project-card">
      <div className="row between">
        {renaming ? (
          <form onSubmit={e => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('n')).trim(); if (v) void saveProject({ ...p, name: v }); setRenaming(false) }}>
            <input name="n" defaultValue={p.name} autoFocus aria-label="Project name" onBlur={e => e.currentTarget.form?.requestSubmit()} />
          </form>
        ) : <h3><Link href={`/app/p/${p.id}`}>{p.name}</Link></h3>}
        {p.sampleId && <SyntheticBadge />}
      </div>
      <dl className="mini-stats">
        <div><dt>Last snapshot</dt><dd>{last ? new Date(last.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'None yet'}</dd></div>
        <div><dt>At risk</dt><dd>{last ? `${fmtUsd(last.spendAtRisk)} (${fmtPct(last.riskShare)})` : '—'}</dd></div>
        <div><dt>Overrides</dt><dd>{Object.keys(p.config.overrides).length}</dd></div>
        <div><dt>Snapshots</dt><dd>{p.snapshots.length}</dd></div>
      </dl>
      {p.dataMissing && <p className="warn-text small">The raw report lives on another device. Re-import here to recompute.</p>}
      <div className="row between">
        <span className="muted small">Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
        <div className="row gap-sm">
          <button type="button" className="btn ghost sm" onClick={() => setRenaming(true)}>Rename</button>
          <button type="button" className="btn danger-ghost sm" onClick={async () => {
            if (!(await ask(`Delete “${p.name}”?`, 'Removes the audit, its data and its snapshots from this device (and the cloud, if you are signed in). You can undo for a few seconds.', 'Delete audit'))) return
            const undo = await deleteProject(p.id)
            toast(`Deleted ${p.name}`, { undo: () => void undo() })
          }}>Delete</button>
        </div>
      </div>
    </article>
  )
}

