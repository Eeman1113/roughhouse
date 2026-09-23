// Extract dark pen ink from a photo: background -> transparent, ink keeps its color.
// Usage: node scripts/extract-ink.mjs <input> <output> [--dark 150] [--soft 50]
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node scripts/extract-ink.mjs <input> <output> [--dark N] [--soft N]");
  process.exit(1);
}
const argN = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
// lum <= DARK => fully ink; lum >= DARK+SOFT => fully background
const DARK = argN("--dark", 150);
const SOFT = argN("--soft", 50);

const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

const MIN_AREA = argN("--min-area", 2500); // px²: drop dust specks / stray marks

const out = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const ink = Math.max(0, Math.min(1, (DARK + SOFT - lum) / SOFT));
    out[i] = data[i];
    out[i + 1] = data[i + 1];
    out[i + 2] = data[i + 2];
    out[i + 3] = Math.round(ink * data[i + 3]);
  }
}

// connected components on a 4x downsampled ink mask; erase small ones
const S = 4;
const gw = Math.ceil(W / S);
const gh = Math.ceil(H / S);
const mask = new Uint8Array(gw * gh);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (out[(y * W + x) * 4 + 3] > 128) mask[((y / S) | 0) * gw + ((x / S) | 0)] = 1;

const label = new Int32Array(gw * gh).fill(-1);
const comps = [];
for (let idx = 0; idx < gw * gh; idx++) {
  if (!mask[idx] || label[idx] !== -1) continue;
  const id = comps.length;
  const cells = [];
  const stack = [idx];
  label[idx] = id;
  while (stack.length) {
    const cur = stack.pop();
    cells.push(cur);
    const cx = cur % gw;
    const cy = (cur / gw) | 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (mask[ni] && label[ni] === -1) {
          label[ni] = id;
          stack.push(ni);
        }
      }
  }
  comps.push(cells);
}
// anchor bbox: big components only; small marks must sit near it
const ANCHOR_AREA = 2500;
let ax0 = gw, ay0 = gh, ax1 = 0, ay1 = 0;
for (let id = 0; id < comps.length; id++) {
  if (comps[id].length * S * S < ANCHOR_AREA) continue;
  for (const c of comps[id]) {
    const cx = c % gw, cy = (c / gw) | 0;
    ax0 = Math.min(ax0, cx); ax1 = Math.max(ax1, cx);
    ay0 = Math.min(ay0, cy); ay1 = Math.max(ay1, cy);
  }
}
const mx = (ax1 - ax0) * 0.02, my = (ay1 - ay0) * 0.02;

const keep = new Set();
for (let id = 0; id < comps.length; id++) {
  const area = comps[id].length * S * S;
  if (area >= ANCHOR_AREA) { keep.add(id); continue; }
  if (area < MIN_AREA) continue;
  const c0 = comps[id][0];
  const cx = c0 % gw, cy = (c0 / gw) | 0;
  if (cx >= ax0 - mx && cx <= ax1 + mx && cy >= ay0 - my && cy <= ay1 + my) keep.add(id);
}
console.log(`components: ${comps.length}, kept: ${keep.size}`);

let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (out[i + 3] === 0) continue;
    const l = label[((y / S) | 0) * gw + ((x / S) | 0)];
    if (l === -1 || !keep.has(l)) {
      // faint halo pixels around a removed speck, or isolated faint noise
      if (l !== -1) out[i + 3] = 0;
      else {
        // keep faint anti-aliasing only if adjacent cell belongs to a kept component
        const cx = (x / S) | 0, cy = (y / S) | 0;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1 && !near; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            const nl = label[ny * gw + nx];
            if (nl !== -1 && keep.has(nl)) near = true;
          }
        if (!near) out[i + 3] = 0;
      }
    }
    if (out[i + 3] > 128) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

if (maxX <= minX || maxY <= minY) {
  console.error("no ink found — try a higher --dark value");
  process.exit(1);
}

const pad = 40;
const left = Math.max(0, minX - pad);
const top = Math.max(0, minY - pad);
const width = Math.min(W - left, maxX - minX + pad * 2);
const height = Math.min(H - top, maxY - minY + pad * 2);

await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width, height })
  .png()
  .toFile(output);
console.log(`${output} ${width}x${height} (from ${W}x${H})`);
