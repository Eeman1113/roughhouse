// Generates public/samples/corner-house.json — the "Corner House" showcase plan.
//
// Site: a 20 × 18 m corner plot. Streets run along the south and east edges and
// meet at the south-east corner, which is rounded off with a curved compound
// wall (the usual corner splay). The house sits back in the plot's quiet
// north-west corner, 1.5 m off the neighbours, and answers the street corner
// with a curved glass wall: the living room downstairs, the master bedroom up.
//
// Units: cm, y grows southwards. Sprite convention: at rot 0 an item's back
// (bed headboard, sofa back, counter back) faces north (−y).
import { writeFileSync } from "node:fs";

const H = "corner-house";
const GF = "gf";
const FF = "ff";
const EXT = 23; // 9" brick
const INT = 12; // 4.5" partition
const R = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 }; // which wall the item's back is against

let n = 0;
const id = (p) => `${p}${(++n).toString(36)}`;
const scene = { walls: [], openings: [], stairs: [], items: [], houses: [], rooms: [], notes: [] };

const tag = (floor) => (floor ? { houseId: H, floorId: floor } : {});

function wall(a, b, o = {}) {
  const w = { id: id("w"), a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, thickness: o.th ?? INT, ...tag(o.floor) };
  if (o.bulge) w.bulge = o.bulge;
  if (o.height) w.height = o.height;
  if (o.color) w.color = o.color;
  scene.walls.push(w);
  return w;
}

/** Opening centred at point `at` (projected onto a straight wall, or t for curves).
 *  `into`: a point on the side the door swings towards. `hinge`: "a"|"b" end. */
function open(w, at, kind, width, o = {}) {
  let t;
  if (typeof at === "number") t = at;
  else {
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y;
    t = ((at[0] - w.a.x) * dx + (at[1] - w.a.y) * dy) / (dx * dx + dy * dy);
  }
  let flip = false;
  if (o.into) {
    const l = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const u = { x: (w.b.x - w.a.x) / l, y: (w.b.y - w.a.y) / l };
    const nrm = { x: -u.y, y: u.x };
    const c = { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t };
    flip = (o.into[0] - c.x) * nrm.x + (o.into[1] - c.y) * nrm.y > 0;
  }
  scene.openings.push({ id: id("o"), wallId: w.id, t, width, kind, flip, swing: o.hinge === "b" });
}

let FLOOR = GF; // floor that item() places onto
function item(kind, x, y, w, h, rot = 0, floor = FLOOR) {
  scene.items.push({ id: id("i"), kind, pos: { x, y }, rot, w, h, ...tag(floor) });
}
const site = (kind, x, y, w, h, rot = 0) => item(kind, x, y, w, h, rot, null);

/** Arc points (for room polygons hugging the curved wall). */
function arcPts(cx, cy, r, a0, a1, steps = 10) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push({ x: Math.round(cx + Math.cos(a) * r), y: Math.round(cy + Math.sin(a) * r) });
  }
  return pts;
}
const rect = (x0, y0, x1, y1, inset = 8) => [
  { x: x0 + inset, y: y0 + inset },
  { x: x1 - inset, y: y0 + inset },
  { x: x1 - inset, y: y1 - inset },
  { x: x0 + inset, y: y1 - inset },
];
function room(name, poly, color, floor) {
  scene.rooms.push({ id: id("r"), name, poly, color, ...tag(floor) });
}
function note(text, x, y, size = 34, floor = null) {
  scene.notes.push({ id: id("n"), pos: { x, y }, text, size, ...tag(floor) });
}

const C = {
  blue: "#0a84ff",
  green: "#30d158",
  orange: "#ff9f0a",
  pink: "#ff375f",
  purple: "#bf5af2",
  teal: "#64d2ff",
  yellow: "#ffd60a",
  mint: "#66d4cf",
};

// ───────────────────────── site: the corner plot ─────────────────────────
const NEIGH = { th: 20, height: 180 };
const STREET = { th: 20, height: 120 }; // low street-side wall: reads translucent
wall([0, 0], [2000, 0], NEIGH); // north neighbour
wall([0, 1800], [0, 0], NEIGH); // west neighbour
const southCW = wall([0, 1800], [1500, 1800], STREET);
// the street corner: quarter-circle splay, r = 5 m, centred (1500, 1300)
wall([1500, 1800], [2000, 1300], { ...STREET, bulge: 146 });
const eastCW = wall([2000, 1300], [2000, 0], STREET);
open(southCW, [800, 1800], "door-double", 120, { into: [800, 1700] }); // pedestrian gate on the axis of the front door
open(eastCW, [2000, 450], "door-sliding", 330); // car gate

// ───────────────────────── house shell (both floors) ─────────────────────────
// 15 × 12.5 m rectangle whose south-east corner is a 5 m radius curve facing the street corner.
function shell(floor) {
  const o = { th: EXT, floor };
  return {
    north: wall([150, 150], [1650, 150], o),
    east: wall([1650, 150], [1650, 900], o),
    curve: wall([1650, 900], [1150, 1400], { ...o, bulge: -146 }), // centre (1150, 900), r 500
    south: wall([1150, 1400], [150, 1400], o),
    west: wall([150, 1400], [150, 150], o),
  };
}
// quarter arc of the curved wall's inner face, for room polygons (from east end to south end)
const innerArc = arcPts(1150, 900, 500 - EXT / 2 - 4, 0, Math.PI / 2, 12);

// ───────────────────────── ground floor ─────────────────────────
{
  const s = shell(GF);
  const f = { floor: GF };
  // west wing: study / vestibule + bath / guest bedroom
  const x600 = wall([600, 150], [600, 1400], f);
  const y650 = wall([150, 650], [600, 650], f);
  const y900 = wall([150, 900], [600, 900], f);
  const x450 = wall([450, 650], [450, 900], f);
  // powder room tucked beside the stair
  const pw = wall([750, 150], [750, 400], f);
  const ps = wall([750, 400], [1000, 400], f);
  // kitchen west wall (behind the powder room) + foyer / living wall (TV wall)
  wall([1000, 150], [1000, 400], f);
  const tvWall = wall([1000, 1060], [1000, 1400], f);

  // doors
  open(s.south, [800, 1400], "door-double", 150, { into: [800, 1200] }); // main entrance
  open(x600, [600, 775], "doorway", 90); // hall → vestibule
  open(y650, [525, 650], "door-single", 85, { into: [525, 500], hinge: "b" }); // study
  open(x450, [450, 775], "door-single", 75, { into: [300, 775], hinge: "a" }); // guest bath
  open(y900, [525, 900], "door-single", 85, { into: [525, 1050], hinge: "b" }); // guest bedroom
  open(ps, [875, 400], "door-single", 75, { into: [875, 300], hinge: "b" }); // powder room
  open(s.east, [1650, 330], "door-single", 90, { into: [1500, 330], hinge: "a" }); // kitchen side door → car porch

  // windows
  open(s.north, [375, 150], "window-sliding", 150); // study
  open(s.west, [150, 400], "window", 120); // study
  open(s.west, [150, 775], "window-casement", 60); // guest bath
  open(s.west, [150, 1150], "window", 150); // guest bedroom
  open(s.south, [375, 1400], "window-sliding", 150); // guest bedroom
  open(s.north, [662, 150], "window", 90); // stair
  open(s.north, [875, 150], "window-casement", 60); // powder
  open(s.north, [1325, 150], "window-sliding", 180); // kitchen, over the sink
  open(s.east, [1650, 675], "window-double-casement", 150); // dining
  open(s.south, [655, 1400], "window-casement", 60); // foyer side-light
  // the curved glass wall: three tall panes following the arc
  open(s.curve, 0.2, "window", 170);
  open(s.curve, 0.5, "window", 170);
  open(s.curve, 0.8, "window", 170);

  // stair: foot in the hall, rising north toward the stair window
  scene.stairs.push({
    id: id("s"), kind: "straight", pos: { x: 668, y: 345 }, rot: 0, width: 100, length: 360, steps: 18,
    linkTo: FF, ...tag(GF),
  });

  // study
  item("l-desk", 245, 245, 160, 160, R.W);
  item("office-chair", 280, 290, 60, 60, R.S);
  item("bookcase-wide", 445, 180, 160, 35, R.N);
  item("armchair", 500, 560, 90, 78, R.S);
  item("floor-lamp", 410, 580, 35, 35);
  item("rug-round", 360, 400, 150, 150);
  // guest bath
  item("toilet", 190, 700, 42, 66, R.W);
  item("single-vanity", 300, 690, 75, 55, R.N);
  item("walk-in-shower", 250, 845, 140, 90, R.S);
  // vestibule
  item("coat-rack", 525, 710, 50, 50);
  // guest bedroom
  item("bed-double", 262, 1150, 160, 200, R.W);
  item("nightstand", 185, 1045, 45, 40, R.W);
  item("nightstand", 185, 1255, 45, 40, R.W);
  item("wooden-almirah", 540, 1150, 120, 55, R.E);
  item("dressing-table", 450, 1365, 90, 45, R.S);
  item("rug-rect", 400, 1150, 200, 140, R.E);

  // powder room
  item("toilet", 960, 250, 42, 66, R.E);
  item("pedestal-sink", 790, 250, 45, 45, R.W);

  // kitchen (north-east): fridge, counter run under the window, stove, breakfast bar
  item("fridge", 1050, 200, 70, 62, R.N);
  item("pantry", 1050, 300, 90, 50, R.W);
  item("counter", 1150, 185, 120, 45, R.N);
  item("kitchen-sink", 1325, 190, 80, 52, R.N);
  item("counter", 1245, 185, 80, 45, R.N);
  item("counter", 1430, 185, 120, 45, R.N);
  item("gas-stove-2", 1430, 185, 60, 40, R.N);
  item("counter", 1615, 250, 90, 45, R.E);
  item("water-purifier", 1625, 380, 40, 25, R.E);
  item("breakfast-bar", 1310, 450, 180, 50, R.S);
  item("bar-stool", 1250, 505, 40, 40);
  item("bar-stool", 1310, 505, 40, 40);
  item("bar-stool", 1370, 505, 40, 40);

  // dining
  item("dining-6-indian", 1325, 690, 200, 120);
  item("ceiling-fan", 1325, 690, 120, 120);

  // hall: a jhoola swing at the heart of the house, pooja corner by the stair
  item("jhoola", 830, 760, 150, 60, R.N);
  item("pooja-mandir", 975, 530, 90, 50, R.E);
  item("rangoli", 800, 1200, 100, 100);

  // foyer
  item("entrance-shoe-rack", 628, 1250, 90, 35, R.W);
  item("umbrella-stand", 625, 1350, 25, 25);
  item("console-table", 975, 1180, 120, 35, R.E);
  item("floor-vase", 975, 1290, 35, 35);

  // living room: TV on the solid wall, sofa with its back to the curved glass
  item("tv-showcase", 1030, 1220, 180, 50, R.W);
  item("sofa", 1375, 1200, 210, 90, R.E);
  item("rug-rect", 1215, 1200, 200, 140, R.E);
  item("coffee-table", 1215, 1200, 110, 60, R.E);
  item("armchair", 1200, 985, 90, 78, R.N);
  item("side-table", 1300, 1000, 45, 45);
  item("floor-lamp", 1430, 1040, 35, 35);
  item("monstera", 1500, 1120, 70, 70);
  item("piano-upright", 1085, 900, 150, 60, R.W);

  // rooms
  room("Study", rect(150, 150, 600, 650), C.purple, GF);
  room("Guest Bath", rect(150, 650, 450, 900), C.teal, GF);
  room("Lobby", rect(450, 650, 600, 900), C.mint, GF);
  room("Guest Bedroom", rect(150, 900, 600, 1400), C.blue, GF);
  room("Powder", rect(750, 150, 1000, 400), C.teal, GF);
  room("Kitchen", rect(1000, 150, 1650, 540, 8), C.orange, GF);
  room("Dining", rect(1000, 540, 1650, 850, 8), C.yellow, GF);
  room("Hall", [
    { x: 612, y: 408 }, { x: 992, y: 408 }, { x: 992, y: 1052 }, { x: 612, y: 1052 },
  ], C.mint, GF);
  room("Foyer", rect(600, 1060, 1000, 1400), C.green, GF);
  room("Living Room", [
    { x: 1008, y: 858 },
    { x: 1638, y: 858 },
    ...innerArc.filter((p) => p.y >= 858).map((p) => (p.x > 1638 ? { ...p, x: 1638 } : p)),
    { x: 1008, y: 1388 },
  ], C.pink, GF);
}

// ───────────────────────── first floor ─────────────────────────
{
  FLOOR = FF;
  const s = shell(FF);
  const f = { floor: FF };
  // west wing: bedroom 3 / vestibule + shared bath / kids' room
  const x600 = wall([600, 150], [600, 1400], f);
  const y600 = wall([150, 600], [600, 600], f);
  const y850 = wall([150, 850], [600, 850], f);
  const x450 = wall([450, 600], [450, 850], f);
  // master suite
  const x1000 = wall([1000, 150], [1000, 1400], f);
  const m600 = wall([1000, 600], [1650, 600], f);
  const x1300 = wall([1300, 150], [1300, 600], f);

  // doors
  open(x600, [600, 725], "doorway", 90);
  open(y600, [525, 600], "door-single", 85, { into: [525, 450], hinge: "b" });
  open(x450, [450, 725], "door-single", 75, { into: [300, 725], hinge: "a" });
  open(y850, [525, 850], "door-single", 85, { into: [525, 1000], hinge: "b" });
  open(x1000, [1000, 700], "door-single", 90, { into: [1150, 700], hinge: "a" }); // master
  open(m600, [1150, 600], "doorway", 90); // bedroom → walk-in closet
  open(x1300, [1300, 480], "door-pocket", 80); // closet → master bath
  open(s.south, [800, 1400], "door-sliding", 180); // lounge → balcony
  // cantilevered balcony over the front door, with a low parapet
  const para = { floor: FF, th: 12, height: 105 };
  wall([600, 1400], [600, 1560], para);
  wall([600, 1560], [1000, 1560], para);
  wall([1000, 1560], [1000, 1400], para);
  item("planter-box", 690, 1535, 100, 35, R.S);
  item("planter-box", 910, 1535, 100, 35, R.S);
  item("aram-kursi", 800, 1490, 70, 110, R.S);
  room("Balcony", rect(600, 1400, 1000, 1560), C.green, FF);

  // windows
  open(s.north, [375, 150], "window-sliding", 150); // bedroom 3
  open(s.west, [150, 375], "window", 120); // bedroom 3
  open(s.west, [150, 725], "window-casement", 60); // shared bath
  open(s.west, [150, 1125], "window", 150); // kids
  open(s.south, [375, 1400], "window-sliding", 150); // kids
  open(s.north, [662, 150], "window", 90); // stair
  open(s.north, [1475, 150], "window-casement", 60); // master bath
  open(s.east, [1650, 375], "window-casement", 60); // master bath
  open(s.east, [1650, 750], "window-double-casement", 120); // master bedroom
  open(s.curve, 0.3, "window", 200); // the bed looks out over the street corner
  open(s.curve, 0.75, "window", 170);

  scene.stairs.push({
    id: id("s"), kind: "straight", pos: { x: 668, y: 345 }, rot: 0, width: 100, length: 360, steps: 18,
    linkTo: GF, ...tag(FF),
  });

  // bedroom 3
  item("bed-double", 262, 380, 160, 200, R.W);
  item("nightstand", 185, 255, 45, 40, R.W);
  item("nightstand", 185, 505, 45, 40, R.W);
  item("steel-almirah", 545, 250, 90, 50, R.E);
  item("study-table", 470, 530, 110, 60, R.S);
  item("chair", 470, 470, 45, 45, R.S);
  // shared bath
  item("toilet", 190, 650, 42, 66, R.W);
  item("single-vanity", 310, 640, 75, 55, R.N);
  item("bathtub", 250, 800, 170, 80, R.S);
  // kids' room
  item("bunk-bed", 212, 1130, 95, 200, R.N);
  item("desk", 520, 1300, 140, 70, R.E);
  item("office-chair", 455, 1300, 60, 60, R.E);
  item("toy-chest", 400, 1370, 80, 45, R.S);
  item("play-mat", 360, 1080, 150, 150);
  item("bookshelf", 545, 950, 90, 30, R.E);

  // family lounge at the stair head, opening onto the south balcony
  item("floor-seating", 810, 1180, 200, 150);
  item("tv-stand", 975, 1180, 160, 45, R.E);
  item("carrom-board", 850, 830, 90, 90);
  item("bookcase-wide", 800, 170, 160, 35, R.N);

  // walk-in closet
  item("wardrobe", 1035, 375, 120, 60, R.W);
  item("wardrobe", 1265, 375, 120, 60, R.E);
  item("wardrobe", 1150, 180, 120, 60, R.N);
  item("ottoman", 1150, 400, 60, 60);
  // master bath
  item("double-vanity", 1475, 185, 150, 55, R.N);
  item("walk-in-shower", 1575, 450, 140, 90, R.E);
  item("toilet", 1345, 250, 42, 66, R.W);
  item("towel-cabinet", 1340, 560, 50, 35, R.S);
  // master bedroom: king bed on the solid wall, facing the curved glass
  item("king-bed", 1117, 960, 190, 210, R.W);
  item("nightstand", 1033, 830, 45, 40, R.W);
  item("nightstand", 1033, 1090, 45, 40, R.W);
  item("rug-rect", 1260, 960, 200, 140, R.E);
  item("chaise", 1480, 880, 170, 70, R.E);
  item("dresser", 1100, 1370, 120, 50, R.S);
  item("plant", 1370, 1240, 50, 50);

  room("Bedroom 3", rect(150, 150, 600, 600), C.blue, FF);
  room("Bath", rect(150, 600, 450, 850), C.teal, FF);
  room("Lobby", rect(450, 600, 600, 850), C.mint, FF);
  room("Kids' Room", rect(150, 850, 600, 1400), C.green, FF);
  room("Family Lounge", rect(600, 150, 1000, 1400), C.yellow, FF);
  room("Walk-in Closet", rect(1000, 150, 1300, 600), C.purple, FF);
  room("Master Bath", rect(1300, 150, 1650, 600), C.teal, FF);
  room("Master Bedroom", [
    { x: 1008, y: 608 },
    { x: 1638, y: 608 },
    ...innerArc.map((p) => (p.x > 1638 ? { ...p, x: 1638 } : p)),
    { x: 1008, y: 1388 },
  ], C.pink, FF);
}

// ───────────────────────── garden & street ─────────────────────────
site("tree-large", 1720, 1520, 300, 300); // shade tree filling the street corner
site("garden-bench", 1340, 1640, 140, 50, R.S);
site("stepping-stones", 800, 1600, 60, 180);
site("tulsi-planter", 560, 1560, 60, 60);
site("flower-bed", 300, 1730, 150, 60, R.S);
site("flower-bed", 1150, 1730, 150, 60, R.S);
site("bush", 1790, 1100, 80, 80);
site("palm-plant", 1700, 1000, 60, 60);
site("tree-small", 80, 1720, 150, 150);
// car porch along the east side, off the sliding gate
site("motorcycle", 1900, 330, 80, 200);
site("scooter", 1790, 330, 70, 180);
site("bicycle", 1740, 720, 60, 180);
site("planter-box", 1830, 40, 100, 35, R.N);
// services along the quiet north strip
site("sintex-tank", 70, 70, 120, 120);
site("clothesline", 1000, 75, 250, 30);

note("Corner House", 0, -190, 64);
note("20 × 18 m corner plot · 2 floors · 3 bed", 0, -120, 30);
note("MAIN ROAD", 650, 1930, 40);
note("CROSS ROAD", 2060, 650, 40);
note("the street corner gets a 5 m curved splay", 1560, 1900, 24);
note("curved glass living room faces the corner", 1250, 1560, 22, GF);
note("master bedroom looks out over the corner", 1250, 1560, 22, FF);

scene.houses.push({
  id: H,
  name: "Corner House",
  floors: [
    { id: GF, name: "Ground", height: 300 },
    { id: FF, name: "First", height: 285 },
  ],
  activeFloorId: GF,
});

writeFileSync(new URL("../public/samples/corner-house.json", import.meta.url), JSON.stringify(scene, null, 1));
console.log(
  `corner-house: ${scene.walls.length} walls, ${scene.openings.length} openings, ${scene.items.length} items, ${scene.rooms.length} rooms`
);
