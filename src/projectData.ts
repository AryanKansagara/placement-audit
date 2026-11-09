import { useEffect, useMemo, useState } from 'react'
import { runAudit, type Audit } from './engine/audit.ts'
import { pacing } from './engine/pacing.ts'
import { generate, SAMPLES, sampleConfig, sampleHistory } from './engine/sample.ts'
import { EMPTY_DATASET, type Config, type Dataset } from './engine/types.ts'
import { blankConfig, getData, getProject, getProjects, saveProject, useProjects, uuid, type LogEntry, type Project } from './store.ts'

const sampleCache = new Map<string, Dataset>()
export function sampleDataset(id: string): Dataset | null {
  const def = SAMPLES.find(s => s.id === id)
  if (!def) return null
  if (!sampleCache.has(id)) sampleCache.set(id, generate(def))
  return sampleCache.get(id)!
}

export async function createSampleProject(sampleId: string): Promise<Project> {
  const existing = getProjects().find(p => p.sampleId === sampleId)
  if (existing) return existing
  const def = SAMPLES.find(s => s.id === sampleId)!
  const ds = sampleDataset(sampleId)!
  const now = Date.now()
  const snapshots = sampleHistory(def, uuid)
  return saveProject({
    id: uuid(), name: def.name, createdAt: now, updatedAt: now, config: sampleConfig(def), snapshots, sampleId,
    imports: [
      { id: uuid(), kind: 'placements', source: 'stackadapt', fileName: 'synthetic domain report', rows: ds.rows.length, skipped: 0, at: now },
      { id: uuid(), kind: 'flight', fileName: 'synthetic flight plan', rows: ds.flight.length, skipped: 0, at: now },
      ...(ds.freq.length ? [{ id: uuid(), kind: 'freq' as const, fileName: 'synthetic frequency report', rows: ds.freq.length, skipped: 0, at: now }] : []),
    ],
    changelog: [
      { at: snapshots[0].at, action: 'Baseline audit saved', detail: snapshots[0].label },
      { at: now, action: 'Opened the synthetic sample', detail: def.name },
    ],
  })
}

export async function createBlankProject(name: string): Promise<Project> {
  const now = Date.now()
  return saveProject({ id: uuid(), name, createdAt: now, updatedAt: now, config: blankConfig(), snapshots: [], imports: [], changelog: [{ at: now, action: 'Audit created' }] })
}

/** Appends to a project's change log (reads the latest copy so concurrent updates are not lost). */
export function logChange(id: string, action: string, detail?: string, patch: Partial<Project> = {}) {
  const p = getProject(id)
  if (!p) return
  const entry: LogEntry = { at: Date.now(), action, ...(detail ? { detail } : {}) }
  return saveProject({ ...p, ...patch, changelog: [...(p.changelog ?? []), entry].slice(-400) })
}

export function useProject(id: string) {
  const list = useProjects()
  const project = list?.find(p => p.id === id) ?? null
  const [ds, setDs] = useState<Dataset | null>(null)
  const [version, setVersion] = useState(0)
  const importsKey = project ? project.imports.map(i => i.id).join(',') : ''
  useEffect(() => {
    if (!project) return
    let live = true
    if (project.sampleId) { setDs(sampleDataset(project.sampleId) ?? EMPTY_DATASET); return }
    void getData(project.id).then(d => { if (live) setDs(d ? { ...EMPTY_DATASET, ...d } : EMPTY_DATASET) })
    return () => { live = false }
  }, [project?.id, project?.sampleId, importsKey, version])
  const update = (patch: Partial<Project>) => project && saveProject({ ...project, ...patch })
  const setConfig = (patch: Partial<Config>) => project && saveProject({ ...project, config: { ...project.config, ...patch } })
  return { loading: list === null || (project !== null && ds === null), project, ds, update, setConfig, reload: () => setVersion(v => v + 1) }
}

export function useAudit(ds: Dataset | null, cfg: Config | undefined): { audit: Audit | null; pace: ReturnType<typeof pacing> } {
  const audit = useMemo(() => (ds && cfg && ds.rows.length ? runAudit(ds, cfg) : null), [ds, cfg])
  const pace = useMemo(() => (ds ? pacing(ds.flight, ds.rows) : []), [ds])
  return { audit, pace }
}
