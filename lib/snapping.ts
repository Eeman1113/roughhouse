// Canva-style smart guides: sticky alignment that nudges toward "correct"
// geometry but never restricts — every snap has a small capture radius in
// SCREEN pixels, and moving past it releases instantly.
import { add, dist, scale as vscale, sub } from "./geometry";
import { Scene, Vec } from "./types";

export type Guide =
  | { type: "v"; x: number; refs: Vec[]; at: Vec } // vertical hairline through refs and the snapped point
  | { type: "h"; y: number; refs: Vec[]; at: Vec }
  | { type: "ray"; from: Vec; to: Vec } // angle ray while drawing a wall
  | { type: "point"; at: Vec }; // exact endpoint capture

export interface SnapResult {
  point: Vec;
  guides: Guide[];
  snapped: boolean; // anything stronger than plain grid
}

const ANGLE_STEP = Math.PI / 12; // 15°
const LEN_STEP = 5; // cm

/** All alignment reference points: wall endpoints (+ optional item centers). */
function refPoints(scene: Scene, includeItems: boolean, excludeItemId?: string): Vec[] {
  const pts: Vec[] = [];
  for (const w of scene.walls) pts.push(w.a, w.b);
  if (includeItems) {
    for (const it of scene.items) if (it.id !== excludeItemId) pts.push(it.pos);
    for (const s of scene.stairs) pts.push(s.pos);
  }
  return pts;
}

function nearestOnAxis(
  refs: Vec[],
  value: number,
  axis: "x" | "y",
  thresh: number
): { v: number; refs: Vec[] } | null {
  let best: number | null = null;
  let bestD = thresh;
  for (const r of refs) {
    const d = Math.abs(r[axis] - value);
    if (d < bestD - 1e-9) {
      bestD = d;
      best = r[axis];
    }
  }
  if (best === null) return null;
  return { v: best, refs: refs.filter((r) => Math.abs(r[axis] - best!) < 0.5) };
}

function snapToGrid(p: Vec, size: number): Vec {
  return { x: Math.round(p.x / size) * size, y: Math.round(p.y / size) * size };
}

/**
 * Smart-snap a wall-drawing point.
 * prev = previous chain point (null for the first click).
 */
export function smartWallSnap(
  scene: Scene,
  p: Vec,
  prev: Vec | null,
  zoom: number,
  gridSize = 10
): SnapResult {
  const thresh = 9 / zoom;
  const refs = refPoints(scene, false);

  // 1 — exact endpoint capture (strongest: closes corners perfectly)
  let bestPt: Vec | null = null;
  let bestD = 14 / zoom;
  for (const r of refs) {
    const d = dist(p, r);
    if (d < bestD) {
      bestD = d;
      bestPt = r;
    }
  }
  if (bestPt) {
    return { point: { ...bestPt }, guides: [{ type: "point", at: { ...bestPt } }], snapped: true };
  }

  const gx = nearestOnAxis(refs, p.x, "x", thresh);
  const gy = nearestOnAxis(refs, p.y, "y", thresh);

  if (!prev) {
    // First point: snap each axis independently to guides, else grid
    const point = {
      x: gx ? gx.v : Math.round(p.x / gridSize) * gridSize,
      y: gy ? gy.v : Math.round(p.y / gridSize) * gridSize,
    };
    const guides: Guide[] = [];
    if (gx) guides.push({ type: "v", x: gx.v, refs: gx.refs, at: point });
    if (gy) guides.push({ type: "h", y: gy.v, refs: gy.refs, at: point });
    return { point, guides, snapped: !!(gx || gy) };
  }

  // With a previous point: angle-snap the direction first
  const d = sub(p, prev);
  const rawLen = Math.hypot(d.x, d.y);
  if (rawLen < 1e-6) return { point: { ...p }, guides: [], snapped: false };
  const ang = Math.round(Math.atan2(d.y, d.x) / ANGLE_STEP) * ANGLE_STEP;
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  const axisH = Math.abs(dir.y) < 1e-6; // horizontal segment
  const axisV = Math.abs(dir.x) < 1e-6; // vertical segment

  const guides: Guide[] = [];
  let point: Vec;
  let snapped = false;

  if (axisH || axisV) {
    // Axis-aligned: the free axis can stick to an alignment guide
    if (axisH) {
      let x = p.x;
      if (gx) {
        x = gx.v;
        guides.push({ type: "v", x: gx.v, refs: gx.refs, at: { x: gx.v, y: prev.y } });
        snapped = true;
      } else {
        x = prev.x + Math.round((p.x - prev.x) / LEN_STEP) * LEN_STEP;
      }
      point = { x, y: prev.y };
    } else {
      let y = p.y;
      if (gy) {
        y = gy.v;
        guides.push({ type: "h", y: gy.v, refs: gy.refs, at: { x: prev.x, y: gy.v } });
        snapped = true;
      } else {
        y = prev.y + Math.round((p.y - prev.y) / LEN_STEP) * LEN_STEP;
      }
      point = { x: prev.x, y };
    }
  } else {
    // Diagonal ray: try intersecting the ray with a guide line
    point = add(prev, vscale(dir, Math.max(LEN_STEP, Math.round(rawLen / LEN_STEP) * LEN_STEP)));
    if (gx && Math.abs(dir.x) > 0.05) {
      const t = (gx.v - prev.x) / dir.x;
      if (t > 0) {
        const cand = add(prev, vscale(dir, t));
        if (dist(cand, p) < thresh * 1.6) {
          point = cand;
          guides.push({ type: "v", x: gx.v, refs: gx.refs, at: cand });
          snapped = true;
        }
      }
    }
    if (!snapped && gy && Math.abs(dir.y) > 0.05) {
      const t = (gy.v - prev.y) / dir.y;
      if (t > 0) {
        const cand = add(prev, vscale(dir, t));
        if (dist(cand, p) < thresh * 1.6) {
          point = cand;
          guides.push({ type: "h", y: gy.v, refs: gy.refs, at: cand });
          snapped = true;
        }
      }
    }
  }

  guides.push({ type: "ray", from: { ...prev }, to: { ...point } });
  return { point, guides, snapped };
}

/**
 * Smart-snap for dragging an item/stairs: snaps the element CENTER and EDGES
 * against other items' centers/edges and wall endpoints, per axis.
 */
export function smartMoveSnap(
  scene: Scene,
  desired: Vec, // desired center
  half: Vec, // half extents (axis-aligned approximation)
  zoom: number,
  excludeItemId: string,
  gridSize = 5
): SnapResult {
  const thresh = 8 / zoom;
  const refs = refPoints(scene, true, excludeItemId);
  // also other items' edges
  const edgeXs: Vec[] = [];
  const edgeYs: Vec[] = [];
  for (const it of scene.items) {
    if (it.id === excludeItemId) continue;
    edgeXs.push({ x: it.pos.x - it.w / 2, y: it.pos.y }, { x: it.pos.x + it.w / 2, y: it.pos.y });
    edgeYs.push({ x: it.pos.x, y: it.pos.y - it.h / 2 }, { x: it.pos.x, y: it.pos.y + it.h / 2 });
  }

  const guides: Guide[] = [];
  let x = Math.round(desired.x / gridSize) * gridSize;
  let y = Math.round(desired.y / gridSize) * gridSize;
  let snapped = false;

  // per-axis: center-to-ref, then own edges to other edges
  const xCands: { v: number; refs: Vec[] }[] = [];
  const cx = nearestOnAxis([...refs, ...edgeXs], desired.x, "x", thresh);
  if (cx) xCands.push(cx);
  const lx = nearestOnAxis(edgeXs, desired.x - half.x, "x", thresh);
  if (lx) xCands.push({ v: lx.v + half.x, refs: lx.refs });
  const rx = nearestOnAxis(edgeXs, desired.x + half.x, "x", thresh);
  if (rx) xCands.push({ v: rx.v - half.x, refs: rx.refs });
  if (xCands.length) {
    const best = xCands.reduce((a, b) =>
      Math.abs(a.v - desired.x) <= Math.abs(b.v - desired.x) ? a : b
    );
    x = best.v;
    guides.push({ type: "v", x: best.refs[0].x, refs: best.refs, at: { x, y: desired.y } });
    snapped = true;
  }

  const yCands: { v: number; refs: Vec[] }[] = [];
  const cy = nearestOnAxis([...refs, ...edgeYs], desired.y, "y", thresh);
  if (cy) yCands.push(cy);
  const ty = nearestOnAxis(edgeYs, desired.y - half.y, "y", thresh);
  if (ty) yCands.push({ v: ty.v + half.y, refs: ty.refs });
  const by = nearestOnAxis(edgeYs, desired.y + half.y, "y", thresh);
  if (by) yCands.push({ v: by.v - half.y, refs: by.refs });
  if (yCands.length) {
    const best = yCands.reduce((a, b) =>
      Math.abs(a.v - desired.y) <= Math.abs(b.v - desired.y) ? a : b
    );
    y = best.v;
    guides.push({ type: "h", y: best.refs[0].y, refs: best.refs, at: { x: desired.x, y } });
    snapped = true;
  }

  return { point: { x, y }, guides, snapped };
}

/** Draw guides — thin hairlines with markers, Canva-style. */
export function drawGuides(
  ctx: CanvasRenderingContext2D,
  guides: Guide[],
  zoom: number,
  color = "#ff375f"
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const g of guides) {
    if (g.type === "v" || g.type === "h") {
      const pts = [...g.refs, g.at];
      let min = Infinity;
      let max = -Infinity;
      for (const r of pts) {
        const v = g.type === "v" ? r.y : r.x;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const pad = 20 / zoom;
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([]);
      ctx.beginPath();
      if (g.type === "v") {
        ctx.moveTo(g.x, min - pad);
        ctx.lineTo(g.x, max + pad);
      } else {
        ctx.moveTo(min - pad, g.y);
        ctx.lineTo(max + pad, g.y);
      }
      ctx.stroke();
      // small x-markers on each reference
      const m = 3.5 / zoom;
      for (const r of g.refs) {
        ctx.beginPath();
        ctx.moveTo(r.x - m, r.y - m);
        ctx.lineTo(r.x + m, r.y + m);
        ctx.moveTo(r.x + m, r.y - m);
        ctx.lineTo(r.x - m, r.y + m);
        ctx.stroke();
      }
    } else if (g.type === "ray") {
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 5 / zoom]);
      const dir = sub(g.to, g.from);
      const len = Math.hypot(dir.x, dir.y) || 1;
      const ext = add(g.to, vscale({ x: dir.x / len, y: dir.y / len }, 60 / zoom));
      ctx.beginPath();
      ctx.moveTo(g.from.x, g.from.y);
      ctx.lineTo(ext.x, ext.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // point capture: ring
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(g.at.x, g.at.y, 7 / zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
