import { useMemo, useRef, useState } from 'react'
import { autoMap, detectKind, detectSource, findHeader, KINDS, parseCsv, parseList, SOURCES, toCsv, validate, type Kind, type Mapping, type Source } from './engine/csv.ts'
import { normalize } from './engine/domain.ts'
import { toExportCsv } from './engine/sample.ts'
import { EMPTY_DATASET, type Dataset, type FlightLine, type FreqBucket, type PlacementRow } from './engine/types.ts'
import { createBlankProject, logChange } from './projectData.ts'
import { putData, saveProject, uuid, type Project } from './store.ts'
import { RAW_SYNC_LIMIT, useSync } from './sync.ts'
import { ask, download, Empty, go, Link, toast } from './ui.tsx'

interface Pending { id: string; name: string; csv: ReturnType<typeof parseCsv>; header: number; kind: Kind | null; source: Source; map: Mapping }

export default function DataTab({ project, ds, update, reload }: { project: Project; ds: Dataset | null; update(p: Partial<Project>): void; reload(): void }) {
  const data = ds ?? EMPTY_DATASET
  const [pending, setPending] = useState<Pending[]>([])
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [listText, setListText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const sync = useSync()
  const rawSize = useMemo(() => (project.sampleId ? 0 : JSON.stringify(data).length), [data, project.sampleId])

  const readFiles = async (files: FileList | File[]) => {
    setBusy(true)
    const next: Pending[] = []
    for (const f of [...files]) {
      if (f.size > 150_000_000) { toast(`${f.name} is over 150 MB. Export by week, or without the date breakdown.`, { tone: 'error' }); continue }
      if (/\.xlsx?$/i.test(f.name)) { toast(`${f.name} is a spreadsheet. Save it as CSV first (File, Save as, CSV).`, { tone: 'error' }); continue }
      const text = await f.text()
      await new Promise(r => setTimeout(r, 0))
      const csv = parseCsv(text)
      if (csv.rows.length < 2) { toast(`${f.name} has no data rows.`, { tone: 'error' }); continue }
      const header = findHeader(csv.rows)
      const kind = detectKind(csv.rows[header])
      next.push({ id: uuid(), name: f.name, csv, header, kind, source: detectSource(csv.rows[header]), map: kind ? autoMap(kind, csv.rows[header]) : {} })
    }
    setPending(p => [...p, ...next])
    setBusy(false)
  }

  /** Samples are read-only: importing into one starts a fresh audit. */
  const target = async (): Promise<{ p: Project; base: Dataset; fresh: boolean }> => {
    if (!project.sampleId) return { p: project, base: data, fresh: false }
    return { p: await createBlankProject('My campaign audit'), base: EMPTY_DATASET, fresh: true }
  }

  const commit = async (pd: Pending, rows: unknown[], skipped: number) => {
    if (!pd.kind) return
    const { p, base, fresh } = await target()
    const merged: Dataset = pd.kind === 'placements' ? { ...base, rows: rows as PlacementRow[] }
      : pd.kind === 'flight' ? { ...base, flight: [...base.flight.filter(f => !(rows as FlightLine[]).some(n => n.line.toLowerCase() === f.line.toLowerCase())), ...(rows as FlightLine[])] }
        : { ...base, freq: rows as FreqBucket[] }
    await putData(p.id, merged)
    const meta = { id: uuid(), kind: pd.kind, source: pd.kind === 'placements' ? pd.source : undefined, fileName: pd.name, rows: rows.length, skipped, at: Date.now() }
    setPending(x => x.filter(y => y.id !== pd.id))
    const msg = `Imported ${rows.length.toLocaleString()} ${KINDS[pd.kind].title.toLowerCase()} rows${skipped ? `, skipped ${skipped}` : ''}`
    if (fresh) {
      await saveProject({ ...p, imports: [meta], changelog: [...p.changelog, { at: Date.now(), action: 'Imported', detail: `${pd.name}: ${rows.length} rows` }] })
      toast(`${msg} into a new audit (samples are read-only).`, { tone: 'ok' })
      go(`/app/p/${p.id}`)
      return
    }
    const prev = { data, imports: project.imports }
    await logChange(project.id, 'Imported', `${pd.name}: ${rows.length} ${KINDS[pd.kind].title.toLowerCase()} rows${pd.kind === 'placements' ? ` (${SOURCES[pd.source]})` : ''}`, { imports: [...project.imports, meta], dataMissing: false })
    reload()
    toast(msg, { tone: 'ok', undo: pd.kind === 'placements' && data.rows.length ? () => void putData(project.id, prev.data).then(() => { update({ imports: prev.imports }); reload() }) : undefined })
    if (pd.kind === 'placements') go(`/app/p/${project.id}`)
  }

  const addList = async (text: string, name: string) => {
    const keys = [...new Set(parseList(text).map(v => normalize(v).key).filter(Boolean))]
    if (!keys.length) { toast('No domains or app IDs found in that list.', { tone: 'error' }); return }
    const { p, base, fresh } = await target()
    await putData(p.id, { ...base, knownMfa: [...new Set([...base.knownMfa, ...keys])] })
    const meta = { id: uuid(), kind: 'mfa' as const, fileName: name, rows: keys.length, skipped: 0, at: Date.now() }
    if (fresh) { await saveProject({ ...p, imports: [meta] }); go(`/app/p/${p.id}/data`) }
    else { await logChange(p.id, 'Added known-MFA list', `${name}: ${keys.length} entries`, { imports: [...project.imports, meta] }); reload() }
    setListText('')
    toast(`Added ${keys.length} entries to the known-MFA list`, { tone: 'ok' })
  }

  const days = useMemo(() => [...new Set(data.rows.map(r => r.date).filter(Boolean))].sort(), [data.rows])

  return (
    <div className="tab-body">
      {project.dataMissing && <div className="fix-banner warn"><div><strong>This audit&rsquo;s raw report is on another device.</strong><p className="small">Settings, overrides, the change log and snapshots synced. Reports over {(RAW_SYNC_LIMIT / 1e6).toFixed(1)} MB stay where they were imported. Re-import the CSV here to recompute.</p></div></div>}

      <div className="panel">
        <div className="panel-head wrap"><h2>Import reports</h2><Link href="/docs" className="linkish small">Export steps for each DSP &rarr;</Link></div>
        {project.sampleId && (
          <div className="row between wrap gap-sm sample-note">
            <p className="muted small">This is a synthetic sample, so its data is read-only. Importing here starts a new audit with your files. Want to rehearse? Download the sample as a DSP-style CSV and drop it back in.</p>
            <button type="button" className="btn ghost sm" onClick={() => download('sample-domain-report.csv', toExportCsv(data))}>Download sample CSV</button>
          </div>
        )}
        <div className={`dropzone${drag ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void readFiles(e.dataTransfer.files) }}>
          <div className="drop-icon" aria-hidden="true" />
          <p><strong>Drop CSV files here</strong> or <button type="button" className="linkish" onClick={() => input.current?.click()}>choose files</button></p>
          <p className="muted small">Placement / domain / app reports from StackAdapt, The Trade Desk, DV360, Google Ads or any CSV, plus an optional flight plan and frequency report. Each file&rsquo;s type and source are detected from its headers.</p>
          <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" multiple hidden onChange={e => { if (e.target.files) void readFiles(e.target.files); e.target.value = '' }} />
          {busy && <p role="status"><span className="spinner" /> Reading files</p>}
        </div>
        {pending.map(p => <PendingCard key={p.id} p={p} replacing={p.kind === 'placements' && data.rows.length > 0 && !project.sampleId} onChange={np => setPending(x => x.map(y => (y.id === p.id ? np : y)))} onCancel={() => setPending(x => x.filter(y => y.id !== p.id))} onCommit={commit} />)}
      </div>

      <div className="panel">
        <div className="panel-head"><h2>What&rsquo;s loaded</h2>{days.length > 0 && <span className="muted small">{days[0]} to {days.at(-1)}</span>}</div>
        <div className="coverage">
          <div className={`cov ${data.rows.length ? 'ok' : 'missing'}`}><span className="mono small">Placement report</span><b>{data.rows.length ? `${data.rows.length.toLocaleString()} rows` : 'Required'}</b><small>Spend, impressions and quality per placement</small></div>
          <div className={`cov ${data.flight.length ? 'ok' : 'optional'}`}><span className="mono small">Flight plan</span><b>{data.flight.length ? `${data.flight.length} line items` : 'Optional'}</b><small>Budget and dates, for pacing</small></div>
          <div className={`cov ${data.freq.length ? 'ok' : 'optional'}`}><span className="mono small">Frequency report</span><b>{data.freq.length ? `${data.freq.length} buckets` : 'Optional'}</b><small>Users by exposures, for waste</small></div>
          <div className={`cov ${data.knownMfa.length ? 'ok' : 'optional'}`}><span className="mono small">Known-MFA list</span><b>{data.knownMfa.length ? `${data.knownMfa.length} entries` : 'Optional'}</b><small>Your own or your agency&rsquo;s list</small></div>
        </div>
        {!data.rows.length && <Empty title="No placement report yet"><p className="muted">Export a domain or placement report from your DSP (<Link href="/docs">steps</Link>), or open the <Link href="/app?sample=northwind">synthetic sample</Link> to look around first.</p></Empty>}
        {project.imports.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>File</th><th>Type</th><th className="num">Rows</th><th className="num">Skipped</th><th>Imported</th></tr></thead>
              <tbody>{[...project.imports].reverse().map(i => <tr key={i.id}><th scope="row" className="break">{i.fileName}</th><td>{i.kind === 'mfa' ? 'Known-MFA list' : i.source ? SOURCES[i.source] : KINDS[i.kind].title}</td><td className="num">{i.rows.toLocaleString()}</td><td className="num">{i.skipped}</td><td>{new Date(i.at).toLocaleString()}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {!project.sampleId && rawSize > 0 && <p className="muted small">Raw data on this device: {(rawSize / 1e6).toFixed(2)} MB. {sync.user ? (rawSize > RAW_SYNC_LIMIT ? 'Too large to sync; settings, overrides and snapshots sync, the raw report stays here.' : 'Small enough to sync with your account.') : 'Sign in to sync audits across devices.'}</p>}
      </div>

      <div className="panel">
        <div className="panel-head wrap"><h2>Known-MFA list</h2><span className="muted small">Optional. Matches add 60 points.</span></div>
        <p className="small muted">Paste or upload a list: one domain or app ID per line, or a CSV with domains in the first column. Subdomains of a listed domain match too. Placement Audit does not fetch ads.txt or sellers.json from your browser: most publishers do not send CORS headers, so those checks would silently fail. Run them in your verification vendor and paste the failing domains here.</p>
        <textarea className="list-input" rows={4} value={listText} onChange={e => setListText(e.target.value)} placeholder={'junk-slideshow-site.example\ncom.example.flashlightapp\n# comments are ignored'} aria-label="Known-MFA list" />
        <div className="row gap-sm wrap">
          <button type="button" className="btn primary sm" disabled={!listText.trim()} onClick={() => void addList(listText, 'Pasted list')}>Add to list</button>
          <label className="btn ghost sm">Upload list<input type="file" accept=".txt,.csv" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) void addList(await f.text(), f.name); e.target.value = '' }} /></label>
          {data.knownMfa.length > 0 && !project.sampleId && <button type="button" className="btn danger-ghost sm" onClick={async () => { const prev = data; await putData(project.id, { ...data, knownMfa: [] }); void logChange(project.id, 'Cleared known-MFA list'); reload(); toast('Known-MFA list cleared', { undo: () => void putData(project.id, prev).then(reload) }) }}>Clear list ({data.knownMfa.length})</button>}
        </div>
      </div>

      {!project.sampleId && data.rows.length > 0 && (
        <div className="panel danger-zone">
          <div className="panel-head"><h2>Danger zone</h2></div>
          <div className="row between wrap gap">
            <p className="small">Remove every imported row from this audit. Settings, overrides, snapshots and the change log stay.</p>
            <button type="button" className="btn danger-ghost sm" onClick={async () => {
              if (!(await ask('Clear imported data?', 'Removes all imported reports from this audit on this device. Snapshots and overrides are kept. You can undo for a few seconds.', 'Clear data'))) return
              const before = data
              const imports = project.imports
              await putData(project.id, EMPTY_DATASET)
              update({ imports: [] })
              reload()
              toast('Imported data cleared', { undo: () => void putData(project.id, before).then(() => { update({ imports }); reload() }) })
            }}>Clear imported data</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PendingCard({ p, replacing, onChange, onCancel, onCommit }: { p: Pending; replacing: boolean; onChange(p: Pending): void; onCancel(): void; onCommit(p: Pending, rows: unknown[], skipped: number): void }) {
  const headers = p.csv.rows[p.header]
  const first = p.csv.rows[p.header + 1] ?? []
  const v = useMemo(() => (p.kind ? validate(p.kind, p.csv, p.map, p.header) : null), [p.kind, p.csv, p.map, p.header])
  const [showAll, setShowAll] = useState(false)
  const issues = v?.issues ?? []
  return (
    <div className="pending">
      <div className="row between wrap gap-sm">
        <div><strong className="break">{p.name}</strong> <span className="muted small">{(p.csv.rows.length - p.header - 1).toLocaleString()} rows, {headers.length} columns{p.header ? `, header on line ${p.csv.lines[p.header]}` : ''}</span></div>
        <label className="ctl inline"><span>Detected as</span>
          <select value={p.kind ?? ''} onChange={e => { const k = (e.target.value || null) as Kind | null; onChange({ ...p, kind: k, map: k ? autoMap(k, headers) : {} }) }}>
            <option value="">Unknown: pick a type</option>
            {(Object.keys(KINDS) as Kind[]).map(k => <option key={k} value={k}>{k === 'placements' ? SOURCES[p.source] : KINDS[k].title}</option>)}
          </select>
        </label>
      </div>
      {!p.kind ? <p className="warn-text small">The columns do not match a report we know. Pick the type and map the columns by hand, or check the export steps in the docs.</p> : (
        <>
          <div className="mapping">
            {KINDS[p.kind].fields.map(f => (
              <label key={f.key} className="map-row">
                <span>{f.label}{f.required && <b className="req" aria-label="required">*</b>}</span>
                <select value={p.map[f.key] ?? ''} onChange={e => { const m = { ...p.map }; if (e.target.value === '') delete m[f.key]; else m[f.key] = Number(e.target.value); onChange({ ...p, map: m }) }} aria-invalid={f.required && p.map[f.key] === undefined}>
                  <option value="">Not in file</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
                <code className="sample">{p.map[f.key] !== undefined ? (first[p.map[f.key]] ?? '').slice(0, 32) || '(empty)' : ''}</code>
              </label>
            ))}
          </div>
          {v && (
            <div className={`report ${v.issues.length ? (v.rows.length ? 'warn' : 'bad') : 'good'}`}>
              <div className="row between wrap gap-sm">
                <span><b>{v.rows.length.toLocaleString()}</b> {v.rows.length === 1 ? 'row' : 'rows'} ready{v.skipped ? <>, <b>{v.skipped.toLocaleString()}</b> skipped</> : ''}{issues.length ? `, ${issues.length.toLocaleString()} notes` : ', no issues'}</span>
                {issues.length > 0 && <button type="button" className="btn ghost sm" onClick={() => download(`${p.name.replace(/\.\w+$/, '')}-validation.csv`, toCsv([['line', 'issue'], ...issues.map(i => [i.line, i.message])]))}>Download report</button>}
              </div>
              {issues.length > 0 && (
                <ul className="issues">
                  {issues.slice(0, showAll ? 300 : 6).map((i, k) => <li key={k}><span className="mono">line {i.line}</span> {i.message}</li>)}
                  {issues.length > 6 && !showAll && <li><button type="button" className="linkish small" onClick={() => setShowAll(true)}>Show all</button></li>}
                </ul>
              )}
            </div>
          )}
          {replacing && <p className="small muted">This replaces the current placement report. Save a snapshot first if you want to compare (History tab).</p>}
          <div className="row end gap-sm">
            <button type="button" className="btn ghost sm" onClick={onCancel}>Discard</button>
            <button type="button" className="btn primary sm" disabled={!v || !v.rows.length} onClick={() => v && onCommit(p, v.rows, v.skipped)}>Import {v?.rows.length.toLocaleString()} rows</button>
          </div>
        </>
      )}
    </div>
  )
}
