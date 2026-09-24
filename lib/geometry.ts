import { Opening, Scene, Vec, Wall } from "./types";

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec): Vec => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;

/** Distance from point to segment, plus the parameter t of the closest point. */
export function pointSegDist(p: Vec, a: Vec, b: Vec): { d: number; t: number } {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  if (l2 === 0) return { d: dist(p, a), t: 0 };
  let t = dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  return { d: dist(p, lerp(a, b, t)), t };
}

export function snapToGrid(p: Vec, size: number): Vec {
  return { x: Math.round(p.x / size) * size, y: Math.round(p.y / size) * size };
}

/** Snap the direction prev->p to the nearest multiple of `step` radians. */
export function angleSnap(prev: Vec, p: Vec, step = Math.PI / 12, lenStep = 5): Vec {
  const d = sub(p, prev);
  const l = len(d);
  if (l < 1e-6) return p;
  const a = Math.round(Math.atan2(d.y, d.x) / step) * step;
  const sl = Math.max(lenStep, Math.round(l / lenStep) * lenStep);
  return { x: prev.x + Math.cos(a) * sl, y: prev.y + Math.sin(a) * sl };
}

export function wallDir(w: Wall): Vec {
  return norm(sub(w.b, w.a));
}

export const isCurved = (w: Wall): boolean => !!w.bulge && Math.abs(w.bulge) > 0.5;

/** Arc through a, b with sagitta `bulge`: returns center, radius, start/end angles. */
export function wallArc(w: Wall): { c: Vec; r: number; a0: number; a1: number; ccw: boolean } | null {
  if (!isCurved(w)) return null;
  const s = w.bulge!;
  const chord = dist(w.a, w.b);
  if (chord < 1) return null;
  const h = Math.abs(s);
  const r = (chord * chord) / (8 * h) + h / 2;
  const mid = lerp(w.a, w.b, 0.5);
  const n = perp(wallDir(w)); // chord normal
  // arc midpoint sits at mid + n*s; center is on the opposite side of the chord
  const c = add(mid, scale(n, s - Math.sign(s) * r));
  const a0 = Math.atan2(w.a.y - c.y, w.a.x - c.x);
  const a1 = Math.atan2(w.b.y - c.y, w.b.x - c.x);
  // sweep direction: from a to b passing through the arc midpoint
  const am = Math.atan2(mid.y + n.y * s - c.y, mid.x + n.x * s - c.x);
  const norm2 = (x: number) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const cwSweep = norm2(a1 - a0);
  const cwMid = norm2(am - a0);
  const ccw = cwMid > cwSweep; // midpoint not on the clockwise path → go counter-clockwise
  return { c, r, a0, a1, ccw };
}

/** Point along the wall at parameter t in [0,1] (arc-aware). */
export function wallPointAt(w: Wall, t: number): Vec {
  const arc = wallArc(w);
  if (!arc) return lerp(w.a, w.b, t);
  const two = Math.PI * 2;
  let sweep = arc.a1 - arc.a0;
  if (arc.ccw) {
    while (sweep > 0) sweep -= two;
  } else {
    while (sweep < 0) sweep += two;
  }
  const ang = arc.a0 + sweep * t;
  return { x: arc.c.x + Math.cos(ang) * arc.r, y: arc.c.y + Math.sin(ang) * arc.r };
}

/** Unit tangent along the wall at parameter t (arc-aware, a→b direction). */
export function wallTangentAt(w: Wall, t: number): Vec {
  if (!isCurved(w)) return wallDir(w);
  const e = 0.002;
  const p0 = wallPointAt(w, Math.max(0, t - e));
  const p1 = wallPointAt(w, Math.min(1, t + e));
  return norm(sub(p1, p0));
}

/** Polyline approximation of the wall (straight → [a, b]). */
export function wallPolyline(w: Wall, segments = 24): Vec[] {
  if (!isCurved(w)) return [w.a, w.b];
  const pts: Vec[] = [];
  for (let i = 0; i <= segments; i++) pts.push(wallPointAt(w, i / segments));
  return pts;
}

export function wallLen(w: Wall): number {
  if (!isCurved(w)) return dist(w.a, w.b);
  const pts = wallPolyline(w, 48);
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Nearest point on the wall to p: distance and parameter t (arc-aware). */
export function nearestOnWall(w: Wall, p: Vec): { d: number; t: number } {
  if (!isCurved(w)) return pointSegDist(p, w.a, w.b);
  const pts = wallPolyline(w, 32);
  let best = { d: Infinity, t: 0 };
  for (let i = 1; i < pts.length; i++) {
    const r = pointSegDist(p, pts[i - 1], pts[i]);
    if (r.d < best.d) best = { d: r.d, t: (i - 1 + r.t) / (pts.length - 1) };
  }
  return best;
}

export function openingCenter(o: Opening, w: Wall): Vec {
  return wallPointAt(w, o.t);
}

/** Is point inside a rectangle centered at c, rotated by rot, of size w x h (+pad)? */
export function inRotRect(p: Vec, c: Vec, rot: number, w: number, h: number, pad = 0): boolean {
  const d = sub(p, c);
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const lx = d.x * cos - d.y * sin;
  const ly = d.x * sin + d.y * cos;
  return Math.abs(lx) <= w / 2 + pad && Math.abs(ly) <= h / 2 + pad;
}

/** Nearest wall to p within maxDist; returns wall and t of closest point. */
export function nearestWall(
  scene: Scene,
  p: Vec,
  maxDist: number
): { wall: Wall; t: number } | null {
  let best: { wall: Wall; t: number; d: number } | null = null;
  for (const w of scene.walls) {
    const { d, t } = nearestOnWall(w, p);
    if (d <= maxDist && (!best || d < best.d)) best = { wall: w, t, d };
  }
  return best ? { wall: best.wall, t: best.t } : null;
}

/** Clamp opening center t so the opening fits inside the wall. */
export function clampOpeningT(wall: Wall, t: number, width: number): number {
  const l = wallLen(wall);
  if (l <= width) return 0.5;
  const half = width / 2 / l;
  return Math.max(half, Math.min(1 - half, t));
}

/** Every wall endpoint coincident with p (within eps). Used to drag corners together. */
export function coincidentEndpoints(
  scene: Scene,
  p: Vec,
  eps = 0.5
): { wallId: string; end: "a" | "b" }[] {
  const out: { wallId: string; end: "a" | "b" }[] = [];
  for (const w of scene.walls) {
    if (dist(w.a, p) <= eps) out.push({ wallId: w.id, end: "a" });
    if (dist(w.b, p) <= eps) out.push({ wallId: w.id, end: "b" });
  }
  return out;
}

export function sceneBounds(scene: Scene): { min: Vec; max: Vec } | null {
  const pts: Vec[] = [];
  for (const w of scene.walls) pts.push(...wallPolyline(w, 8));
  for (const s of scene.stairs) {
    const r = Math.max(s.width, s.length);
    pts.push(add(s.pos, v(-r, -r)), add(s.pos, v(r, r)));
  }
  for (const i of scene.items) {
    const r = Math.max(i.w, i.h);
    pts.push(add(i.pos, v(-r / 2, -r / 2)), add(i.pos, v(r / 2, r / 2)));
  }
  for (const r of scene.rooms) pts.push(...r.poly);
  for (const n of scene.notes) {
    // rough text extent: left-anchored, ~0.55em per character
    const longest = Math.max(1, ...n.text.split("\n").map((l) => l.length));
    pts.push(add(n.pos, v(0, -n.size)), add(n.pos, v(longest * n.size * 0.55, n.size)));
  }
  if (!pts.length) return null;
  const min = v(Infinity, Infinity);
  const max = v(-Infinity, -Infinity);
  for (const p of pts) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
  }
  return { min, max };
}

export function fmtLen(cm: number): string {
  return `${(cm / 100).toFixed(2)} m`;
}
