import { useEffect, useMemo, useRef, useState } from 'react'
import type { Placement } from './engine/audit.ts'
import { fmtUsd } from './ui.tsx'

export interface Rect { x: number; y: number; w: number; h: number }

/** Squarified treemap (Bruls, Huizing, van Wijk). Values must be sorted descending. Returns rects in the same order. */
export function squarify(values: number[], box: Rect): Rect[] {
  const out: Rect[] = new Array(values.length)
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }))
  const scale = (box.w * box.h) / total
  let { x, y, w, h } = box
  let i = 0
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0)
    const max = Math.max(...row), min = Math.min(...row)
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min))
  }
  while (i < values.length) {
    const side = Math.min(w, h)
    const row: number[] = []
    let j = i
    while (j < values.length) {
      const a = values[j] * scale
      if (a <= 0) { j++; continue }
      if (row.length && worst([...row, a], side) > worst(row, side)) break
      row.push(a); j++
    }
    const s = row.reduce((a, b) => a + b, 0)
    let k = 0
    if (w >= h) {
      const rw = s / h
      let yy = y
      for (let n = i; n < j; n++) {
        const a = values[n] * scale
        const rh = a > 0 ? row[k++] / rw : 0
        out[n] = { x, y: yy, w: a > 0 ? rw : 0, h: rh }
        yy += rh
      }
      x += rw; w -= rw
    } else {
      const rh = s / w
      let xx = x
      for (let n = i; n < j; n++) {
        const a = values[n] * scale
        const rw = a > 0 ? row[k++] / rh : 0
        out[n] = { x: xx, y, w: rw, h: a > 0 ? rh : 0 }
        xx += rw
      }
      y += rh; h -= rh
    }
    i = j
  }
  return out
}

/** Spend treemap. With `excluded`, flagged tiles collapse and clean tiles grow into the freed budget. */
export function Treemap({ placements, excluded, selected, onSelect, height = 420, interactive = true, max = 140 }: {
  placements: Placement[]; excluded: boolean; selected?: string | null; onSelect?(key: string): void; height?: number; interactive?: boolean; max?: number
}) {
  const items = useMemo(() => placements.filter(p => p.spend > 0).slice(0, max), [placements, max])
  const ratio = 1.6
  const box = { x: 0, y: 0, w: 100 * ratio, h: 100 }
  const full = useMemo(() => squarify(items.map(p => p.spend), box), [items])
  const clean = useMemo(() => squarify(items.map(p => (p.flagged ? 0 : p.spend)), box), [items])
  const [tip, setTip] = useState<{ p: Placement; x: number; y: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  return (
    <div className={`treemap${excluded ? ' excluded' : ''}`} ref={wrap} style={{ height }} onMouseLeave={() => setTip(null)} role={interactive ? undefined : 'img'} aria-label={interactive ? undefined : `Spend by placement: ${items.filter(p => p.flagged).length} of ${items.length} placements flagged`}>
      {items.map((p, i) => {
        const r = excluded ? (p.flagged ? { ...full[i], x: full[i].x + full[i].w / 2, y: full[i].y + full[i].h / 2, w: 0, h: 0 } : clean[i]) : full[i]
        const style = { left: `${(r.x / box.w) * 100}%`, top: `${r.y}%`, width: `${(r.w / box.w) * 100}%`, height: `${r.h}%`, '--d': `${(i % 17) * 18}ms` } as React.CSSProperties
        const big = r.w / box.w > 0.09 && r.h > 9
        const cls = `tile ${p.flagged ? 'flag' : p.score >= 15 ? 'warn' : 'ok'}${selected === p.key ? ' sel' : ''}`
        const content = big && <span className="tile-label"><b>{p.key}</b><small>{fmtUsd(p.spend)}{p.flagged ? ` · score ${p.score}` : ''}</small></span>
        const onMove = (e: React.MouseEvent) => {
          const b = wrap.current!.getBoundingClientRect()
          setTip({ p, x: e.clientX - b.left, y: e.clientY - b.top })
        }
        return interactive
          ? <button key={p.key} type="button" className={cls} style={style} onMouseMove={onMove} onClick={() => onSelect?.(p.key)} aria-label={`${p.key}, ${fmtUsd(p.spend)}, risk score ${p.score}${p.flagged ? ', flagged' : ''}`} tabIndex={excluded && p.flagged ? -1 : 0}>{content}</button>
          : <div key={p.key} className={cls} style={style} onMouseMove={onMove}>{content}</div>
      })}
      {tip && (
        <div className="tm-tip" style={{ left: Math.min(tip.x + 14, (wrap.current?.clientWidth ?? 600) - 250), top: Math.min(tip.y + 14, height - 120) }} aria-hidden="true">
          <div className="tip-head">{tip.p.key}{tip.p.flagged && <span className="chip bad">flagged</span>}</div>
          <div className="tip-row"><span>Spend</span><b>{fmtUsd(tip.p.spend)}</b></div>
          <div className="tip-row"><span>Risk score</span><b>{tip.p.score}</b></div>
          {tip.p.signals.slice(0, 3).map(s => <div key={s.id} className="tip-note">{s.detail}</div>)}
        </div>
      )}
    </div>
  )
}

/** Counts from one number to another when `to` changes. */
export function useCountUp(to: number, ms = 1100) {
  const [v, setV] = useState(to)
  const from = useRef(to)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); from.current = to; return }
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      setV(a + (to - a) * e)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = to
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); from.current = to }
  }, [to, ms])
  return v
}
