// Room detection: flood-fill the space under the cursor against rasterized
// walls, bridge collinear gaps (doorways/passages) so rooms don't leak into
// hallways, and trace the result into a polygon hugging the walls.
import { Scene, Vec } from "./types";

const CELL = 10; // cm per raster cell
const BRIDGE_GAP = 200; // cm: max collinear gap treated as a virtual boundary
const MAX_AREA_CELLS = 400_000; // bail-out for unbounded/huge fills

export interface DetectedRegion {
  poly: Vec[];
  areaM2: number;
}

export const ROOM_COLORS = [
  "#0a84ff",
  "#30d158",
  "#ff9f0a",
  "#ff375f",
  "#bf5af2",
  "#64d2ff",
  "#ffd60a",
  "#ff6482",
];

interface Raster {
  grid: Uint8Array;
  gw: number;
  gh: number;
  origin: Vec;
}

function rasterize(scene: Scene): Raster | null {
  if (!scene.walls.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of scene.walls) {
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const margin = CELL * 3;
  const origin = { x: minX - margin, y: minY - margin };
  const gw = Math.min(4000, Math.ceil((maxX - minX + margin * 2) / CELL));
  const gh = Math.min(4000, Math.ceil((maxY - minY + margin * 2) / CELL));
  if (gw <= 0 || gh <= 0) return null;
  const grid = new Uint8Array(gw * gh);

  const stamp = (x: number, y: number, r: number) => {
    const cx = Math.floor((x - origin.x) / CELL);
    const cy = Math.floor((y - origin.y) / CELL);
    const rc = Math.max(1, Math.ceil(r / CELL));
    for (let dy = -rc; dy <= rc; dy++)
      for (let dx = -rc; dx <= rc; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        grid[ny * gw + nx] = 1;
      }
  };

  const stampSeg = (a: Vec, b: Vec, thickness: number) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / (CELL / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      stamp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, thickness / 2);
    }
  };

  for (const w of scene.walls) stampSeg(w.a, w.b, w.thickness);

  // Bridge collinear gaps: passage openings shouldn't dissolve room boundaries.
  const EPS = 8; // cm tolerance for "same line"
  const horiz = scene.walls.filter((w) => Math.abs(w.a.y - w.b.y) < EPS);
  const vert = scene.walls.filter((w) => Math.abs(w.a.x - w.b.x) < EPS);
  // group horizontals by y
  const hGroups = new Map<number, { lo: number; hi: number; y: number }[]>();
  for (const w of horiz) {
    const y = (w.a.y + w.b.y) / 2;
    const key = Math.round(y / EPS);
    if (!hGroups.has(key)) hGroups.set(key, []);
    hGroups.get(key)!.push({ lo: Math.min(w.a.x, w.b.x), hi: Math.max(w.a.x, w.b.x), y });
  }
  for (const segs of hGroups.values()) {
    segs.sort((a, b) => a.lo - b.lo);
    for (let i = 1; i < segs.length; i++) {
      const gap = segs[i].lo - segs[i - 1].hi;
      if (gap > 0 && gap <= BRIDGE_GAP) {
        stampSeg(
          { x: segs[i - 1].hi, y: segs[i - 1].y },
          { x: segs[i].lo, y: segs[i].y },
          CELL
        );
      }
    }
  }
  const vGroups = new Map<number, { lo: number; hi: number; x: number }[]>();
  for (const w of vert) {
    const x = (w.a.x + w.b.x) / 2;
    const key = Math.round(x / EPS);
    if (!vGroups.has(key)) vGroups.set(key, []);
    vGroups.get(key)!.push({ lo: Math.min(w.a.y, w.b.y), hi: Math.max(w.a.y, w.b.y), x });
  }
  for (const segs of vGroups.values()) {
    segs.sort((a, b) => a.lo - b.lo);
    for (let i = 1; i < segs.length; i++) {
      const gap = segs[i].lo - segs[i - 1].hi;
      if (gap > 0 && gap <= BRIDGE_GAP) {
        stampSeg(
          { x: segs[i - 1].x, y: segs[i - 1].hi },
          { x: segs[i].x, y: segs[i].lo },
          CELL
        );
      }
    }
  }

  // Free-end extension: a wall that dead-ends implies a virtual room divider.
  // March from each unconnected endpoint along the wall's direction until we
  // hit other geometry (within MAX_EXTEND) and close the gap.
  const MAX_EXTEND = 450; // cm
  const EPS2 = 6;
  const endpoints: { p: Vec; other: Vec; th: number }[] = [];
  for (const w of scene.walls) {
    endpoints.push({ p: w.a, other: w.b, th: w.thickness });
    endpoints.push({ p: w.b, other: w.a, th: w.thickness });
  }
  const isFree = (pt: Vec, self: { p: Vec; other: Vec }) => {
    for (const e of endpoints) {
      if (e === self) continue;
      if (Math.hypot(e.p.x - pt.x, e.p.y - pt.y) < EPS2) return false; // shared corner
    }
    for (const w of scene.walls) {
      // lies on another wall's body?
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const l2 = dx * dx + dy * dy;
      if (l2 < 1) continue;
      const t = ((pt.x - w.a.x) * dx + (pt.y - w.a.y) * dy) / l2;
      if (t <= 0.001 || t >= 0.999) continue;
      const px = w.a.x + dx * t;
      const py = w.a.y + dy * t;
      if (Math.hypot(pt.x - px, pt.y - py) < w.thickness / 2 + 2) return false;
    }
    return true;
  };
  const blockedAt = (x: number, y: number) => {
    const cx = Math.floor((x - origin.x) / CELL);
    const cy = Math.floor((y - origin.y) / CELL);
    if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return true;
    return grid[cy * gw + cx] === 1;
  };
  for (const e of endpoints) {
    if (!isFree(e.p, e)) continue;
    const dl = Math.hypot(e.p.x - e.other.x, e.p.y - e.other.y);
    if (dl < 1) continue;
    const dir = { x: (e.p.x - e.other.x) / dl, y: (e.p.y - e.other.y) / dl };
    // march: first escape our own stamped blob, then look for the next wall
    let escaped = false;
    let hit: Vec | null = null;
    for (let d = CELL; d <= MAX_EXTEND; d += CELL / 2) {
      const x = e.p.x + dir.x * d;
      const y = e.p.y + dir.y * d;
      const b = blockedAt(x, y);
      if (!b) escaped = true;
      else if (escaped) {
        hit = { x, y };
        break;
      }
    }
    if (hit) stampSeg(e.p, hit, CELL);
  }

  return { grid, gw, gh, origin };
}

/** Trace the outer boundary of a filled cell set into a rectilinear polygon. */
function traceBoundary(filled: Set<number>, gw: number, origin: Vec): Vec[] {
  // collect boundary edges (between filled and unfilled), then walk them
  type Edge = { a: Vec; b: Vec };
  const edges: Edge[] = [];
  const pt = (cx: number, cy: number): Vec => ({
    x: origin.x + cx * CELL,
    y: origin.y + cy * CELL,
  });
  for (const idx of filled) {
    const cx = idx % gw;
    const cy = Math.floor(idx / gw);
    if (!filled.has(idx - gw)) edges.push({ a: pt(cx, cy), b: pt(cx + 1, cy) }); // top
    if (!filled.has(idx + gw)) edges.push({ a: pt(cx + 1, cy + 1), b: pt(cx, cy + 1) }); // bottom
    if (!filled.has(idx - 1) || cx === 0) edges.push({ a: pt(cx, cy + 1), b: pt(cx, cy) }); // left
    if (!filled.has(idx + 1)) edges.push({ a: pt(cx + 1, cy), b: pt(cx + 1, cy + 1) }); // right
  }
  if (!edges.length) return [];
  // walk: map from start point to edge
  const key = (p: Vec) => `${Math.round(p.x)}:${Math.round(p.y)}`;
  const byStart = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = key(e.a);
    if (!byStart.has(k)) byStart.set(k, []);
    byStart.get(k)!.push(e);
  }
  const start = edges[0];
  const poly: Vec[] = [start.a];
  let cur = start;
  const used = new Set<Edge>([start]);
  for (let i = 0; i < edges.length + 2; i++) {
    const nexts = byStart.get(key(cur.b)) ?? [];
    const next = nexts.find((e) => !used.has(e));
    if (!next) break;
    used.add(next);
    poly.push(next.a);
    cur = next;
    if (key(cur.b) === key(start.a)) break;
  }
  // simplify collinear runs
  const out: Vec[] = [];
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const p = poly[i];
    const next = poly[(i + 1) % poly.length];
    const collinear =
      (Math.abs(prev.x - p.x) < 0.5 && Math.abs(p.x - next.x) < 0.5) ||
      (Math.abs(prev.y - p.y) < 0.5 && Math.abs(p.y - next.y) < 0.5);
    if (!collinear) out.push(p);
  }
  return out;
}

export function polygonArea(poly: Vec[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(poly: Vec[]): Vec {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-6) return poly[0] ?? { x: 0, y: 0 };
  a /= 2;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** The enclosed region under the cursor, or null if the space isn't enclosed. */
export function detectRoomAt(scene: Scene, p: Vec): DetectedRegion | null {
  const raster = rasterize(scene);
  if (!raster) return null;
  const { grid, gw, gh, origin } = raster;
  const sx = Math.floor((p.x - origin.x) / CELL);
  const sy = Math.floor((p.y - origin.y) / CELL);
  if (sx < 0 || sy < 0 || sx >= gw || sy >= gh) return null;
  if (grid[sy * gw + sx]) return null; // cursor on a wall

  const filled = new Set<number>();
  const stack = [sy * gw + sx];
  filled.add(sy * gw + sx);
  let escaped = false;
  while (stack.length) {
    const idx = stack.pop()!;
    if (filled.size > MAX_AREA_CELLS) return null;
    const cx = idx % gw;
    const cy = Math.floor(idx / gw);
    if (cx === 0 || cy === 0 || cx === gw - 1 || cy === gh - 1) {
      escaped = true;
      continue; // keep filling to fail fast is pointless; note and continue cheaply
    }
    for (const n of [idx - 1, idx + 1, idx - gw, idx + gw]) {
      if (filled.has(n) || grid[n]) continue;
      filled.add(n);
      stack.push(n);
    }
  }
  if (escaped) return null;

  const poly = traceBoundary(filled, gw, origin);
  if (poly.length < 4) return null;
  return { poly, areaM2: (filled.size * CELL * CELL) / 10000 };
}
