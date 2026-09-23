// Re-slice one row of a sheet using gaps NEAREST TO EXPECTED cell boundaries
// (for rows where an object has big internal gaps that fool largest-gap splitting).
// Usage: node scripts/fix-row.mjs <sheetFile> <rowIndex> <id0> <id1> ...
import sharp from "sharp";
import path from "path";

const [file, rowStr, ...ids] = process.argv.slice(2);
const ROW = Number(rowStr);
const COLS = ids.length;
const src = `assets-src/${file}.png`;
const OUT = "public/sprites";

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

// assume 4 rows unless the sheet is short; row band with a little slack
const ROWS = 4;
const y0 = Math.max(0, Math.floor((ROW / ROWS) * H) - 20);
const y1 = ROW === ROWS - 1 ? H : Math.min(H, Math.ceil(((ROW + 1) / ROWS) * H) + 20);

const ink = (i) => {
  const a = data[i + 3];
  const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return a > 60 && lum < 190;
};

// column ink profile for the row band
const colInk = new Uint32Array(W);
for (let y = y0; y < y1; y++)
  for (let x = 0; x < W; x++) if (ink((y * W + x) * 4)) colInk[x]++;

// gap runs (columns with no ink)
const gaps = [];
let start = -1;
for (let x = 0; x <= W; x++) {
  const empty = x < W ? colInk[x] === 0 : false;
  if (empty && start === -1) start = x;
  if (!empty && start !== -1) {
    gaps.push({ from: start, to: x, center: (start + x) / 2, len: x - start });
    start = -1;
  }
}

// pick, for each expected boundary, the gap center closest to it
const bounds = [0];
for (let k = 1; k < COLS; k++) {
  const target = (k / COLS) * W;
  let best = null;
  for (const g of gaps) {
    if (g.len < 8) continue;
    const d = Math.abs(g.center - target);
    if (!best || d < best.d) best = { d, c: g.center };
  }
  bounds.push(Math.round(best ? best.c : target));
}
bounds.push(W);
console.log("boundaries:", bounds.join(", "));

for (let k = 0; k < COLS; k++) {
  const xa = bounds[k];
  const xb = bounds[k + 1];
  // bbox of ink within [xa,xb) x [y0,y1)
  let mx0 = W, my0 = H, mx1 = 0, my1 = 0;
  for (let y = y0; y < y1; y++)
    for (let x = xa; x < xb; x++)
      if (ink((y * W + x) * 4)) {
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        if (y > my1) my1 = y;
      }
  if (mx1 <= mx0) {
    console.log(`  ${ids[k]}: EMPTY`);
    continue;
  }
  const pad = 6;
  const left = Math.max(xa, mx0 - pad);
  const top = Math.max(y0, my0 - pad);
  const w = Math.min(xb - left, mx1 - mx0 + pad * 2);
  const h = Math.min(y1 - top, my1 - my0 + pad * 2);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = ((top + y) * W + (left + x)) * 4;
      const a = data[si + 3];
      const lum = 0.299 * data[si] + 0.587 * data[si + 1] + 0.114 * data[si + 2];
      const v = (a / 255) * Math.max(0, Math.min(1, (230 - lum) / 150));
      const oi = (y * w + x) * 4;
      out[oi] = 20;
      out[oi + 1] = 20;
      out[oi + 2] = 24;
      out[oi + 3] = Math.round(v * 255);
    }
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(path.join(OUT, `${ids[k]}.png`));
  console.log(`  ${ids[k]}.png ${w}x${h}`);
}
