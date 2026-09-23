// Grid-aware slicer v3: connected components are assigned to grid cells by centroid,
// and each sprite crop masks out pixels belonging to other cells' components —
// no more slivers of neighboring sprites in a crop.
// Usage: node scripts/slice-grid.mjs [sheetFile ...]   (default: all sheets with a source png)
import sharp from "sharp";
import { mkdir, access } from "fs/promises";
import path from "path";
import { SHEETS, FIX_SHEETS } from "./catalog-def.mjs";

const OUT = "public/sprites";
const CELL = 8;

await mkdir(OUT, { recursive: true });

const only = process.argv.slice(2);
const sheets = [...SHEETS, ...FIX_SHEETS].filter((s) => !only.length || only.includes(s.file));

for (const sheet of sheets) {
  const src = `assets-src/${sheet.file}.png`;
  try {
    await access(src);
  } catch {
    console.log(`skip ${sheet.file} (no ${src})`);
    continue;
  }

  const COLS = sheet.cols ?? 4;
  const ROWS = sheet.rows ?? 4;

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // ink mask on a downsampled grid
  const gw = Math.ceil(W / CELL);
  const gh = Math.ceil(H / CELL);
  const mask = new Uint8Array(gw * gh);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = data[i + 3];
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (a > 60 && lum < 190) mask[((y / CELL) | 0) * gw + ((x / CELL) | 0)] = 1;
    }
  }

  // connected components — radius-1 keeps them small so per-component
  // centroid→cell assignment stays accurate near cell borders
  const label = new Int32Array(gw * gh).fill(-1);
  const comps = []; // {sx, sy, n}
  for (let idx = 0; idx < gw * gh; idx++) {
    if (!mask[idx] || label[idx] !== -1) continue;
    const id = comps.length;
    const comp = { sx: 0, sy: 0, n: 0 };
    const stack = [idx];
    label[idx] = id;
    while (stack.length) {
      const cur = stack.pop();
      const cx = cur % gw;
      const cy = (cur / gw) | 0;
      comp.sx += cx;
      comp.sy += cy;
      comp.n++;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (mask[ni] && label[ni] === -1) {
            label[ni] = id;
            stack.push(ni);
          }
        }
    }
    comps.push(comp);
  }

  // Assign components to cells: rows by centroid y, then within each row sort by x
  // and split at the (COLS-1) largest gaps — robust when objects drift off the grid.
  const cellOf = new Array(comps.length).fill(0);
  const rowsBuckets = Array.from({ length: ROWS }, () => []);
  comps.forEach((c, id) => {
    const cy = ((c.sy / c.n) * CELL) / (H / ROWS);
    rowsBuckets[Math.min(ROWS - 1, cy | 0)].push(id);
  });
  for (let r = 0; r < ROWS; r++) {
    const ids = rowsBuckets[r];
    if (!ids.length) continue;
    const xs = ids
      .map((id) => ({ id, x: (comps[id].sx / comps[id].n) * CELL }))
      .sort((a, b) => a.x - b.x);
    if (xs.length <= COLS) {
      // few components: centroid column is safe enough
      for (const { id, x } of xs) cellOf[id] = r * COLS + Math.min(COLS - 1, (x / (W / COLS)) | 0);
      continue;
    }
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push({ i, gap: xs[i].x - xs[i - 1].x });
    gaps.sort((a, b) => b.gap - a.gap);
    const splits = gaps
      .slice(0, COLS - 1)
      .map((g) => g.i)
      .sort((a, b) => a - b);
    let col = 0;
    for (let i = 0; i < xs.length; i++) {
      while (col < splits.length && i >= splits[col]) col++;
      cellOf[xs[i].id] = r * COLS + Math.min(COLS - 1, col);
    }
  }

  // per-cell bounding box over its components' grid cells
  const cellBox = Array.from({ length: COLS * ROWS }, () => null);
  for (let idx = 0; idx < gw * gh; idx++) {
    const l = label[idx];
    if (l === -1) continue;
    const ci = cellOf[l];
    const gx = idx % gw;
    const gy = (idx / gw) | 0;
    const b = cellBox[ci];
    if (!b) cellBox[ci] = { x0: gx, y0: gy, x1: gx, y1: gy, n: 1 };
    else {
      b.x0 = Math.min(b.x0, gx);
      b.x1 = Math.max(b.x1, gx);
      b.y0 = Math.min(b.y0, gy);
      b.y1 = Math.max(b.y1, gy);
      b.n++;
    }
  }

  console.log(`${sheet.file}: ${comps.length} components`);
  for (let ci = 0; ci < COLS * ROWS; ci++) {
    const item = sheet.items[ci];
    const b = cellBox[ci];
    if (!item) continue;
    if (!b || b.n < 4) {
      console.log(`  MISSING cell ${ci} (${item.id})`);
      continue;
    }
    const pad = 6;
    const left = Math.max(0, b.x0 * CELL - pad);
    const top = Math.max(0, b.y0 * CELL - pad);
    const w = Math.min(W - left, (b.x1 - b.x0 + 1) * CELL + pad * 2);
    const h = Math.min(H - top, (b.y1 - b.y0 + 1) * CELL + pad * 2);

    // black-on-transparent crop, masking out other cells' components
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = left + x;
        const sy = top + y;
        const si = (sy * W + sx) * 4;
        const a = data[si + 3];
        const lum = 0.299 * data[si] + 0.587 * data[si + 1] + 0.114 * data[si + 2];
        let ink = (a / 255) * Math.max(0, Math.min(1, (230 - lum) / 150));
        if (ink > 0) {
          // does this pixel belong to a component of this cell (or its close halo)?
          const gx = (sx / CELL) | 0;
          const gy = (sy / CELL) | 0;
          let mine = false;
          outer: for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = gx + dx;
              const ny = gy + dy;
              if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
              const nl = label[ny * gw + nx];
              if (nl !== -1 && cellOf[nl] === ci) {
                mine = true;
                break outer;
              }
            }
          if (!mine) ink = 0;
        }
        const oi = (y * w + x) * 4;
        out[oi] = 20;
        out[oi + 1] = 20;
        out[oi + 2] = 24;
        out[oi + 3] = Math.round(ink * 255);
      }
    }
    await sharp(out, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(path.join(OUT, `${item.id}.png`));
    console.log(`  ${item.id}.png ${w}x${h}`);
  }
}
console.log("done");
