// Slice generated sprite sheets into individual black-on-transparent PNGs.
// Usage: node scripts/slice.mjs
import sharp from "sharp";
import { mkdir } from "fs/promises";
import path from "path";

const SHEETS = [
  "assets-src/sheet1-living.png",
  "assets-src/sheet2-tables.png",
  "assets-src/sheet3-kitchen.png",
  "assets-src/sheet4-bath.png",
];
const OUT = "public/sprites/raw";

const CELL = 8; // downsample factor for component detection
const MERGE_DIST = 40; // px: merge components closer than this
const MIN_AREA = 1500; // px^2: drop specks

await mkdir(OUT, { recursive: true });

for (const sheet of SHEETS) {
  const base = path.basename(sheet, ".png");
  const img = sharp(sheet).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // ink mask: transparent sheets -> alpha; white sheets -> darkness
  const gw = Math.ceil(W / CELL);
  const gh = Math.ceil(H / CELL);
  const grid = new Uint8Array(gw * gh);
  let alphaInk = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 200) alphaInk++;
  const useAlpha = alphaInk > (W * H) / 20; // significant transparency => alpha mode

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = data[i + 3];
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const ink = useAlpha ? a > 60 : lum < 190 && a > 60;
      if (ink) grid[Math.floor(y / CELL) * gw + Math.floor(x / CELL)] = 1;
    }
  }

  // connected components on the grid (8-connectivity)
  const label = new Int32Array(gw * gh).fill(-1);
  const boxes = [];
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const idx = gy * gw + gx;
      if (!grid[idx] || label[idx] !== -1) continue;
      const id = boxes.length;
      const box = { x0: gx, y0: gy, x1: gx, y1: gy, n: 0 };
      const stack = [idx];
      label[idx] = id;
      while (stack.length) {
        const cur = stack.pop();
        const cx = cur % gw;
        const cy = (cur / gw) | 0;
        box.x0 = Math.min(box.x0, cx);
        box.x1 = Math.max(box.x1, cx);
        box.y0 = Math.min(box.y0, cy);
        box.y1 = Math.max(box.y1, cy);
        box.n++;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            const ni = ny * gw + nx;
            if (grid[ni] && label[ni] === -1) {
              label[ni] = id;
              stack.push(ni);
            }
          }
        }
      }
      boxes.push(box);
    }
  }

  // merge nearby boxes until stable (plant leaves, detached strokes, ...)
  const md = MERGE_DIST / CELL;
  let merged = true;
  let list = boxes.filter((b) => b.n > 2);
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const gapX = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
        const gapY = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
        if (gapX <= md && gapY <= md) {
          a.x0 = Math.min(a.x0, b.x0);
          a.x1 = Math.max(a.x1, b.x1);
          a.y0 = Math.min(a.y0, b.y0);
          a.y1 = Math.max(a.y1, b.y1);
          a.n += b.n;
          list.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  list = list.filter(
    (b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * CELL * CELL >= MIN_AREA
  );
  // stable order: row-major by center
  list.sort((a, b) => {
    const ay = ((a.y0 + a.y1) / 2) | 0;
    const by = ((b.y0 + b.y1) / 2) | 0;
    if (Math.abs(ay - by) > gh / 6) return ay - by;
    return (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2;
  });

  console.log(`${base}: ${list.length} sprites`);

  // build black-on-transparent full-res buffer once
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = data[i + 3];
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // ink strength: how dark / how opaque
      const ink = useAlpha
        ? a / 255
        : a < 60
          ? 0
          : Math.max(0, Math.min(1, (230 - lum) / 150));
      out[i] = 20;
      out[i + 1] = 20;
      out[i + 2] = 24;
      out[i + 3] = Math.round(ink * 255);
    }
  }

  const full = sharp(out, { raw: { width: W, height: H, channels: 4 } });
  let k = 0;
  for (const b of list) {
    const pad = 6;
    const left = Math.max(0, b.x0 * CELL - pad);
    const top = Math.max(0, b.y0 * CELL - pad);
    const w = Math.min(W - left, (b.x1 - b.x0 + 1) * CELL + pad * 2);
    const h = Math.min(H - top, (b.y1 - b.y0 + 1) * CELL + pad * 2);
    await full
      .clone()
      .extract({ left, top, width: w, height: h })
      .png()
      .toFile(path.join(OUT, `${base}-${k}.png`));
    console.log(`  ${base}-${k}.png  ${w}x${h}`);
    k++;
  }
}
console.log("done");
