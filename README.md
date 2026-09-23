# roughhouse

A top-down floor-plan editor built with Next.js and a custom HTML5-canvas engine.
Draw walls, punch in doors and windows, drop stairs and 300+ furniture symbols, and
export your plan as PNG or JSON.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Requires Node 20+.

## Features

- **Walls** — click-to-chain wall drawing with grid/endpoint/angle snapping, drag
  endpoints to extend or reshape (connected corners move together), per-wall thickness,
  live length labels. Rectangle-room tool for quick rooms.
- **Openings** — single / double / sliding doors, plain doorways and windows. They cut
  the wall automatically, render proper swing arcs, slide along their wall, and can flip
  side/hinge.
- **Stairs** — straight (width/length/steps) and spiral, with tread lines and direction
  arrows.
- **Furniture library** — 300+ top-view symbols across Seating, Beds, Tables, Storage,
  Kitchen, Bathroom, Office, Outdoor, Garden, Decor, Games and a full set of Indian
  household items (charpai, jhoola, pooja mandir, matka, sil batta, desert cooler…).
  Searchable, categorized, with sprite previews.
- **Editing** — select/move, drag-rotate handle, quick-rotate buttons, resize from the
  properties panel, duplicate, undo/redo, autosave to localStorage.
- **Export** — PNG (print-style black on white) and JSON save/load.

## Shortcuts

| Key | Action |
| --- | --- |
| V / W / B | Select / Wall / Room tool |
| D / N / S | Door / Window / Stairs tool |
| R | Rotate selection 15° (Shift+R reverses) |
| F | Flip door swing |
| ⌘Z / ⌘⇧Z | Undo / Redo |
| ⌘D | Duplicate |
| Del | Delete selection |
| G | Toggle grid |
| Scroll / Space+drag | Zoom / Pan |
| Esc, Enter, double-click | End wall run |

## Sprite pipeline

Furniture sprites are AI-generated line-art sheets (4x4 grids) that get sliced into
individual transparent PNGs and tinted at runtime to match the theme.

```bash
# 1. catalog-def.mjs defines every sheet + item (id, label, category, size, prompt text)
node scripts/catalog-def.mjs        # prints the generation prompt for each sheet
# 2. drop generated sheets into assets-src/<sheet>.png, then:
npm run sprites:slice               # slices into public/sprites/<id>.png
npm run catalog:build               # regenerates lib/catalog.json for the app
```

Scene data model (`lib/types.ts`): walls are segments with thickness; openings live on a
wall at a parametric position; stairs and items are rotatable rects. Everything is in
centimeters.
