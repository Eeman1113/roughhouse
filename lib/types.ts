// All coordinates are in centimeters (world space).

export type Vec = { x: number; y: number };

export interface Wall {
  id: string;
  a: Vec;
  b: Vec;
  thickness: number; // cm
  /** wall height override in cm; inherits the floor height (270 default) when unset. */
  height?: number;
  color?: string; // optional tint override
  locked?: boolean;
  houseId?: string;
  floorId?: string;
}

export type OpeningKind =
  | "door-single"
  | "door-double"
  | "door-sliding"
  | "door-pocket"
  | "door-bifold"
  | "door-garage"
  | "doorway"
  | "window"
  | "window-casement"
  | "window-double-casement"
  | "window-sliding"
  | "window-bay";

export interface Opening {
  id: string;
  wallId: string;
  t: number; // 0..1 position of center along the wall
  width: number; // cm
  kind: OpeningKind;
  flip: boolean; // which side of the wall the door swings to
  swing: boolean; // which jamb the hinge is on / slide direction
}

export type StairsKind = "straight" | "spiral";

export interface Stairs {
  id: string;
  kind: StairsKind;
  pos: Vec; // center
  rot: number; // radians
  width: number; // cm (spiral: diameter)
  length: number; // cm (unused for spiral)
  steps: number;
  linkTo?: string; // floorId this staircase leads to
  locked?: boolean;
  houseId?: string;
  floorId?: string;
}

// Item kinds come from lib/catalog.json (210+ furniture/fixture types).
export type ItemKind = string;

export interface Item {
  id: string;
  kind: ItemKind;
  pos: Vec; // center
  rot: number; // radians
  w: number;
  h: number;
  locked?: boolean;
  houseId?: string;
  floorId?: string;
}

/** A text annotation pinned to the plan. */
export interface Note {
  id: string;
  pos: Vec;
  text: string;
  size: number; // text height in world cm
  locked?: boolean;
  houseId?: string;
  floorId?: string;
}

/** A named region of floor space: auto-detected from walls or drawn as a box. */
export interface Room {
  id: string;
  name: string;
  poly: Vec[]; // closed polygon, world cm
  color: string; // base hex; rendered translucent
  locked?: boolean;
  houseId?: string;
  floorId?: string;
}

export interface Floor {
  id: string;
  name: string;
  /** floor-to-ceiling height in cm; walls inherit it (default 270). */
  height?: number;
}

/** A named group of elements with stacked floors; only the active floor is visible. */
export interface House {
  id: string;
  name: string;
  floors: Floor[];
  activeFloorId: string;
}

export interface Scene {
  walls: Wall[];
  openings: Opening[];
  stairs: Stairs[];
  items: Item[];
  houses: House[];
  rooms: Room[];
  notes: Note[];
}

export type SelKind = "wall" | "opening" | "stairs" | "item" | "room" | "note";
export interface Selection {
  kind: SelKind;
  id: string;
}

export type Tool =
  | "select"
  | "wall"
  | "room"
  | "room-label"
  | "pan"
  | "note"
  | OpeningKind
  | "stairs"
  | "stairs-spiral"
  | `item:${ItemKind}`;

export const emptyScene = (): Scene => ({
  walls: [],
  openings: [],
  stairs: [],
  items: [],
  houses: [],
  rooms: [],
  notes: [],
});

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Sizes/labels for the original hand-drawn vector fallbacks; the full catalog
// (including these) lives in catalog.json — use lib/catalog.ts itemDef() instead.
export const ITEM_DEFAULTS: Record<string, { w: number; h: number; label: string }> = {
  "bed-single": { w: 90, h: 200, label: "Bed (single)" },
  "bed-double": { w: 160, h: 200, label: "Bed (double)" },
  sofa: { w: 210, h: 90, label: "Sofa" },
  armchair: { w: 90, h: 78, label: "Armchair" },
  "table-rect": { w: 160, h: 90, label: "Table" },
  "table-round": { w: 110, h: 110, label: "Round table" },
  chair: { w: 45, h: 45, label: "Chair" },
  desk: { w: 140, h: 70, label: "Desk" },
  wardrobe: { w: 120, h: 60, label: "Wardrobe" },
  counter: { w: 120, h: 45, label: "Counter" },
  stove: { w: 60, h: 58, label: "Stove" },
  fridge: { w: 70, h: 62, label: "Fridge" },
  "kitchen-sink": { w: 80, h: 52, label: "Kitchen sink" },
  toilet: { w: 42, h: 66, label: "Toilet" },
  sink: { w: 50, h: 42, label: "Basin" },
  bathtub: { w: 170, h: 80, label: "Bathtub" },
  shower: { w: 90, h: 90, label: "Shower" },
  plant: { w: 50, h: 50, label: "Plant" },
};

export const OPENING_DEFAULTS: Record<OpeningKind, { width: number; label: string }> = {
  "door-single": { width: 90, label: "Door" },
  "door-double": { width: 150, label: "Double door" },
  "door-sliding": { width: 180, label: "Sliding door" },
  "door-pocket": { width: 90, label: "Pocket door" },
  "door-bifold": { width: 90, label: "Bifold door" },
  "door-garage": { width: 240, label: "Garage door" },
  doorway: { width: 100, label: "Doorway" },
  window: { width: 120, label: "Window" },
  "window-casement": { width: 60, label: "Casement window" },
  "window-double-casement": { width: 120, label: "Double casement" },
  "window-sliding": { width: 150, label: "Sliding window" },
  "window-bay": { width: 200, label: "Bay window" },
};
