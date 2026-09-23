// Writes lib/catalog.json from catalog-def.mjs + the original hand-mapped sprites.
import { writeFile } from "fs/promises";
import { SHEETS } from "./catalog-def.mjs";

const LEGACY = [
  { id: "bed-single", label: "Bed (single)", cat: "Beds", w: 90, h: 200 },
  { id: "bed-double", label: "Bed (double)", cat: "Beds", w: 160, h: 200 },
  { id: "sofa", label: "Sofa", cat: "Seating", w: 210, h: 90 },
  { id: "armchair", label: "Armchair", cat: "Seating", w: 90, h: 78 },
  { id: "table-rect", label: "Table", cat: "Tables", w: 160, h: 90 },
  { id: "table-round", label: "Round table", cat: "Tables", w: 110, h: 110 },
  { id: "chair", label: "Chair", cat: "Seating", w: 45, h: 45 },
  { id: "desk", label: "Desk", cat: "Tables", w: 140, h: 70 },
  { id: "wardrobe", label: "Wardrobe", cat: "Storage", w: 120, h: 60 },
  { id: "counter", label: "Counter", cat: "Kitchen", w: 120, h: 45 },
  { id: "stove", label: "Stove", cat: "Kitchen", w: 60, h: 58 },
  { id: "fridge", label: "Fridge", cat: "Kitchen", w: 70, h: 62 },
  { id: "kitchen-sink", label: "Kitchen sink", cat: "Kitchen", w: 80, h: 52 },
  { id: "toilet", label: "Toilet", cat: "Bathroom", w: 42, h: 66 },
  { id: "sink", label: "Basin", cat: "Bathroom", w: 50, h: 42 },
  { id: "bathtub", label: "Bathtub", cat: "Bathroom", w: 170, h: 80 },
  { id: "shower", label: "Shower", cat: "Bathroom", w: 90, h: 90 },
  { id: "plant", label: "Plant", cat: "Garden", w: 50, h: 50 },
];

const items = [
  ...LEGACY,
  ...SHEETS.flatMap((s) => s.items.map(({ id, label, cat, w, h }) => ({ id, label, cat, w, h }))),
];

const seen = new Set();
for (const it of items) {
  if (seen.has(it.id)) throw new Error(`duplicate id: ${it.id}`);
  seen.add(it.id);
}

await writeFile("lib/catalog.json", JSON.stringify(items, null, 2));
console.log(`catalog.json: ${items.length} items`);
