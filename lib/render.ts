import {
  add,
  cross,
  fmtLen,
  lerp,
  norm,
  openingCenter,
  perp,
  scale,
  sub,
  wallArc,
  wallLen,
  wallPointAt,
  wallTangentAt,
} from "./geometry";
import { birth } from "./anim";
import { getItemSprite } from "./sprites";
import { polygonArea, polygonCentroid } from "./rooms";
import { wallHeight } from "./scale";
import { Item, Note, Room, Scene, Selection, Stairs, Vec, Wall } from "./types";

export interface Palette {
  bg: string;
  gridMinor: string;
  gridMajor: string;
  wall: string;
  wallStroke: string;
  symbol: string; // doors/windows/stairs line work
  item: string;
  itemFill: string;
  select: string;
  hover: string;
  label: string;
  labelBg: string;
}

export const DARK: Palette = {
  bg: "#101013",
  gridMinor: "#1a1a1f",
  gridMajor: "#26262d",
  wall: "#d6d3d1",
  wallStroke: "#d6d3d1",
  symbol: "#a8a29e",
  item: "#c2c2ca",
  itemFill: "rgba(139,139,147,0.08)",
  select: "#4f9cf9",
  hover: "#4f9cf955",
  label: "#e7e5e4",
  labelBg: "#101013cc",
};

export const PRINT: Palette = {
  bg: "#ffffff",
  gridMinor: "#f0f0f0",
  gridMajor: "#e0e0e0",
  wall: "#1c1c1c",
  wallStroke: "#1c1c1c",
  symbol: "#444444",
  item: "#555555",
  itemFill: "rgba(0,0,0,0.03)",
  select: "#4f9cf9",
  hover: "#4f9cf955",
  label: "#1c1c1c",
  labelBg: "#ffffffcc",
};

export const GRID_MINOR = 50; // cm
export const GRID_MAJOR = 100; // cm

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  pan: Vec,
  zoom: number,
  w: number,
  h: number
) {
  const x0 = -pan.x / zoom;
  const y0 = -pan.y / zoom;
  const x1 = (w - pan.x) / zoom;
  const y1 = (h - pan.y) / zoom;

  const drawLines = (step: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
  };

  if (zoom > 0.35) drawLines(GRID_MINOR, pal.gridMinor);
  drawLines(GRID_MAJOR, pal.gridMajor);
}

export function wallPath(ctx: CanvasRenderingContext2D, w: Wall) {
  ctx.beginPath();
  const arc = wallArc(w);
  if (arc) {
    ctx.arc(arc.c.x, arc.c.y, arc.r, arc.a0, arc.a1, arc.ccw);
    return;
  }
  ctx.moveTo(w.a.x, w.a.y);
  ctx.lineTo(w.b.x, w.b.y);
}

/** Extra cut depth so a straight opening fully clears a curved wall's sag. */
function curveSag(w: Wall, width: number): number {
  const arc = wallArc(w);
  return arc ? (width * width) / (8 * arc.r) + 2 : 0;
}

export function drawWalls(ctx: CanvasRenderingContext2D, scene: Scene, pal: Palette) {
  ctx.lineCap = "square";
  for (const w of scene.walls) {
    ctx.strokeStyle = w.color ?? pal.wall;
    ctx.lineWidth = w.thickness;
    // knee walls / half walls read translucent (standard plan notation)
    const low = wallHeight(scene, w) < 150;
    if (low) ctx.globalAlpha = 0.55;
    wallPath(ctx, w);
    ctx.stroke();
    if (low) ctx.globalAlpha = 1;
  }
  ctx.lineCap = "butt";
}

/** Rect aligned to the wall, centered at the opening. */
function openingRect(
  ctx: CanvasRenderingContext2D,
  c: Vec,
  u: Vec,
  width: number,
  depth: number
) {
  const n = perp(u);
  const hw = width / 2;
  const hd = depth / 2;
  const p1 = add(add(c, scale(u, -hw)), scale(n, -hd));
  const p2 = add(add(c, scale(u, hw)), scale(n, -hd));
  const p3 = add(add(c, scale(u, hw)), scale(n, hd));
  const p4 = add(add(c, scale(u, -hw)), scale(n, hd));
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
}

export function drawOpenings(ctx: CanvasRenderingContext2D, scene: Scene, pal: Palette) {
  for (const o of scene.openings) {
    const wall = scene.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const c = openingCenter(o, wall);
    const u = wallTangentAt(wall, o.t);
    const n = perp(u);
    const th = wall.thickness;

    // Cut the wall (deeper on curved walls so the arc's sag is fully cleared)
    openingRect(ctx, c, u, o.width, th + 2 + curveSag(wall, o.width) * 2);
    ctx.fillStyle = pal.bg;
    ctx.fill();

    ctx.strokeStyle = pal.symbol;
    ctx.fillStyle = pal.symbol;

    const jamb1 = add(c, scale(u, -o.width / 2));
    const jamb2 = add(c, scale(u, o.width / 2));

    // Jamb caps (both ends of the cut)
    ctx.lineWidth = 2;
    for (const j of [jamb1, jamb2]) {
      ctx.beginPath();
      ctx.moveTo(j.x - n.x * (th / 2), j.y - n.y * (th / 2));
      ctx.lineTo(j.x + n.x * (th / 2), j.y + n.y * (th / 2));
      ctx.stroke();
    }

    if (o.kind === "window") {
      openingRect(ctx, c, u, o.width, th * 0.7);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(jamb1.x, jamb1.y);
      ctx.lineTo(jamb2.x, jamb2.y);
      ctx.stroke();
    } else if (o.kind === "doorway") {
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(jamb1.x, jamb1.y);
      ctx.lineTo(jamb2.x, jamb2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (o.kind === "door-single") {
      const hinge = o.swing ? jamb2 : jamb1;
      const other = o.swing ? jamb1 : jamb2;
      drawLeaf(ctx, hinge, other, o.flip ? n : scale(n, -1), o.width);
    } else if (o.kind === "door-double") {
      const side = o.flip ? n : scale(n, -1);
      drawLeaf(ctx, jamb1, c, side, o.width / 2);
      drawLeaf(ctx, jamb2, c, side, o.width / 2);
    } else if (o.kind === "door-sliding") {
      const off = th * 0.28;
      ctx.lineWidth = 3;
      const s1a = add(jamb1, scale(n, -off));
      const s1b = add(lerp(jamb1, jamb2, 0.55), scale(n, -off));
      const s2a = add(lerp(jamb1, jamb2, 0.45), scale(n, off));
      const s2b = add(jamb2, scale(n, off));
      ctx.beginPath();
      ctx.moveTo(s1a.x, s1a.y);
      ctx.lineTo(s1b.x, s1b.y);
      ctx.moveTo(s2a.x, s2a.y);
      ctx.lineTo(s2b.x, s2b.y);
      ctx.stroke();
    } else if (o.kind === "door-pocket") {
      // panel half-covering the opening, sliding into a dashed wall pocket
      const from = o.swing ? jamb2 : jamb1;
      const dir = o.swing ? scale(u, -1) : u;
      const panelEnd = add(from, scale(dir, o.width * 0.5));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(panelEnd.x, panelEnd.y);
      ctx.stroke();
      const pocketEnd = add(from, scale(dir, -o.width * 0.55));
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(pocketEnd.x, pocketEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (o.kind === "door-bifold") {
      // two folding panel pairs meeting at the center (closet style)
      const side = o.flip ? 1 : -1;
      const peak = th / 2 + o.width * 0.18;
      const q1 = add(add(c, scale(u, -o.width * 0.25)), scale(n, side * peak));
      const q2 = add(add(c, scale(u, o.width * 0.25)), scale(n, side * peak));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(jamb1.x, jamb1.y);
      ctx.lineTo(q1.x, q1.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(q2.x, q2.y);
      ctx.lineTo(jamb2.x, jamb2.y);
      ctx.stroke();
    } else if (o.kind === "door-garage") {
      // panel across the opening + dashed overhead tracks into the room
      openingRect(ctx, c, u, o.width, th * 0.5);
      ctx.lineWidth = 2;
      ctx.stroke();
      const side = o.flip ? 1 : -1;
      const trackLen = Math.min(o.width * 0.6, 180);
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 1.5;
      for (const j of [add(c, scale(u, -o.width * 0.38)), add(c, scale(u, o.width * 0.38))]) {
        const end = add(j, scale(n, side * trackLen));
        ctx.beginPath();
        ctx.moveTo(j.x, j.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (o.kind === "window-casement") {
      // fixed frame + thin opening arc like a small door leaf
      openingRect(ctx, c, u, o.width, th * 0.7);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const hinge = o.swing ? jamb2 : jamb1;
      const other = o.swing ? jamb1 : jamb2;
      drawLeaf(ctx, hinge, other, o.flip ? n : scale(n, -1), o.width);
    } else if (o.kind === "window-double-casement") {
      openingRect(ctx, c, u, o.width, th * 0.7);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const side = o.flip ? n : scale(n, -1);
      drawLeaf(ctx, jamb1, c, side, o.width / 2);
      drawLeaf(ctx, jamb2, c, side, o.width / 2);
    } else if (o.kind === "window-sliding") {
      // two overlapping panes inside the wall depth
      const off = th * 0.16;
      ctx.lineWidth = 2;
      const p1a = add(jamb1, scale(n, -off));
      const p1b = add(lerp(jamb1, jamb2, 0.55), scale(n, -off));
      const p2a = add(lerp(jamb1, jamb2, 0.45), scale(n, off));
      const p2b = add(jamb2, scale(n, off));
      ctx.beginPath();
      ctx.moveTo(p1a.x, p1a.y);
      ctx.lineTo(p1b.x, p1b.y);
      ctx.moveTo(p2a.x, p2a.y);
      ctx.lineTo(p2b.x, p2b.y);
      ctx.stroke();
    } else if (o.kind === "window-bay") {
      // trapezoid protruding outward with three glass runs
      const side = o.flip ? 1 : -1;
      const depth = Math.min(90, o.width * 0.35);
      const b1 = add(add(c, scale(u, -o.width * 0.3)), scale(n, side * (th / 2 + depth)));
      const b2 = add(add(c, scale(u, o.width * 0.3)), scale(n, side * (th / 2 + depth)));
      const j1 = add(jamb1, scale(n, side * (th / 2)));
      const j2 = add(jamb2, scale(n, side * (th / 2)));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(j1.x, j1.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(j2.x, j2.y);
      ctx.stroke();
      // glass center lines on each run
      ctx.lineWidth = 1;
      const mids: [Vec, Vec][] = [
        [j1, b1],
        [b1, b2],
        [b2, j2],
      ];
      ctx.beginPath();
      for (const [a2, b3] of mids) {
        const m1 = lerp(a2, b3, 0.12);
        const m2 = lerp(a2, b3, 0.88);
        ctx.moveTo(m1.x, m1.y);
        ctx.lineTo(m2.x, m2.y);
      }
      ctx.stroke();
    }
  }
}

/** Door leaf line + quarter-circle swing arc. */
function drawLeaf(
  ctx: CanvasRenderingContext2D,
  hinge: Vec,
  toward: Vec,
  side: Vec,
  radius: number
) {
  const dirToOther = norm(sub(toward, hinge));
  const leafEnd = add(hinge, scale(side, radius));

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hinge.x, hinge.y);
  ctx.lineTo(leafEnd.x, leafEnd.y);
  ctx.stroke();

  const a0 = Math.atan2(dirToOther.y, dirToOther.x);
  const a1 = Math.atan2(side.y, side.x);
  const ccw = cross(dirToOther, side) < 0;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hinge.x, hinge.y, radius, a0, a1, ccw);
  ctx.stroke();
}

export function drawStairs(ctx: CanvasRenderingContext2D, s: Stairs, pal: Palette) {
  const b = birth(s.id);
  ctx.save();
  ctx.translate(s.pos.x, s.pos.y);
  ctx.rotate(s.rot);
  ctx.scale(b.scale, b.scale);
  ctx.globalAlpha *= b.alpha;
  ctx.strokeStyle = pal.symbol;
  ctx.fillStyle = pal.itemFill;
  ctx.lineWidth = 1.5;

  if (s.kind === "straight") {
    const hw = s.width / 2;
    const hl = s.length / 2;
    ctx.beginPath();
    ctx.rect(-hw, -hl, s.width, s.length);
    ctx.fill();
    ctx.stroke();
    // treads
    const step = s.length / s.steps;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < s.steps; i++) {
      const y = -hl + i * step;
      ctx.moveTo(-hw, y);
      ctx.lineTo(hw, y);
    }
    ctx.stroke();
    // walk line + arrow pointing "up" (towards -y in local space)
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, hl - step / 2);
    ctx.lineTo(0, -hl + step);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -hl + 2);
    ctx.lineTo(-hw * 0.25, -hl + step);
    ctx.lineTo(hw * 0.25, -hl + step);
    ctx.closePath();
    ctx.fillStyle = pal.symbol;
    ctx.fill();
  } else {
    // spiral
    const r = s.width / 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    const sweep = Math.PI * 1.75;
    for (let i = 0; i < s.steps; i++) {
      const a = -Math.PI / 2 + (i / s.steps) * sweep;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    // arrow at the end of the sweep
    const aEnd = -Math.PI / 2 + sweep;
    const ax = Math.cos(aEnd) * r * 0.7;
    const ay = Math.sin(aEnd) * r * 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, -Math.PI / 2, aEnd);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    const tang = aEnd + Math.PI / 2;
    ctx.moveTo(ax + Math.cos(tang) * 10, ay + Math.sin(tang) * 10);
    ctx.lineTo(ax + Math.cos(aEnd) * 6, ay + Math.sin(aEnd) * 6);
    ctx.lineTo(ax - Math.cos(aEnd) * 6, ay - Math.sin(aEnd) * 6);
    ctx.closePath();
    ctx.fillStyle = pal.symbol;
    ctx.fill();
  }
  ctx.restore();
}

export function drawItem(ctx: CanvasRenderingContext2D, it: Item, pal: Palette) {
  const b = birth(it.id);
  const sprite = getItemSprite(it.kind, pal.item);
  if (sprite) {
    ctx.save();
    ctx.translate(it.pos.x, it.pos.y);
    ctx.rotate(it.rot);
    ctx.scale(b.scale, b.scale);
    ctx.globalAlpha *= b.alpha;
    // if the sprite's orientation disagrees with the item's footprint,
    // rotate it a quarter turn instead of squishing it
    const spriteLandscape = sprite.width >= sprite.height;
    const boxLandscape = it.w >= it.h;
    if (spriteLandscape !== boxLandscape) {
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(sprite, -it.h / 2, -it.w / 2, it.h, it.w);
    } else {
      ctx.drawImage(sprite, -it.w / 2, -it.h / 2, it.w, it.h);
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(it.pos.x, it.pos.y);
  ctx.rotate(it.rot);
  ctx.scale(b.scale, b.scale);
  ctx.globalAlpha *= b.alpha;
  ctx.strokeStyle = pal.item;
  ctx.fillStyle = pal.itemFill;
  ctx.lineWidth = 1.5;
  const w = it.w;
  const h = it.h;
  const hw = w / 2;
  const hh = h / 2;

  const box = (x: number, y: number, bw: number, bh: number, r = 0) => {
    ctx.beginPath();
    if (r > 0 && "roundRect" in ctx) ctx.roundRect(x, y, bw, bh, r);
    else ctx.rect(x, y, bw, bh);
  };

  switch (it.kind) {
    case "bed-single":
    case "bed-double": {
      box(-hw, -hh, w, h, 4);
      ctx.fill();
      ctx.stroke();
      // pillows at top
      const pillows = it.kind === "bed-double" ? 2 : 1;
      const pw = (w - 20 - (pillows - 1) * 8) / pillows;
      for (let i = 0; i < pillows; i++) {
        box(-hw + 10 + i * (pw + 8), -hh + 8, pw, 28, 6);
        ctx.stroke();
      }
      // blanket line
      ctx.beginPath();
      ctx.moveTo(-hw, -hh + 55);
      ctx.lineTo(hw, -hh + 55);
      ctx.stroke();
      break;
    }
    case "sofa": {
      box(-hw, -hh, w, h, 8);
      ctx.fill();
      ctx.stroke();
      // back + arms
      box(-hw, -hh, w, 18, 8);
      ctx.stroke();
      box(-hw, -hh, 18, h, 8);
      ctx.stroke();
      box(hw - 18, -hh, 18, h, 8);
      ctx.stroke();
      break;
    }
    case "armchair": {
      box(-hw, -hh, w, h, 10);
      ctx.fill();
      ctx.stroke();
      box(-hw, -hh, w, 15, 8);
      ctx.stroke();
      box(-hw, -hh, 15, h, 8);
      ctx.stroke();
      box(hw - 15, -hh, 15, h, 8);
      ctx.stroke();
      break;
    }
    case "table-rect":
    case "desk":
    case "counter": {
      box(-hw, -hh, w, h);
      ctx.fill();
      ctx.stroke();
      if (it.kind === "desk") {
        // chair nook
        box(-20, hh - 6, 40, 12);
        ctx.stroke();
      }
      break;
    }
    case "table-round": {
      ctx.beginPath();
      ctx.arc(0, 0, hw, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "chair": {
      box(-hw, -hh, w, h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-hw, -hh + 8);
      ctx.lineTo(hw, -hh + 8);
      ctx.stroke();
      break;
    }
    case "wardrobe": {
      box(-hw, -hh, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(0, hh);
      ctx.moveTo(-hw, -hh);
      ctx.lineTo(hw, hh);
      ctx.moveTo(hw, -hh);
      ctx.lineTo(-hw, hh);
      ctx.stroke();
      break;
    }
    case "stove": {
      box(-hw, -hh, w, h);
      ctx.fill();
      ctx.stroke();
      for (const [bx, by] of [
        [-hw / 2, -hh / 2],
        [hw / 2, -hh / 2],
        [-hw / 2, hh / 2],
        [hw / 2, hh / 2],
      ]) {
        ctx.beginPath();
        ctx.arc(bx, by, Math.min(hw, hh) * 0.32, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "fridge": {
      box(-hw, -hh, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-hw + 6, -hh + 6);
      ctx.lineTo(-hw + 6, -hh + 20);
      ctx.stroke();
      break;
    }
    case "kitchen-sink": {
      box(-hw, -hh, w, h);
      ctx.fill();
      ctx.stroke();
      box(-hw + 8, -hh + 8, w - 16, h - 16, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -hh + 4, 3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "toilet": {
      // tank
      box(-hw, -hh, w, h * 0.3, 3);
      ctx.fill();
      ctx.stroke();
      // bowl
      ctx.beginPath();
      ctx.ellipse(0, hh * 0.28, hw * 0.85, hh * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "sink": {
      box(-hw, -hh, w, h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 2, hw * 0.6, hh * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "bathtub": {
      box(-hw, -hh, w, h, 10);
      ctx.fill();
      ctx.stroke();
      box(-hw + 8, -hh + 8, w - 16, h - 16, 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -hh + 22, 5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "shower": {
      box(-hw, -hh, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-hw, -hh);
      ctx.lineTo(hw, hh);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-hw + 14, -hh + 14, 6, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "plant": {
      ctx.beginPath();
      ctx.arc(0, 0, hw, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(
          Math.cos(a) * hw * 0.45,
          Math.sin(a) * hw * 0.45,
          hw * 0.4,
          hw * 0.16,
          a,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
      break;
    }
    default: {
      // generic placeholder while the sprite loads (or if it's missing)
      box(-hw, -hh, w, h, 4);
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** Small centered caption under each house's visible footprint. */
export function drawHouseLabels(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  pal: Palette,
  zoom: number
) {
  for (const house of scene.houses ?? []) {
    const walls = scene.walls.filter(
      (w) => w.houseId === house.id && w.floorId === house.activeFloorId
    );
    if (!walls.length) continue;
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of walls) {
      for (const p of [w.a, w.b]) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const floor = house.floors.find((f) => f.id === house.activeFloorId);
    const label =
      house.floors.length > 1 && floor ? `${house.name} \u00b7 ${floor.name}` : house.name;
    ctx.save();
    ctx.font = `600 ${16 / zoom}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = pal.symbol;
    ctx.globalAlpha = 0.75;
    ctx.fillText(label, (minX + maxX) / 2, maxY + 18 / zoom);
    ctx.restore();
  }
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  room: Room,
  pal: Palette,
  zoom: number
) {
  if (room.poly.length < 3) return;
  const b = birth(room.id);
  ctx.save();
  ctx.globalAlpha *= b.alpha;
  ctx.beginPath();
  ctx.moveTo(room.poly[0].x, room.poly[0].y);
  for (let i = 1; i < room.poly.length; i++) ctx.lineTo(room.poly[i].x, room.poly[i].y);
  ctx.closePath();
  ctx.fillStyle = room.color;
  ctx.globalAlpha = pal === PRINT ? 0.07 : 0.1;
  ctx.fill();
  ctx.globalAlpha = 1;
  // name + area at the centroid
  const c = polygonCentroid(room.poly);
  const area = polygonArea(room.poly) / 10000;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${13 / zoom}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  ctx.fillStyle = pal === PRINT ? "#1c1c1c" : room.color;
  ctx.globalAlpha = 0.95;
  ctx.fillText(room.name, c.x, c.y - 8 / zoom);
  ctx.font = `400 ${10 / zoom}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  ctx.fillStyle = pal.symbol;
  ctx.fillText(`${area.toFixed(1)} m\u00b2`, c.x, c.y + 8 / zoom);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// measured note text boxes (world units), refreshed every draw — used for hit-testing
const noteBBoxes = new Map<string, { w: number; h: number }>();
export function getNoteBBox(id: string): { w: number; h: number } | undefined {
  return noteBBoxes.get(id);
}

export function drawNote(ctx: CanvasRenderingContext2D, n: Note, pal: Palette) {
  const b = birth(n.id);
  ctx.save();
  ctx.globalAlpha *= b.alpha;
  ctx.font = `500 ${n.size}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  const tw = ctx.measureText(n.text).width;
  noteBBoxes.set(n.id, { w: tw + 10 + n.size * 0.4, h: n.size * 1.3 });
  // leader dot
  ctx.beginPath();
  ctx.arc(n.pos.x, n.pos.y, Math.max(3, n.size * 0.14), 0, Math.PI * 2);
  ctx.fillStyle = pal.symbol;
  ctx.fill();
  ctx.fillStyle = pal.label;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(n.text, n.pos.x + 10 + n.size * 0.2, n.pos.y);
  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  pal: Palette,
  zoom = 1
) {
  for (const r of scene.rooms ?? []) drawRoom(ctx, r, pal, zoom);
  drawWalls(ctx, scene, pal);
  drawOpenings(ctx, scene, pal);
  for (const s of scene.stairs) drawStairs(ctx, s, pal);
  for (const it of scene.items) drawItem(ctx, it, pal);
  for (const n of scene.notes ?? []) drawNote(ctx, n, pal);
  // stairs that lead to another floor get a small direction label
  for (const s of scene.stairs) {
    if (!s.linkTo || !s.houseId) continue;
    const house = (scene.houses ?? []).find((h) => h.id === s.houseId);
    const floor = house?.floors.find((f) => f.id === s.linkTo);
    if (!floor) continue;
    const hw = s.width / 2;
    const hh = (s.kind === "spiral" ? s.width : s.length) / 2;
    ctx.save();
    ctx.font = `600 ${12 / zoom}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = pal.symbol;
    ctx.fillText(`\u2191 ${floor.name}`, s.pos.x + hw + 6 / zoom, s.pos.y - hh - 4 / zoom);
    ctx.restore();
  }
}

export function drawWallLabel(
  ctx: CanvasRenderingContext2D,
  w: Wall,
  pal: Palette,
  zoom: number
) {
  const mid = wallPointAt(w, 0.5);
  const n = perp(wallTangentAt(w, 0.5));
  const off = (w.thickness / 2 + 14 / zoom);
  const p = add(mid, scale(n, -off));
  const text = fmtLen(wallLen(w));
  ctx.save();
  ctx.font = `${12 / zoom}px ui-sans-serif, system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = pal.labelBg;
  ctx.fillRect(p.x - tw / 2 - 4 / zoom, p.y - 9 / zoom, tw + 8 / zoom, 18 / zoom);
  ctx.fillStyle = pal.label;
  ctx.fillText(text, p.x, p.y);
  ctx.restore();
}

/** Selection overlays drawn on top of the scene.
 *  `solo` = this is the only selected element: show handles + labels. */
export function drawSelection(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  sel: Selection,
  pal: Palette,
  zoom: number,
  solo = true
) {
  ctx.strokeStyle = pal.select;
  if (sel.kind === "wall") {
    const w = scene.walls.find((x) => x.id === sel.id);
    if (!w) return;
    ctx.lineWidth = w.thickness + 4 / zoom;
    ctx.globalAlpha = 0.35;
    ctx.lineCap = "square";
    wallPath(ctx, w);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
    if (solo) {
      // endpoint handles
      for (const p of [w.a, w.b]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = pal.bg;
        ctx.fill();
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
      }
      // bend handle: a diamond at the wall's midpoint — drag it to curve the wall
      if (!w.locked) {
        const m = wallPointAt(w, 0.5);
        const r = 6 / zoom;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y - r);
        ctx.lineTo(m.x + r, m.y);
        ctx.lineTo(m.x, m.y + r);
        ctx.lineTo(m.x - r, m.y);
        ctx.closePath();
        ctx.fillStyle = pal.select;
        ctx.fill();
        ctx.lineWidth = 2 / zoom;
        ctx.strokeStyle = pal.bg;
        ctx.stroke();
        ctx.strokeStyle = pal.select;
      }
      drawWallLabel(ctx, w, pal, zoom);
    }
  } else if (sel.kind === "opening") {
    const o = scene.openings.find((x) => x.id === sel.id);
    const w = o && scene.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return;
    const c = openingCenter(o, w);
    const u = wallTangentAt(w, o.t);
    ctx.lineWidth = 2 / zoom;
    openingRect(ctx, c, u, o.width + 8 / zoom, w.thickness + 16 / zoom);
    ctx.stroke();
  } else if (sel.kind === "stairs") {
    const s = scene.stairs.find((x) => x.id === sel.id);
    if (!s) return;
    const h = s.kind === "spiral" ? s.width : s.length;
    drawRotBox(ctx, pal, s.pos, s.rot, s.width, h, zoom, solo);
  } else if (sel.kind === "item") {
    const it = scene.items.find((x) => x.id === sel.id);
    if (!it) return;
    drawRotBox(ctx, pal, it.pos, it.rot, it.w, it.h, zoom, solo);
  } else if (sel.kind === "room") {
    const r = scene.rooms.find((x) => x.id === sel.id);
    if (!r || r.poly.length < 3) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(r.poly[0].x, r.poly[0].y);
    for (let i = 1; i < r.poly.length; i++) ctx.lineTo(r.poly[i].x, r.poly[i].y);
    ctx.closePath();
    ctx.strokeStyle = pal.select;
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([8 / zoom, 5 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if (sel.kind === "note") {
    const n = scene.notes.find((x) => x.id === sel.id);
    if (!n) return;
    const bb = getNoteBBox(n.id) ?? { w: n.size * 4, h: n.size * 1.3 };
    ctx.strokeStyle = pal.select;
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(n.pos.x - 6 / zoom, n.pos.y - bb.h / 2 - 4 / zoom, bb.w + 12 / zoom, bb.h + 8 / zoom);
  }

  // padlock badge for locked elements
  const lockedAt = ((): Vec | null => {
    if (sel.kind === "wall") {
      const w = scene.walls.find((x) => x.id === sel.id);
      return w?.locked ? wallPointAt(w, 0.5) : null;
    }
    if (sel.kind === "item") {
      const it = scene.items.find((x) => x.id === sel.id);
      return it?.locked ? { x: it.pos.x - it.w / 2, y: it.pos.y - it.h / 2 } : null;
    }
    if (sel.kind === "stairs") {
      const st = scene.stairs.find((x) => x.id === sel.id);
      return st?.locked
        ? { x: st.pos.x - st.width / 2, y: st.pos.y - (st.kind === "spiral" ? st.width : st.length) / 2 }
        : null;
    }
    if (sel.kind === "room") {
      const r = scene.rooms.find((x) => x.id === sel.id);
      return r?.locked && r.poly.length ? r.poly[0] : null;
    }
    if (sel.kind === "note") {
      const n = scene.notes.find((x) => x.id === sel.id);
      return n?.locked ? n.pos : null;
    }
    return null;
  })();
  if (lockedAt) {
    // tiny padlock: rounded body + arc shackle
    const u = 1 / zoom;
    const cx = lockedAt.x - 12 * u;
    const cy = lockedAt.y - 12 * u;
    ctx.save();
    ctx.strokeStyle = pal.select;
    ctx.fillStyle = pal.bg;
    ctx.lineWidth = 1.5 * u;
    // shackle
    ctx.beginPath();
    ctx.arc(cx, cy - 3 * u, 3 * u, Math.PI, 0);
    ctx.stroke();
    // body
    ctx.beginPath();
    ctx.roundRect(cx - 4 * u, cy - 3 * u, 8 * u, 6 * u, 1.5 * u);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/** Distance of the rotate handle from the element center, in world units. */
export function rotateHandleOffset(h: number, zoom: number): number {
  return h / 2 + 30 / zoom;
}

/** World position of the rotate handle for a rotatable element. */
export function rotateHandlePos(pos: Vec, rot: number, h: number, zoom: number): Vec {
  const d = rotateHandleOffset(h, zoom);
  return { x: pos.x + Math.sin(rot) * d, y: pos.y - Math.cos(rot) * d };
}

/** Local-space corner positions of the selection box (for scale handles). */
export function scaleHandleLocals(w: number, h: number, zoom: number): Vec[] {
  const hx = w / 2 + 6 / zoom;
  const hy = h / 2 + 6 / zoom;
  return [
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy },
  ];
}

/** World positions of the four corner scale handles. */
export function scaleHandlePositions(
  pos: Vec,
  rot: number,
  w: number,
  h: number,
  zoom: number
): Vec[] {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return scaleHandleLocals(w, h, zoom).map((l) => ({
    x: pos.x + l.x * cos - l.y * sin,
    y: pos.y + l.x * sin + l.y * cos,
  }));
}

function drawRotBox(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  pos: Vec,
  rot: number,
  w: number,
  h: number,
  zoom: number,
  handles = true
) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(rot);
  ctx.lineWidth = 2 / zoom;
  ctx.strokeStyle = pal.select;
  ctx.strokeRect(-w / 2 - 6 / zoom, -h / 2 - 6 / zoom, w + 12 / zoom, h + 12 / zoom);
  if (!handles) {
    ctx.restore();
    return;
  }
  // stem + rotate handle above the box (local -y)
  const top = -h / 2 - 6 / zoom;
  const hy = -rotateHandleOffset(h, zoom);
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(0, hy + 7 / zoom);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, hy, 7 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = pal.bg;
  ctx.fill();
  ctx.stroke();
  // corner scale handles
  const s = 5 / zoom;
  ctx.fillStyle = pal.bg;
  for (const c of scaleHandleLocals(w, h, zoom)) {
    ctx.beginPath();
    ctx.rect(c.x - s, c.y - s, s * 2, s * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
