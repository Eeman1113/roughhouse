// Houses: named groups of elements with stacked floors.
// Elements are tagged houseId+floorId; only the active floor of each house is
// visible/editable. Untagged elements ("canvas") are always visible.
import { House, Scene, Selection, Wall, uid } from "./types";

function isHidden(scene: Scene, houseId?: string, floorId?: string): boolean {
  if (!houseId) return false;
  const h = scene.houses.find((x) => x.id === houseId);
  if (!h) return false; // orphaned tag: treat as canvas
  return floorId !== h.activeFloorId;
}

/** The scene as currently visible: active floor of every house + all canvas elements. */
export function visibleScene(scene: Scene): Scene {
  if (!scene.houses.length) return scene;
  const walls = scene.walls.filter((w) => !isHidden(scene, w.houseId, w.floorId));
  const wallIds = new Set(walls.map((w) => w.id));
  return {
    ...scene,
    walls,
    openings: scene.openings.filter((o) => wallIds.has(o.wallId)),
    stairs: scene.stairs.filter((s) => !isHidden(scene, s.houseId, s.floorId)),
    items: scene.items.filter((i) => !isHidden(scene, i.houseId, i.floorId)),
    rooms: scene.rooms.filter((r) => !isHidden(scene, r.houseId, r.floorId)),
    notes: scene.notes.filter((n) => !isHidden(scene, n.houseId, n.floorId)),
  };
}

/** Walls of the floor directly below a house's active floor (for onion-skin ghosting). */
export function ghostWalls(scene: Scene, house: House): Wall[] {
  const idx = house.floors.findIndex((f) => f.id === house.activeFloorId);
  if (idx <= 0) return [];
  const below = house.floors[idx - 1].id;
  return scene.walls.filter((w) => w.houseId === house.id && w.floorId === below);
}

/** Group the selected walls/items/stairs into a new house with one ground floor. */
export function groupAsHouse(
  scene: Scene,
  selection: Selection[],
  name: string
): { scene: Scene; houseId: string } {
  const houseId = uid();
  const floorId = uid();
  const ids = {
    wall: new Set(selection.filter((s) => s.kind === "wall").map((s) => s.id)),
    item: new Set(selection.filter((s) => s.kind === "item").map((s) => s.id)),
    stairs: new Set(selection.filter((s) => s.kind === "stairs").map((s) => s.id)),
    room: new Set(selection.filter((s) => s.kind === "room").map((s) => s.id)),
    note: new Set(selection.filter((s) => s.kind === "note").map((s) => s.id)),
  };
  const house: House = {
    id: houseId,
    name,
    floors: [{ id: floorId, name: "Ground floor" }],
    activeFloorId: floorId,
  };
  return {
    houseId,
    scene: {
      ...scene,
      houses: [...scene.houses, house],
      walls: scene.walls.map((w) => (ids.wall.has(w.id) ? { ...w, houseId, floorId } : w)),
      items: scene.items.map((i) => (ids.item.has(i.id) ? { ...i, houseId, floorId } : i)),
      stairs: scene.stairs.map((s) => (ids.stairs.has(s.id) ? { ...s, houseId, floorId } : s)),
      rooms: scene.rooms.map((r) => (ids.room.has(r.id) ? { ...r, houseId, floorId } : r)),
      notes: scene.notes.map((n) => (ids.note.has(n.id) ? { ...n, houseId, floorId } : n)),
    },
  };
}

/** Add a floor above the active one, cloning its walls + openings (floors share bones). */
export function addFloor(scene: Scene, houseId: string): Scene {
  const house = scene.houses.find((h) => h.id === houseId);
  if (!house) return scene;
  const floorId = uid();
  const name = `Floor ${house.floors.length}`;
  const srcWalls = scene.walls.filter(
    (w) => w.houseId === houseId && w.floorId === house.activeFloorId
  );
  const idMap = new Map<string, string>();
  const newWalls = srcWalls.map((w) => {
    const id = uid();
    idMap.set(w.id, id);
    return { ...w, id, floorId, a: { ...w.a }, b: { ...w.b } };
  });
  const newOpenings = scene.openings
    .filter((o) => idMap.has(o.wallId))
    .map((o) => ({ ...o, id: uid(), wallId: idMap.get(o.wallId)! }));
  return {
    ...scene,
    walls: [...scene.walls, ...newWalls],
    openings: [...scene.openings, ...newOpenings],
    houses: scene.houses.map((h) =>
      h.id === houseId
        ? { ...h, floors: [...h.floors, { id: floorId, name }], activeFloorId: floorId }
        : h
    ),
  };
}

export function setActiveFloor(scene: Scene, houseId: string, floorId: string): Scene {
  return {
    ...scene,
    houses: scene.houses.map((h) => (h.id === houseId ? { ...h, activeFloorId: floorId } : h)),
  };
}

export function renameHouse(scene: Scene, houseId: string, name: string): Scene {
  return {
    ...scene,
    houses: scene.houses.map((h) => (h.id === houseId ? { ...h, name } : h)),
  };
}

export function renameFloor(scene: Scene, houseId: string, floorId: string, name: string): Scene {
  return {
    ...scene,
    houses: scene.houses.map((h) =>
      h.id === houseId
        ? { ...h, floors: h.floors.map((f) => (f.id === floorId ? { ...f, name } : f)) }
        : h
    ),
  };
}

/** Delete a floor and everything on it. Caller guards the last-floor case. */
export function deleteFloor(scene: Scene, houseId: string, floorId: string): Scene {
  const house = scene.houses.find((h) => h.id === houseId);
  if (!house || house.floors.length <= 1) return scene;
  const doomedWalls = new Set(
    scene.walls.filter((w) => w.houseId === houseId && w.floorId === floorId).map((w) => w.id)
  );
  const floors = house.floors.filter((f) => f.id !== floorId);
  const activeFloorId =
    house.activeFloorId === floorId ? floors[Math.max(0, floors.length - 1)].id : house.activeFloorId;
  return {
    ...scene,
    walls: scene.walls.filter((w) => !doomedWalls.has(w.id)),
    openings: scene.openings.filter((o) => !doomedWalls.has(o.wallId)),
    stairs: scene.stairs.filter((s) => !(s.houseId === houseId && s.floorId === floorId)),
    items: scene.items.filter((i) => !(i.houseId === houseId && i.floorId === floorId)),
    rooms: scene.rooms.filter((r) => !(r.houseId === houseId && r.floorId === floorId)),
    notes: scene.notes.filter((n) => !(n.houseId === houseId && n.floorId === floorId)),
    houses: scene.houses.map((h) => (h.id === houseId ? { ...h, floors, activeFloorId } : h)),
  };
}

/** Dissolve the house: untag every member (all floors land on the canvas). */
export function ungroupHouse(scene: Scene, houseId: string): Scene {
  const strip = <T extends { houseId?: string; floorId?: string }>(el: T): T =>
    el.houseId === houseId ? { ...el, houseId: undefined, floorId: undefined } : el;
  return {
    ...scene,
    walls: scene.walls.map(strip),
    items: scene.items.map(strip),
    stairs: scene.stairs.map(strip),
    rooms: scene.rooms.map(strip),
    notes: scene.notes.map(strip),
    houses: scene.houses.filter((h) => h.id !== houseId),
  };
}

/** Selection covering every element of one floor of a house. */
export function floorSelection(scene: Scene, houseId: string, floorId: string): Selection[] {
  const sel: Selection[] = [];
  for (const w of scene.walls)
    if (w.houseId === houseId && w.floorId === floorId) sel.push({ kind: "wall", id: w.id });
  for (const i of scene.items)
    if (i.houseId === houseId && i.floorId === floorId) sel.push({ kind: "item", id: i.id });
  for (const s of scene.stairs)
    if (s.houseId === houseId && s.floorId === floorId) sel.push({ kind: "stairs", id: s.id });
  for (const r of scene.rooms)
    if (r.houseId === houseId && r.floorId === floorId) sel.push({ kind: "room", id: r.id });
  for (const n of scene.notes)
    if (n.houseId === houseId && n.floorId === floorId) sel.push({ kind: "note", id: n.id });
  return sel;
}
