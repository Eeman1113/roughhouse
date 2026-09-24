// House scale factor: sketches are rarely drawn to true scale. When a house's
// footprint is oversized, new elements scale UP proportionally so the plan
// reads right — but never below real-world size (factor is clamped to >= 1).
import { Scene, Vec, Wall } from "./types";

const REF_AREA_M2 = 150; // a normally-sized home floor
const MAX_FACTOR = 3;

export const DEFAULT_WALL_HEIGHT = 270; // cm, standard ceiling

/** Effective height of a wall: its own override, else its floor's, else 270. */
export function wallHeight(scene: Scene, w: Wall): number {
  if (w.height) return w.height;
  const house = scene.houses.find((h) => h.id === w.houseId);
  const floor = house?.floors.find((f) => f.id === w.floorId);
  return floor?.height ?? DEFAULT_WALL_HEIGHT;
}

function houseBBox(scene: Scene, houseId: string): { w: number; h: number } | null {
  const house = scene.houses.find((h) => h.id === houseId);
  if (!house) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of scene.walls) {
    if (w.houseId !== houseId || w.floorId !== house.activeFloorId) continue;
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (maxX <= minX) return null;
  return { w: maxX - minX, h: maxY - minY };
}

/** Scale factor for a house: sqrt(area / 150m²), clamped to [1, 3]. */
export function houseScaleFactor(scene: Scene, houseId: string): number {
  const bb = houseBBox(scene, houseId);
  if (!bb) return 1;
  const areaM2 = (bb.w * bb.h) / 10000;
  return Math.min(MAX_FACTOR, Math.max(1, Math.sqrt(areaM2 / REF_AREA_M2)));
}

/**
 * Scale factor for a placement point: the active house's factor, else the
 * factor of whichever house's footprint contains the point, else 1.
 */
export function scaleForPoint(scene: Scene, activeHouseId: string | null, p: Vec): number {
  if (activeHouseId) return houseScaleFactor(scene, activeHouseId);
  for (const house of scene.houses) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of scene.walls) {
      if (w.houseId !== house.id || w.floorId !== house.activeFloorId) continue;
      for (const pt of [w.a, w.b]) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
    }
    if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
      return houseScaleFactor(scene, house.id);
    }
  }
  return 1;
}

export const scaled = (v: number, f: number) => Math.round(v * f);
