"use client";

import { useEffect, useRef, useState } from "react";
import { exportSceneJSON, importSceneFile, pickSceneFile } from "@/lib/io";
import {
  add,
  clampOpeningT,
  coincidentEndpoints,
  dist,
  fmtLen,
  inRotRect,
  dot,
  lerp,
  nearestOnWall,
  nearestWall,
  openingCenter,
  perp,
  snapToGrid,
  sub,
  wallDir,
  wallPointAt,
  wallTangentAt,
} from "@/lib/geometry";
import {
  DARK,
  drawGrid,
  drawScene,
  drawSelection,
  drawStairs,
  drawItem,
  drawHouseLabels,
  drawWallLabel,
  getNoteBBox,
  rotateHandlePos,
  scaleHandlePositions,
  wallPath,
} from "@/lib/render";
import { loadSavedScene, useEditor } from "@/lib/store";
import { cancelViewSpring } from "@/lib/viewspring";
import { Guide, drawGuides, smartMoveSnap, smartWallSnap } from "@/lib/snapping";
import { ghostWalls, visibleScene } from "@/lib/houses";
import { markBirth, sceneFadeAlpha } from "@/lib/anim";
import { scaleForPoint, scaled } from "@/lib/scale";
import { DetectedRegion, ROOM_COLORS, detectRoomAt, pointInPolygon, polygonCentroid } from "@/lib/rooms";
import { itemDef } from "@/lib/catalog";
import {
  copySelected,
  cutSelected,
  deleteSelected,
  duplicateSelected,
  pasteClipboard,
} from "@/lib/clipboard";
import {
  ItemKind,
  OPENING_DEFAULTS,
  OpeningKind,
  Scene,
  Selection,
  Vec,
  Wall,
  uid,
} from "@/lib/types";

const SNAP_GRID = 10; // cm
const DEFAULT_WALL_THICKNESS = 15;

const selKey = (s: Selection) => `${s.kind}:${s.id}`;

type Drag =
  | { kind: "pan"; startScreen: Vec; panStart: Vec }
  | { kind: "rotate"; sel: "item" | "stairs"; id: string; center: Vec }
  | { kind: "scale"; sel: "item" | "stairs"; id: string; center: Vec; rot: number; w0: number; h0: number; d0: number }
  | { kind: "endpoint"; ends: { wallId: string; end: "a" | "b" }[] }
  | { kind: "opening"; id: string }
  | { kind: "bulge"; id: string }
  | {
      kind: "move";
      startWorld: Vec;
      startScreen: Vec;
      moved: boolean;
      hit: Selection;
      wasSelected: boolean;
      items: { id: string; p0: Vec }[];
      stairs: { id: string; p0: Vec }[];
      rooms: { id: string; poly0: Vec[] }[];
      notes: { id: string; p0: Vec }[];
      ends: { wallId: string; end: "a" | "b"; p0: Vec }[];
    }
  | { kind: "marquee"; startWorld: Vec; current: Vec; startScreen: Vec; base: Selection[] }
  | { kind: "room"; startWorld: Vec; current: Vec }
  | { kind: "roomrect"; startWorld: Vec; current: Vec };

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dropping, setDropping] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // interaction state lives in refs; a rAF loop redraws every frame
  const cursor = useRef<Vec | null>(null); // world
  const drawing = useRef<Vec[] | null>(null); // wall chain points
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const hover = useRef<Selection | null>(null);
  const guides = useRef<Guide[]>([]); // live smart-snap guides (Canva-style)
  const roomHover = useRef<DetectedRegion | null>(null); // room-label tool: enclosed space under cursor
  const roomHoverAt = useRef<Vec | null>(null);
  const roomHoverExisting = useRef<string | null>(null); // hovering an already-marked room
  const typedLen = useRef(""); // typed exact length while drawing a wall
  const lastDir = useRef<Vec | null>(null);

  useEffect(() => {
    const saved = loadSavedScene();
    if (saved) useEditor.setState({ scene: saved });

    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // center origin on first load
    const { width, height } = wrap.getBoundingClientRect();
    if (useEditor.getState().pan.x === 0 && useEditor.getState().pan.y === 0) {
      useEditor.getState().setView({ x: width / 2 - 300, y: height / 2 - 250 }, useEditor.getState().zoom);
    }

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      render(ctx, canvas);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- coordinate helpers ----------

  const toWorld = (e: { clientX: number; clientY: number }): Vec => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { pan, zoom } = useEditor.getState();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  };

  const snapWallPoint = (p: Vec, prev?: Vec): Vec => {
    const { scene, zoom } = useEditor.getState();
    const r = smartWallSnap(visibleScene(scene), p, prev ?? null, zoom, SNAP_GRID);
    guides.current = r.guides;
    return r.point;
  };

  // ---------- hit testing ----------

  const hitTest = (p: Vec): Selection | null => {
    const { zoom } = useEditor.getState();
    const scene = visibleScene(useEditor.getState().scene);
    const pad = 4 / zoom;
    for (let i = scene.notes.length - 1; i >= 0; i--) {
      const n = scene.notes[i];
      const bb = getNoteBBox(n.id) ?? { w: n.size * 4, h: n.size * 1.3 };
      if (
        p.x >= n.pos.x - 6 &&
        p.x <= n.pos.x + bb.w + 6 &&
        p.y >= n.pos.y - bb.h / 2 - 6 &&
        p.y <= n.pos.y + bb.h / 2 + 6
      )
        return { kind: "note", id: n.id };
    }
    for (const o of scene.openings) {
      const w = scene.walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const c = openingCenter(o, w);
      const u = wallTangentAt(w, o.t);
      const rot = Math.atan2(u.y, u.x);
      if (inRotRect(p, c, rot, o.width, w.thickness + 8, pad)) return { kind: "opening", id: o.id };
    }
    for (let i = scene.items.length - 1; i >= 0; i--) {
      const it = scene.items[i];
      if (inRotRect(p, it.pos, it.rot, it.w, it.h, pad)) return { kind: "item", id: it.id };
    }
    for (let i = scene.stairs.length - 1; i >= 0; i--) {
      const s = scene.stairs[i];
      const h = s.kind === "spiral" ? s.width : s.length;
      if (inRotRect(p, s.pos, s.rot, s.width, h, pad)) return { kind: "stairs", id: s.id };
    }
    for (const w of scene.walls) {
      const { d } = nearestOnWall(w, p);
      if (d <= w.thickness / 2 + pad) return { kind: "wall", id: w.id };
    }
    for (const r of scene.rooms) {
      if (r.poly.length >= 3 && pointInPolygon(p, r.poly)) return { kind: "room", id: r.id };
    }
    return null;
  };

  /** houseId/floorId tag for newly placed elements, from the active house context. */
  const houseTag = (): { houseId?: string; floorId?: string } => {
    const st = useEditor.getState();
    if (!st.activeHouseId) return {};
    const h = st.scene.houses.find((x) => x.id === st.activeHouseId);
    return h ? { houseId: h.id, floorId: h.activeFloorId } : {};
  };

  const createRoom = (poly: Vec[]) => {
    const st = useEditor.getState();
    st.checkpoint();
    const id = uid();
    const n = st.scene.rooms.length;
    const DEFAULT_ROOM_NAMES = [
      "Living Room",
      "Bedroom",
      "Kitchen",
      "Bathroom",
      "Study",
      "Hallway",
      "Balcony",
      "Store Room",
    ];
    st.mutate((s) => ({
      ...s,
      rooms: [
        ...s.rooms,
        {
          id,
          name: DEFAULT_ROOM_NAMES[n] ?? `Room ${n + 1}`,
          poly,
          color: ROOM_COLORS[n % ROOM_COLORS.length],
          ...houseTag(),
        },
      ],
    }));
    markBirth(id);
    st.select([{ kind: "room", id }]);
    // jump straight into naming it
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>("aside[data-props] input");
      if (input) {
        input.focus();
        input.select();
      }
    }, 60);
  };

  /** Start a group move of every element in `sel` (walls drag their connected corners). */
  const startMove = (
    sel: Selection[],
    hit: Selection,
    wasSelected: boolean,
    p: Vec,
    e: React.PointerEvent
  ) => {
    const scene = visibleScene(useEditor.getState().scene);
    const items: { id: string; p0: Vec }[] = [];
    const stairs: { id: string; p0: Vec }[] = [];
    const rooms: { id: string; poly0: Vec[] }[] = [];
    const notes: { id: string; p0: Vec }[] = [];
    const endsMap = new Map<string, { wallId: string; end: "a" | "b"; p0: Vec }>();
    for (const s of sel) {
      if (s.kind === "item") {
        const it = scene.items.find((x) => x.id === s.id);
        if (it && !it.locked) items.push({ id: it.id, p0: { ...it.pos } });
      } else if (s.kind === "stairs") {
        const st = scene.stairs.find((x) => x.id === s.id);
        if (st && !st.locked) stairs.push({ id: st.id, p0: { ...st.pos } });
      } else if (s.kind === "room") {
        const r = scene.rooms.find((x) => x.id === s.id);
        if (r && !r.locked) rooms.push({ id: r.id, poly0: r.poly.map((pt) => ({ ...pt })) });
      } else if (s.kind === "note") {
        const n = scene.notes.find((x) => x.id === s.id);
        if (n && !n.locked) notes.push({ id: n.id, p0: { ...n.pos } });
      } else if (s.kind === "wall") {
        const w = scene.walls.find((x) => x.id === s.id);
        if (!w || w.locked) continue;
        for (const end of ["a", "b"] as const) {
          for (const ep of coincidentEndpoints(scene, w[end])) {
            const key = `${ep.wallId}:${ep.end}`;
            if (endsMap.has(key)) continue;
            const ww = scene.walls.find((x) => x.id === ep.wallId);
            if (ww && !ww.locked) endsMap.set(key, { ...ep, p0: { ...ww[ep.end] } });
          }
        }
      }
    }
    drag.current = {
      kind: "move",
      startWorld: p,
      startScreen: { x: e.clientX, y: e.clientY },
      moved: false,
      hit,
      wasSelected,
      items,
      stairs,
      rooms,
      notes,
      ends: [...endsMap.values()],
    };
  };

  // ---------- pointer handlers ----------

  const onPointerDown = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const p = toWorld(e);
    canvasRef.current!.setPointerCapture(e.pointerId);

    // pan: hand tool, middle button, or space+left — direct manipulation takes over from the spring
    if (e.button === 1 || (e.button === 0 && (spaceDown.current || st.tool === "pan"))) {
      cancelViewSpring();
      canvasRef.current!.style.cursor = "grabbing"; // closed hand while holding the canvas
      drag.current = {
        kind: "pan",
        startScreen: { x: e.clientX, y: e.clientY },
        panStart: { ...st.pan },
      };
      return;
    }
    if (e.button === 2) {
      // right click ends wall chain
      if (drawing.current) drawing.current = null;
      return;
    }
    if (e.button !== 0) return;

    const tool = st.tool;

    if (tool === "select") {
      const mod = e.metaKey || e.ctrlKey;
      const solo = st.selection.length === 1 ? st.selection[0] : null;

      // handles only exist in single-selection mode
      if (solo && (solo.kind === "item" || solo.kind === "stairs")) {
        const el =
          solo.kind === "item"
            ? st.scene.items.find((x) => x.id === solo.id)
            : st.scene.stairs.find((x) => x.id === solo.id);
        if (el && !el.locked) {
          const h =
            solo.kind === "item"
              ? (el as { h: number }).h
              : (el as { kind: string; width: number; length: number }).kind === "spiral"
                ? (el as { width: number }).width
                : (el as { length: number }).length;
          const hp = rotateHandlePos(el.pos, el.rot, h, st.zoom);
          if (dist(p, hp) <= 10 / st.zoom) {
            st.checkpoint();
            drag.current = { kind: "rotate", sel: solo.kind, id: solo.id, center: { ...el.pos } };
            return;
          }
          // corner scale handles
          const w =
            solo.kind === "item"
              ? (el as { w: number }).w
              : (el as { width: number }).width;
          for (const corner of scaleHandlePositions(el.pos, el.rot, w, h, st.zoom)) {
            if (dist(p, corner) <= 9 / st.zoom) {
              st.checkpoint();
              drag.current = {
                kind: "scale",
                sel: solo.kind,
                id: solo.id,
                center: { ...el.pos },
                rot: el.rot,
                w0: w,
                h0: h,
                d0: Math.max(1, dist(p, el.pos)),
              };
              return;
            }
          }
        }
      }
      // endpoint handles of the sole selected wall
      if (solo?.kind === "wall") {
        const w = st.scene.walls.find((x) => x.id === solo.id);
        if (w && !w.locked) {
          const handleR = 10 / st.zoom;
          for (const end of ["a", "b"] as const) {
            if (dist(p, w[end]) <= handleR) {
              st.checkpoint();
              drag.current = { kind: "endpoint", ends: coincidentEndpoints(visibleScene(st.scene), w[end]) };
              return;
            }
          }
          // bend handle at the wall's midpoint
          if (dist(p, wallPointAt(w, 0.5)) <= handleR) {
            st.checkpoint();
            drag.current = { kind: "bulge", id: w.id };
            return;
          }
        }
      }

      const hit = hitTest(p);

      if (!hit) {
        // empty space: marquee (⌘ adds to the existing selection)
        const base = mod ? st.selection : [];
        if (!mod) st.select([]);
        drag.current = {
          kind: "marquee",
          startWorld: p,
          current: p,
          startScreen: { x: e.clientX, y: e.clientY },
          base,
        };
        return;
      }

      const isSelected = st.selection.some((s) => selKey(s) === selKey(hit));

      if (mod) {
        // ⌘-click toggles membership, never drags
        st.select(
          isSelected
            ? st.selection.filter((s) => selKey(s) !== selKey(hit))
            : [...st.selection, hit]
        );
        return;
      }

      const active = isSelected ? st.selection : [hit];
      if (!isSelected) st.select([hit]);

      // openings drag along their wall — only as a sole selection
      if (hit.kind === "opening" && active.length === 1) {
        st.checkpoint();
        drag.current = { kind: "opening", id: hit.id };
        return;
      }

      startMove(active, hit, isSelected, p, e);
      return;
    }

    if (tool === "wall") {
      const pts = drawing.current;
      if (!pts) {
        drawing.current = [snapWallPoint(p)];
      } else {
        const prev = pts[pts.length - 1];
        const np = snapWallPoint(p, prev);
        if (dist(np, prev) >= 5) {
          st.checkpoint();
          const thW = scaled(DEFAULT_WALL_THICKNESS, scaleForPoint(st.scene, st.activeHouseId, p));
          st.mutate((s) => ({
            ...s,
            walls: [
              ...s.walls,
              { id: uid(), a: { ...prev }, b: { ...np }, thickness: thW, ...houseTag() },
            ],
          }));
          // clicking back on the chain start closes the loop
          if (pts.length >= 2 && dist(np, pts[0]) < 1) drawing.current = null;
          else pts.push(np);
        }
      }
      return;
    }

    if (tool === "room") {
      drag.current = { kind: "room", startWorld: snapToGrid(p, SNAP_GRID), current: snapToGrid(p, SNAP_GRID) };
      return;
    }

    if (tool === "room-label") {
      if (roomHover.current) {
        createRoom(roomHover.current.poly);
        roomHover.current = null;
        roomHoverAt.current = null;
      } else {
        const sp = snapToGrid(p, SNAP_GRID);
        drag.current = { kind: "roomrect", startWorld: sp, current: sp };
      }
      return;
    }

    if (tool === "note") {
      st.checkpoint();
      const id = uid();
      st.mutate((s) => ({
        ...s,
        notes: [
          ...s.notes,
          { id, pos: snapToGrid(p, 5), text: "Note", size: 24, ...houseTag() },
        ],
      }));
      markBirth(id);
      st.select([{ kind: "note", id }]);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>("aside[data-props] input");
        if (input) {
          input.focus();
          input.select();
        }
      }, 60);
      return;
    }

    if (tool in OPENING_DEFAULTS) {
      const near = nearestWall(visibleScene(st.scene), p, 40 / st.zoom + 20);
      if (!near) return;
      const def = OPENING_DEFAULTS[tool as OpeningKind];
      const f = scaleForPoint(st.scene, st.activeHouseId, p);
      const width = scaled(def.width, f);
      const t = clampOpeningT(near.wall, near.t, width);
      st.checkpoint();
      const id = uid();
      st.mutate((s) => ({
        ...s,
        openings: [
          ...s.openings,
          { id, wallId: near.wall.id, t, width, kind: tool as OpeningKind, flip: false, swing: false },
        ],
      }));
      st.select([{ kind: "opening", id }]);
      return;
    }

    if (tool === "stairs" || tool === "stairs-spiral") {
      st.checkpoint();
      const id = uid();
      const pos = snapToGrid(p, SNAP_GRID);
      const fSt = scaleForPoint(st.scene, st.activeHouseId, p);
      st.mutate((s) => ({
        ...s,
        stairs: [
          ...s.stairs,
          tool === "stairs"
            ? { id, kind: "straight" as const, pos, rot: 0, width: scaled(100, fSt), length: scaled(300, fSt), steps: 15, ...houseTag() }
            : { id, kind: "spiral" as const, pos, rot: 0, width: scaled(200, fSt), length: scaled(200, fSt), steps: 14, ...houseTag() },
        ],
      }));
      markBirth(id);
      st.select([{ kind: "stairs", id }]);
      return;
    }

    if (tool.startsWith("item:")) {
      const kind = tool.slice(5) as ItemKind;
      const def = itemDef(kind);
      const fIt = scaleForPoint(st.scene, st.activeHouseId, p);
      st.checkpoint();
      const id = uid();
      st.mutate((s) => ({
        ...s,
        items: [
          ...s.items,
          { id, kind, pos: snapToGrid(p, 5), rot: 0, w: scaled(def.w, fIt), h: scaled(def.h, fIt), ...houseTag() },
        ],
      }));
      markBirth(id);
      st.select([{ kind: "item", id }]);
      return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const p = toWorld(e);
    cursor.current = p;

    const d = drag.current;
    if (!d) {
      if (st.tool === "select") hover.current = hitTest(p);
      else hover.current = null;
      if (st.tool === "room-label") {
        if (!roomHoverAt.current || dist(p, roomHoverAt.current) > 15) {
          roomHoverAt.current = p;
          const vis = visibleScene(st.scene);
          const existing = vis.rooms.find(
            (r) => r.poly.length >= 3 && pointInPolygon(p, r.poly)
          );
          roomHoverExisting.current = existing?.id ?? null;
          roomHover.current = existing ? null : detectRoomAt(vis, p);
        }
      } else {
        roomHover.current = null;
        roomHoverAt.current = null;
      }
      return;
    }

    if (d.kind === "pan") {
      st.setView(
        {
          x: d.panStart.x + (e.clientX - d.startScreen.x),
          y: d.panStart.y + (e.clientY - d.startScreen.y),
        },
        st.zoom
      );
      return;
    }

    if (d.kind === "rotate") {
      // handle sits at local -y, so angle to cursor + 90° = rotation
      let a = Math.atan2(p.y - d.center.y, p.x - d.center.x) + Math.PI / 2;
      const step = Math.PI / 12;
      a = Math.round(a / step) * step;
      st.mutate((s) =>
        d.sel === "item"
          ? { ...s, items: s.items.map((x) => (x.id === d.id ? { ...x, rot: a } : x)) }
          : { ...s, stairs: s.stairs.map((x) => (x.id === d.id ? { ...x, rot: a } : x)) }
      );
      return;
    }

    if (d.kind === "scale") {
      let nw: number;
      let nh: number;
      if (e.shiftKey || d.sel === "stairs") {
        // uniform: scale by distance ratio from center
        const s = Math.max(0.05, dist(p, d.center) / d.d0);
        nw = d.w0 * s;
        nh = d.h0 * s;
      } else {
        // free: local cursor position defines the new half-extents
        const dx = p.x - d.center.x;
        const dy = p.y - d.center.y;
        const cos = Math.cos(-d.rot);
        const sin = Math.sin(-d.rot);
        nw = Math.abs(dx * cos - dy * sin) * 2;
        nh = Math.abs(dx * sin + dy * cos) * 2;
      }
      nw = Math.max(10, Math.min(3000, Math.round(nw)));
      nh = Math.max(10, Math.min(3000, Math.round(nh)));
      st.mutate((s) => {
        if (d.sel === "item")
          return { ...s, items: s.items.map((x) => (x.id === d.id ? { ...x, w: nw, h: nh } : x)) };
        return {
          ...s,
          stairs: s.stairs.map((x) =>
            x.id === d.id
              ? x.kind === "spiral"
                ? { ...x, width: nw }
                : { ...x, width: nw, length: nh }
              : x
          ),
        };
      });
      return;
    }

    if (d.kind === "endpoint") {
      const np = pEndpointExcluding(visibleScene(st.scene), p, d.ends, st.zoom);
      st.mutate((s) => ({
        ...s,
        walls: s.walls.map((w) => {
          let nw = w;
          for (const ep of d.ends) {
            if (ep.wallId === w.id) nw = { ...nw, [ep.end]: { ...np } };
          }
          return nw;
        }),
      }));
      return;
    }

    if (d.kind === "bulge") {
      st.mutate((s) => ({
        ...s,
        walls: s.walls.map((w) => {
          if (w.id !== d.id) return w;
          const chord = dist(w.a, w.b);
          const n = perp(wallDir(w));
          let b = dot(sub(p, lerp(w.a, w.b, 0.5)), n);
          b = Math.round(b / 5) * 5;
          // magnetic straight line; cap at a half-circle
          if (Math.abs(b) < 10 / st.zoom + 4) b = 0;
          b = Math.max(-chord / 2, Math.min(chord / 2, b));
          const nw: Wall = { ...w, bulge: b };
          if (!b) delete nw.bulge;
          return nw;
        }),
      }));
      return;
    }

    if (d.kind === "move") {
      if (!d.moved) {
        const screenDist = Math.hypot(e.clientX - d.startScreen.x, e.clientY - d.startScreen.y);
        if (screenDist <= 4) return; // click hysteresis
        d.moved = true;
        st.checkpoint(); // one undo entry per actual move, not per click
      }
      let delta = snapToGrid(sub(p, d.startWorld), 5);
      // solo item drag: Canva-style alignment against other furniture and walls
      if (d.items.length === 1 && !d.stairs.length && !d.ends.length) {
        const live = st.scene.items.find((x) => x.id === d.items[0].id);
        if (live) {
          const desired = add(d.items[0].p0, sub(p, d.startWorld));
          // axis-aligned half extents of the rotated footprint
          const cos = Math.abs(Math.cos(live.rot));
          const sin = Math.abs(Math.sin(live.rot));
          const half = {
            x: (live.w * cos + live.h * sin) / 2,
            y: (live.w * sin + live.h * cos) / 2,
          };
          const r = smartMoveSnap(visibleScene(st.scene), desired, half, st.zoom, live.id);
          guides.current = r.guides;
          delta = sub(r.point, d.items[0].p0);
        }
      } else {
        guides.current = [];
      }
      st.mutate((s) => ({
        ...s,
        items: s.items.map((x) => {
          const rec = d.items.find((r) => r.id === x.id);
          return rec ? { ...x, pos: add(rec.p0, delta) } : x;
        }),
        stairs: s.stairs.map((x) => {
          const rec = d.stairs.find((r) => r.id === x.id);
          return rec ? { ...x, pos: add(rec.p0, delta) } : x;
        }),
        walls: s.walls.map((w) => {
          let nw = w;
          for (const en of d.ends) {
            if (en.wallId === w.id) nw = { ...nw, [en.end]: add(en.p0, delta) };
          }
          return nw;
        }),
        rooms: s.rooms.map((r) => {
          const rec = d.rooms.find((x) => x.id === r.id);
          return rec ? { ...r, poly: rec.poly0.map((pt) => add(pt, delta)) } : r;
        }),
        notes: s.notes.map((n) => {
          const rec = d.notes.find((x) => x.id === n.id);
          return rec ? { ...n, pos: add(rec.p0, delta) } : n;
        }),
      }));
      return;
    }

    if (d.kind === "marquee") {
      d.current = p;
      return;
    }

    if (d.kind === "opening") {
      st.mutate((s) => {
        const o = s.openings.find((x) => x.id === d.id);
        if (!o) return s;
        const w = s.walls.find((x) => x.id === o.wallId);
        if (!w) return s;
        const { t } = nearestOnWall(w, p);
        const nt = clampOpeningT(w, t, o.width);
        return { ...s, openings: s.openings.map((x) => (x.id === d.id ? { ...x, t: nt } : x)) };
      });
      return;
    }

    if (d.kind === "room") {
      d.current = snapToGrid(p, SNAP_GRID);
      return;
    }

    if (d.kind === "roomrect") {
      d.current = snapToGrid(p, SNAP_GRID);
      return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    if (canvasRef.current) canvasRef.current.style.cursor = ""; // release: back to the tool cursor
    const d = drag.current;
    drag.current = null;
    if (!d) return;

    if (d.kind === "move") {
      // a plain click on an already-selected element (no movement) collapses to it
      if (!d.moved && d.wasSelected) st.select([d.hit]);
      return;
    }

    if (d.kind === "marquee") {
      const screenDist = Math.hypot(e.clientX - d.startScreen.x, e.clientY - d.startScreen.y);
      if (screenDist <= 4) {
        // just a click on empty space — selection was already handled on pointer-down
        return;
      }
      const x0 = Math.min(d.startWorld.x, d.current.x);
      const x1 = Math.max(d.startWorld.x, d.current.x);
      const y0 = Math.min(d.startWorld.y, d.current.y);
      const y1 = Math.max(d.startWorld.y, d.current.y);
      const inside = (pt: Vec) => pt.x >= x0 && pt.x <= x1 && pt.y >= y0 && pt.y <= y1;

      const vis = visibleScene(st.scene);
      const found: Selection[] = [];
      for (const w of vis.walls) {
        if (inside(w.a) || inside(w.b) || inside(wallPointAt(w, 0.5)))
          found.push({ kind: "wall", id: w.id });
      }
      for (const it of vis.items) {
        if (inside(it.pos)) found.push({ kind: "item", id: it.id });
      }
      for (const s of vis.stairs) {
        if (inside(s.pos)) found.push({ kind: "stairs", id: s.id });
      }
      for (const r of vis.rooms) {
        if (r.poly.length >= 3 && inside(polygonCentroid(r.poly))) found.push({ kind: "room", id: r.id });
      }
      for (const n of vis.notes) {
        if (inside(n.pos)) found.push({ kind: "note", id: n.id });
      }
      const merged = new Map<string, Selection>();
      for (const s of [...d.base, ...found]) merged.set(selKey(s), s);
      st.select([...merged.values()]);
      return;
    }

    if (d.kind === "roomrect") {
      const a = d.startWorld;
      const b = d.current;
      if (Math.abs(b.x - a.x) >= 50 && Math.abs(b.y - a.y) >= 50) {
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const x1 = Math.max(a.x, b.x);
        const y1 = Math.max(a.y, b.y);
        createRoom([
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ]);
      }
      return;
    }

    if (d.kind === "room") {
      const a = d.startWorld;
      const b = d.current;
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      if (w >= 40 && h >= 40) {
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const x1 = Math.max(a.x, b.x);
        const y1 = Math.max(a.y, b.y);
        const th = DEFAULT_WALL_THICKNESS;
        st.checkpoint();
        const tag = houseTag();
        const thR = scaled(th, scaleForPoint(st.scene, st.activeHouseId, d.current));
        st.mutate((s) => ({
          ...s,
          walls: [
            ...s.walls,
            { id: uid(), a: { x: x0, y: y0 }, b: { x: x1, y: y0 }, thickness: thR, ...tag },
            { id: uid(), a: { x: x1, y: y0 }, b: { x: x1, y: y1 }, thickness: thR, ...tag },
            { id: uid(), a: { x: x1, y: y1 }, b: { x: x0, y: y1 }, thickness: thR, ...tag },
            { id: uid(), a: { x: x0, y: y1 }, b: { x: x0, y: y0 }, thickness: thR, ...tag },
          ],
        }));
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    drawing.current = null;
    const st = useEditor.getState();
    if (st.tool !== "select") return;
    const hit = hitTest(toWorld(e));
    if (!hit) return;
    // double-click = edit: solo-select and jump focus into its first property field
    st.select([hit]);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>("aside[data-props] input");
      if (input) {
        input.focus();
        input.select();
      }
    }, 60);
  };

  const onWheel = (e: React.WheelEvent) => {
    cancelViewSpring();
    const st = useEditor.getState();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0012);
    const nz = Math.min(8, Math.max(0.05, st.zoom * factor));
    const wx = (mx - st.pan.x) / st.zoom;
    const wy = (my - st.pan.y) / st.zoom;
    st.setView({ x: mx - wx * nz, y: my - wy * nz }, nz);
  };

  // ---------- keyboard ----------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      const st = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // typed exact length while drawing a wall: digits build, Enter commits
      if (st.tool === "wall" && drawing.current && !mod) {
        if (/^[0-9.]$/.test(e.key)) {
          typedLen.current += e.key;
          e.preventDefault();
          return;
        }
        if (e.key === "Backspace" && typedLen.current) {
          typedLen.current = typedLen.current.slice(0, -1);
          e.preventDefault();
          return;
        }
        if (e.key === "Enter" && typedLen.current && lastDir.current) {
          const v = parseFloat(typedLen.current);
          if (!Number.isNaN(v) && v > 0) {
            const cm = v < 100 ? v * 100 : v; // "3.2" means metres, "320" means cm
            const pts = drawing.current;
            const prev = pts[pts.length - 1];
            const np = add(prev, { x: lastDir.current.x * cm, y: lastDir.current.y * cm });
            st.checkpoint();
            const thT = scaled(DEFAULT_WALL_THICKNESS, scaleForPoint(st.scene, st.activeHouseId, np));
            st.mutate((sc) => ({
              ...sc,
              walls: [
                ...sc.walls,
                { id: uid(), a: { ...prev }, b: np, thickness: thT, ...houseTag() },
              ],
            }));
            pts.push(np);
          }
          typedLen.current = "";
          e.preventDefault();
          return;
        }
        if (e.key === "Escape" && typedLen.current) {
          typedLen.current = "";
          e.preventDefault();
          return;
        }
      }

      if (e.code === "Space") {
        spaceDown.current = true;
        e.preventDefault();
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod && key === "a") {
        e.preventDefault();
        st.select([
          ...visibleScene(st.scene).walls.map((w) => ({ kind: "wall" as const, id: w.id })),
          ...visibleScene(st.scene).items.map((x) => ({ kind: "item" as const, id: x.id })),
          ...visibleScene(st.scene).rooms.map((r) => ({ kind: "room" as const, id: r.id })),
          ...visibleScene(st.scene).notes.map((n) => ({ kind: "note" as const, id: n.id })),
          ...visibleScene(st.scene).stairs.map((x) => ({ kind: "stairs" as const, id: x.id })),
        ]);
        return;
      }
      if (mod && key === "c") {
        e.preventDefault();
        copySelected();
        return;
      }
      if (mod && key === "x") {
        e.preventDefault();
        cutSelected();
        return;
      }
      if (mod && key === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod && key === "o") {
        e.preventDefault();
        pickSceneFile();
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        exportSceneJSON();
        return;
      }
      if (mod) return; // don't let ⌘S etc. trigger tool shortcuts

      switch (e.key) {
        case "Escape":
          typedLen.current = "";
          if (drawing.current) drawing.current = null;
          else if (st.tool !== "select") st.setTool("select");
          else st.select([]);
          break;
        case "Enter":
          drawing.current = null;
          break;
        case "Delete":
        case "Backspace":
          deleteSelected();
          break;
        case "r":
        case "R":
          rotateSelection(e.shiftKey ? -Math.PI / 12 : Math.PI / 12);
          break;
        case "f":
        case "F":
          flipSelection();
          break;
        case "v":
        case "V":
          st.setTool("select");
          break;
        case "w":
        case "W":
          st.setTool("wall");
          break;
        case "b":
        case "B":
          st.setTool("room");
          break;
        case "m":
        case "M":
          st.setTool("room-label");
          break;
        case "t":
        case "T":
          st.setTool("note");
          break;
        case "h":
        case "H":
          st.setTool("pan");
          break;
        case "d":
        case "D":
          st.setTool("door-single");
          break;
        case "n":
        case "N":
          st.setTool("window");
          break;
        case "s":
        case "S":
          st.setTool("stairs");
          break;
        case "g":
        case "G":
          st.toggleGrid();
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ---------- selection ops ----------

  function rotateSelection(by: number) {
    const st = useEditor.getState();
    const itemIds = new Set(st.selection.filter((s) => s.kind === "item").map((s) => s.id));
    const stairIds = new Set(st.selection.filter((s) => s.kind === "stairs").map((s) => s.id));
    if (!itemIds.size && !stairIds.size) return;
    st.checkpoint();
    st.mutate((s) => ({
      ...s,
      items: s.items.map((x) => (itemIds.has(x.id) ? { ...x, rot: x.rot + by } : x)),
      stairs: s.stairs.map((x) => (stairIds.has(x.id) ? { ...x, rot: x.rot + by } : x)),
    }));
  }

  function flipSelection() {
    const st = useEditor.getState();
    const sel = st.selection.length === 1 ? st.selection[0] : null;
    if (sel?.kind !== "opening") return;
    st.checkpoint();
    st.mutate((s) => ({
      ...s,
      openings: s.openings.map((o) => (o.id === sel.id ? { ...o, flip: !o.flip } : o)),
    }));
  }

  // ---------- render loop ----------

  function render(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const st = useEditor.getState();
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const pal = DARK;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);

    if (st.gridOn) {
      ctx.save();
      ctx.translate(st.pan.x, st.pan.y);
      ctx.scale(st.zoom, st.zoom);
      drawGrid(ctx, pal, st.pan, st.zoom, w, h);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(st.pan.x, st.pan.y);
    ctx.scale(st.zoom, st.zoom);

    // hover highlight
    if (hover.current && st.tool === "select" && !drag.current) {
      const hv = hover.current;
      if (hv.kind === "wall") {
        const wl = st.scene.walls.find((x) => x.id === hv.id);
        if (wl) {
          ctx.strokeStyle = pal.hover;
          ctx.lineWidth = wl.thickness + 8 / st.zoom;
          ctx.lineCap = "square";
          wallPath(ctx, wl);
          ctx.stroke();
          ctx.lineCap = "butt";
        }
      }
    }

    // onion-skin: the floor below each house's active floor, as a faint ghost
    for (const house of st.scene.houses) {
      const ghosts = ghostWalls(st.scene, house);
      if (!ghosts.length) continue;
      ctx.globalAlpha = 0.16;
      ctx.lineCap = "square";
      ctx.strokeStyle = pal.wall;
      for (const gw of ghosts) {
        ctx.lineWidth = gw.thickness;
        wallPath(ctx, gw);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
      ctx.globalAlpha = 1;
    }

    const fade = sceneFadeAlpha();
    if (fade < 1) ctx.globalAlpha = fade;
    drawScene(ctx, visibleScene(st.scene), pal, st.zoom);
    drawHouseLabels(ctx, st.scene, pal, st.zoom);
    ctx.globalAlpha = 1;

    const solo = st.selection.length === 1;
    for (const sel of st.selection) drawSelection(ctx, st.scene, sel, pal, st.zoom, solo);

    // wall tool, before the first click: show where the first point would stick
    if (st.tool === "wall" && !drawing.current && cursor.current && !drag.current) {
      const np = snapWallPoint(cursor.current);
      ctx.beginPath();
      ctx.arc(np.x, np.y, 4 / st.zoom, 0, Math.PI * 2);
      ctx.fillStyle = pal.select;
      ctx.globalAlpha = 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // wall-drawing preview
    const pts = drawing.current;
    if (st.tool === "wall" && pts && cursor.current) {
      const prev = pts[pts.length - 1];
      let np = snapWallPoint(cursor.current, prev);
      const dl = Math.hypot(np.x - prev.x, np.y - prev.y);
      if (dl > 1e-6) lastDir.current = { x: (np.x - prev.x) / dl, y: (np.y - prev.y) / dl };
      const typedVal = parseFloat(typedLen.current);
      if (typedLen.current && !Number.isNaN(typedVal) && typedVal > 0 && lastDir.current) {
        const cm = typedVal < 100 ? typedVal * 100 : typedVal;
        np = add(prev, { x: lastDir.current.x * cm, y: lastDir.current.y * cm });
      }
      ctx.strokeStyle = pal.select;
      ctx.lineWidth = DEFAULT_WALL_THICKNESS;
      ctx.globalAlpha = 0.5;
      ctx.lineCap = "square";
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(np.x, np.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineCap = "butt";
      drawWallLabel(
        ctx,
        { id: "preview", a: prev, b: np, thickness: DEFAULT_WALL_THICKNESS },
        pal,
        st.zoom
      );
      // chain start marker
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 5 / st.zoom, 0, Math.PI * 2);
      ctx.fillStyle = pal.select;
      ctx.fill();
      // typed-length chip
      if (typedLen.current) {
        const v = parseFloat(typedLen.current);
        const cm = !Number.isNaN(v) && v > 0 ? (v < 100 ? v * 100 : v) : 0;
        const text = cm ? `${(cm / 100).toFixed(2)} m  \u23ce` : typedLen.current;
        ctx.save();
        ctx.font = `600 ${13 / st.zoom}px -apple-system, system-ui, sans-serif`;
        const tw = ctx.measureText(text).width;
        const bx = np.x + 20 / st.zoom;
        const by = np.y - 34 / st.zoom;
        ctx.fillStyle = pal.select;
        ctx.beginPath();
        ctx.roundRect(bx - 8 / st.zoom, by - 11 / st.zoom, tw + 16 / st.zoom, 24 / st.zoom, 7 / st.zoom);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(text, bx, by + 1 / st.zoom);
        ctx.restore();
      }
    }

    // smart-snap guides: visible while drawing walls or dragging a solo item
    const showGuides =
      (st.tool === "wall" && cursor.current) ||
      (drag.current?.kind === "move" && drag.current.moved);
    if (showGuides && guides.current.length) drawGuides(ctx, guides.current, st.zoom);

    const d = drag.current;

    // room-label tool: hovering an already-marked room — show it's recognized
    if (st.tool === "room-label" && roomHoverExisting.current && !drag.current) {
      const r = visibleScene(st.scene).rooms.find((x) => x.id === roomHoverExisting.current);
      if (r && r.poly.length >= 3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(r.poly[0].x, r.poly[0].y);
        for (let i = 1; i < r.poly.length; i++) ctx.lineTo(r.poly[i].x, r.poly[i].y);
        ctx.closePath();
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 1.5 / st.zoom;
        ctx.setLineDash([6 / st.zoom, 5 / st.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
        const c = polygonCentroid(r.poly);
        ctx.font = `500 ${11 / st.zoom}px -apple-system, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = pal.symbol;
        ctx.fillText(`already marked as “${r.name}”`, c.x, c.y + 26 / st.zoom);
        ctx.restore();
      }
    }

    // room-label tool: highlight the enclosed space under the cursor
    if (st.tool === "room-label" && roomHover.current && !drag.current) {
      const rp = roomHover.current.poly;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rp[0].x, rp[0].y);
      for (let i = 1; i < rp.length; i++) ctx.lineTo(rp[i].x, rp[i].y);
      ctx.closePath();
      ctx.fillStyle = pal.select;
      ctx.globalAlpha = 0.14;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.select;
      ctx.lineWidth = 1.5 / st.zoom;
      ctx.setLineDash([7 / st.zoom, 5 / st.zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
      const c = polygonCentroid(rp);
      ctx.font = `600 ${13 / st.zoom}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = pal.label;
      ctx.fillText(`${roomHover.current.areaM2.toFixed(1)} m\u00b2 \u2014 click to add room`, c.x, c.y);
      ctx.restore();
    }

    // roomrect preview
    if (d?.kind === "roomrect") {
      ctx.strokeStyle = pal.select;
      ctx.fillStyle = pal.select;
      ctx.globalAlpha = 0.1;
      ctx.fillRect(
        Math.min(d.startWorld.x, d.current.x),
        Math.min(d.startWorld.y, d.current.y),
        Math.abs(d.current.x - d.startWorld.x),
        Math.abs(d.current.y - d.startWorld.y)
      );
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5 / st.zoom;
      ctx.setLineDash([7 / st.zoom, 5 / st.zoom]);
      ctx.strokeRect(
        Math.min(d.startWorld.x, d.current.x),
        Math.min(d.startWorld.y, d.current.y),
        Math.abs(d.current.x - d.startWorld.x),
        Math.abs(d.current.y - d.startWorld.y)
      );
      ctx.setLineDash([]);
    }

    // marquee rubber-band
    if (d?.kind === "marquee") {
      const x = Math.min(d.startWorld.x, d.current.x);
      const y = Math.min(d.startWorld.y, d.current.y);
      const mw = Math.abs(d.current.x - d.startWorld.x);
      const mh = Math.abs(d.current.y - d.startWorld.y);
      if (mw * st.zoom > 4 || mh * st.zoom > 4) {
        ctx.fillStyle = pal.select;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(x, y, mw, mh);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = pal.select;
        ctx.lineWidth = 1.5 / st.zoom;
        ctx.strokeRect(x, y, mw, mh);
      }
    }

    // room preview
    if (d?.kind === "room") {
      const a = d.startWorld;
      const b = d.current;
      ctx.strokeStyle = pal.select;
      ctx.lineWidth = 2 / st.zoom;
      ctx.setLineDash([8 / st.zoom, 6 / st.zoom]);
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.setLineDash([]);
      ctx.font = `${12 / st.zoom}px ui-sans-serif, system-ui`;
      ctx.fillStyle = pal.label;
      ctx.fillText(
        `${fmtLen(Math.abs(b.x - a.x))} × ${fmtLen(Math.abs(b.y - a.y))}`,
        Math.min(a.x, b.x),
        Math.min(a.y, b.y) - 8 / st.zoom
      );
    }

    // placement ghosts
    if (cursor.current && !drag.current) {
      const t = st.tool;
      if (t in OPENING_DEFAULTS) {
        const near = nearestWall(st.scene, cursor.current, 40 / st.zoom + 20);
        if (near) {
          const def = OPENING_DEFAULTS[t as OpeningKind];
          const tt = clampOpeningT(near.wall, near.t, def.width);
          const c = wallPointAt(near.wall, tt);
          const u = wallTangentAt(near.wall, tt);
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = pal.select;
          ctx.lineWidth = 2 / st.zoom;
          ctx.translate(c.x, c.y);
          ctx.rotate(Math.atan2(u.y, u.x));
          ctx.strokeRect(-def.width / 2, -(near.wall.thickness / 2 + 6 / st.zoom), def.width, near.wall.thickness + 12 / st.zoom);
          ctx.restore();
        }
      } else if (t === "stairs" || t === "stairs-spiral") {
        const pos = snapToGrid(cursor.current, SNAP_GRID);
        ctx.globalAlpha = 0.45;
        drawStairs(
          ctx,
          t === "stairs"
            ? { id: "ghost", kind: "straight", pos, rot: 0, width: 100, length: 300, steps: 15 }
            : { id: "ghost", kind: "spiral", pos, rot: 0, width: 200, length: 200, steps: 14 },
          pal
        );
        ctx.globalAlpha = 1;
      } else if (t.startsWith("item:")) {
        const kind = t.slice(5) as ItemKind;
        const def = itemDef(kind);
        ctx.globalAlpha = 0.45;
        drawItem(
          ctx,
          { id: "ghost", kind, pos: snapToGrid(cursor.current, 5), rot: 0, w: def.w, h: def.h },
          pal
        );
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dropping) setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropping(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropping(false);
        const f = Array.from(e.dataTransfer.files).find((x) => /json$/i.test(x.name) || x.type.includes("json"));
        if (f) void importSceneFile(f);
        else useEditor.getState().showFlash("Drop a roughhouse save file (.json)", "error");
      }}
    >
      {dropping && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-[var(--tint)] bg-[var(--tint-soft)]">
          <div className="glass rounded-2xl px-5 py-3 text-[14px] font-medium">Drop to import plan</div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ cursor: cursorFor(useEditor((s) => s.tool)) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

function cursorFor(tool?: string): string {
  if (tool === "pan") return "grab";
  return "crosshair";
}

/** When dragging endpoints, don't snap onto one of the endpoints being dragged. */
function pEndpointExcluding(
  scene: Scene,
  p: Vec,
  ends: { wallId: string; end: "a" | "b" }[],
  zoom: number
): Vec {
  const thresh = 15 / zoom;
  const excluded = new Set(ends.map((e) => `${e.wallId}:${e.end}`));
  let best: Vec | null = null;
  let bestD = thresh;
  for (const w of scene.walls) {
    for (const end of ["a", "b"] as const) {
      if (excluded.has(`${w.id}:${end}`)) continue;
      const d = dist(p, w[end]);
      if (d < bestD) {
        bestD = d;
        best = w[end];
      }
    }
  }
  if (best) return { ...best };
  return snapToGrid(p, SNAP_GRID);
}
