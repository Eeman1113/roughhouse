// Multi-selection clipboard: copy/cut/paste/duplicate/delete scene fragments.
// A fragment carries selected walls WITH their openings, plus items/stairs/rooms/notes.
import { useEditor } from "./store";
import { Item, Note, Opening, Room, Scene, Selection, Stairs, Wall, uid } from "./types";

export interface Fragment {
  walls: Wall[];
  openings: Opening[];
  stairs: Stairs[];
  items: Item[];
  rooms: Room[];
  notes: Note[];
}

const deep = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function buildFragment(scene: Scene, sel: Selection[]): Fragment | null {
  const wallIds = new Set(sel.filter((s) => s.kind === "wall").map((s) => s.id));
  const itemIds = new Set(sel.filter((s) => s.kind === "item").map((s) => s.id));
  const stairIds = new Set(sel.filter((s) => s.kind === "stairs").map((s) => s.id));
  const roomIds = new Set(sel.filter((s) => s.kind === "room").map((s) => s.id));
  const noteIds = new Set(sel.filter((s) => s.kind === "note").map((s) => s.id));
  const frag: Fragment = {
    walls: scene.walls.filter((w) => wallIds.has(w.id)),
    openings: scene.openings.filter((o) => wallIds.has(o.wallId)),
    stairs: scene.stairs.filter((x) => stairIds.has(x.id)),
    items: scene.items.filter((x) => itemIds.has(x.id)),
    rooms: scene.rooms.filter((x) => roomIds.has(x.id)),
    notes: scene.notes.filter((x) => noteIds.has(x.id)),
  };
  if (
    !frag.walls.length &&
    !frag.stairs.length &&
    !frag.items.length &&
    !frag.rooms.length &&
    !frag.notes.length
  )
    return null;
  return deep(frag);
}

/** "Pen 3" + 2 → "Pen 5"; "Pen" + 2 → "Pen 3". */
function bumpLabel(text: string, inc: number): string {
  const m = text.match(/^(.*?)(\d+)\s*$/);
  if (m) return `${m[1]}${parseInt(m[2], 10) + inc}`;
  return `${text} ${inc + 1}`;
}

/** Insert one copy of a fragment (fresh ids, offset); NO checkpoint — caller owns undo. */
function insertFragment(frag: Fragment, offset: number, bump: number): Selection[] {
  const st = useEditor.getState();
  const wallIdMap = new Map<string, string>();
  const walls = frag.walls.map((w) => {
    const id = uid();
    wallIdMap.set(w.id, id);
    return {
      ...deep(w),
      id,
      a: { x: w.a.x + offset, y: w.a.y + offset },
      b: { x: w.b.x + offset, y: w.b.y + offset },
    };
  });
  const openings = frag.openings
    .filter((o) => wallIdMap.has(o.wallId))
    .map((o) => ({ ...deep(o), id: uid(), wallId: wallIdMap.get(o.wallId)! }));
  const stairs = frag.stairs.map((x) => ({
    ...deep(x),
    id: uid(),
    pos: { x: x.pos.x + offset, y: x.pos.y + offset },
  }));
  const items = frag.items.map((x) => ({
    ...deep(x),
    id: uid(),
    pos: { x: x.pos.x + offset, y: x.pos.y + offset },
  }));
  const rooms = frag.rooms.map((x) => ({
    ...deep(x),
    id: uid(),
    name: bump > 0 ? bumpLabel(x.name, bump) : x.name,
    poly: x.poly.map((pt) => ({ x: pt.x + offset, y: pt.y + offset })),
  }));
  const notes = frag.notes.map((x) => ({
    ...deep(x),
    id: uid(),
    text: bump > 0 ? bumpLabel(x.text, bump) : x.text,
    pos: { x: x.pos.x + offset, y: x.pos.y + offset },
  }));

  st.mutate((s) => ({
    ...s,
    walls: [...s.walls, ...walls],
    openings: [...s.openings, ...openings],
    stairs: [...s.stairs, ...stairs],
    items: [...s.items, ...items],
    rooms: [...s.rooms, ...rooms],
    notes: [...s.notes, ...notes],
  }));
  return [
    ...walls.map((w) => ({ kind: "wall" as const, id: w.id })),
    ...stairs.map((x) => ({ kind: "stairs" as const, id: x.id })),
    ...items.map((x) => ({ kind: "item" as const, id: x.id })),
    ...rooms.map((x) => ({ kind: "room" as const, id: x.id })),
    ...notes.map((x) => ({ kind: "note" as const, id: x.id })),
  ];
}

/** Insert a fragment with fresh ids, offset by `offset` cm on both axes, and select it. */
export function pasteFragment(frag: Fragment, offset: number): void {
  const st = useEditor.getState();
  st.checkpoint();
  st.select(insertFragment(frag, offset, 0));
}

export function deleteSelected(): void {
  const st = useEditor.getState();
  const sel = st.selection;
  if (!sel.length) return;
  const sc = st.scene;
  // locked elements survive deletion — unlock first
  const lockedIds = new Set([
    ...sc.walls.filter((x) => x.locked).map((x) => x.id),
    ...sc.items.filter((x) => x.locked).map((x) => x.id),
    ...sc.stairs.filter((x) => x.locked).map((x) => x.id),
    ...sc.rooms.filter((x) => x.locked).map((x) => x.id),
    ...sc.notes.filter((x) => x.locked).map((x) => x.id),
  ]);
  const ids = (kind: Selection["kind"]) =>
    new Set(sel.filter((s) => s.kind === kind && !lockedIds.has(s.id)).map((s) => s.id));
  const wallIds = ids("wall");
  const openIds = ids("opening");
  const stairIds = ids("stairs");
  const itemIds = ids("item");
  const roomIds = ids("room");
  const noteIds = ids("note");
  st.checkpoint();
  st.mutate((s) => ({
    ...s,
    walls: s.walls.filter((w) => !wallIds.has(w.id)),
    openings: s.openings.filter((o) => !openIds.has(o.id) && !wallIds.has(o.wallId)),
    stairs: s.stairs.filter((x) => !stairIds.has(x.id)),
    items: s.items.filter((x) => !itemIds.has(x.id)),
    rooms: s.rooms.filter((x) => !roomIds.has(x.id)),
    notes: s.notes.filter((x) => !noteIds.has(x.id)),
  }));
  st.select(sel.filter((s) => lockedIds.has(s.id))); // keep locked ones selected
}

let clipboard: Fragment | null = null;
let pasteCount = 0;

export function copySelected(): boolean {
  const st = useEditor.getState();
  const frag = buildFragment(st.scene, st.selection);
  if (!frag) return false;
  clipboard = frag;
  pasteCount = 0;
  return true;
}

export function cutSelected(): void {
  if (copySelected()) deleteSelected();
}

export function pasteClipboard(): void {
  if (!clipboard) return;
  pasteCount++;
  const st = useEditor.getState();
  st.checkpoint();
  st.select(insertFragment(clipboard, 30 * pasteCount, 0));
}

/** ⌘D: copy + paste in one step, without touching the user's clipboard. */
export function duplicateSelected(): void {
  const st = useEditor.getState();
  const frag = buildFragment(st.scene, st.selection);
  if (frag) pasteFragment(frag, 30);
}

/** Bulk duplicate: N copies in a row, auto-numbering room names and note texts. */
export function duplicateSelectedTimes(count: number, spacing = 30): void {
  const st = useEditor.getState();
  const frag = buildFragment(st.scene, st.selection);
  if (!frag || count < 1) return;
  st.checkpoint();
  const all: Selection[] = [];
  for (let i = 0; i < count; i++) {
    all.push(...insertFragment(frag, spacing * (i + 1), i + 1));
  }
  st.select(all);
}
