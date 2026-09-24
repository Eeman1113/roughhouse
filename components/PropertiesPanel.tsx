"use client";

import { add, dist, norm, scale, sub, wallLen } from "@/lib/geometry";
import { useState } from "react";
import { deleteSelected, duplicateSelected, duplicateSelectedTimes } from "@/lib/clipboard";
import { useEditor } from "@/lib/store";
import { OPENING_DEFAULTS } from "@/lib/types";
import { itemDef } from "@/lib/catalog";
import { groupAsHouse, setActiveFloor, visibleScene } from "@/lib/houses";
import { wallHeight } from "@/lib/scale";
import { ROOM_COLORS, polygonArea } from "@/lib/rooms";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[12px] text-[var(--text-2)]">{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  min = 1,
  max = 10000,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="w-20 rounded-lg border border-white/8 bg-white/6 px-2 py-1 text-right text-[12px] tabular-nums text-[var(--text)] outline-none transition-colors focus:border-[var(--tint)]"
      />
      {suffix && <span className="text-[11px] text-[var(--text-3)]">{suffix}</span>}
    </span>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`press rounded-lg border px-2 py-1 text-[12px] ${
        value
          ? "border-[var(--tint)]/50 bg-[var(--tint-soft)] text-[#79b8ff]"
          : "border-white/10 text-[var(--text-2)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}

function LockIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d={open ? "M7 11V7a5 5 0 0 1 9.9-1" : "M7 11V7a5 5 0 0 1 10 0v4"} />
    </svg>
  );
}

function LockRow({ locked, onChange }: { locked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label="Lock">
      <Toggle
        value={locked}
        onChange={onChange}
        label={
          <span className="inline-flex items-center gap-1.5">
            <LockIcon open={!locked} />
            {locked ? "Locked" : "Unlocked"}
          </span>
        }
      />
    </Row>
  );
}

export default function PropertiesPanel() {
  const selectionArr = useEditor((s) => s.selection);
  const scene = useEditor((s) => s.scene);
  const checkpoint = useEditor((s) => s.checkpoint);
  const mutate = useEditor((s) => s.mutate);

  const edit = (fn: Parameters<typeof mutate>[0]) => {
    checkpoint();
    mutate(fn);
  };

  // per-type editing cards only make sense for a single selection
  const selection = selectionArr.length === 1 ? selectionArr[0] : null;

  let body: React.ReactNode = null;
  let title = "Nothing selected";

  if (selectionArr.length > 1) {
    return <MultiCard count={selectionArr.length} />;
  }

  if (selection?.kind === "wall") {
    const w = scene.walls.find((x) => x.id === selection.id);
    if (w) {
      title = "Wall";
      const l = wallLen(w);
      body = (
        <>
          <Row label="Length">
            <NumInput
              value={l}
              min={10}
              suffix="cm"
              onChange={(nl) => {
                // extend from endpoint a along the current direction; curved walls
                // scale chord + bulge together so the arc keeps its shape
                const k = nl / Math.max(1, l);
                edit((s) => ({
                  ...s,
                  walls: s.walls.map((x) => {
                    if (x.id !== w.id) return x;
                    if (!x.bulge) return { ...x, b: add(x.a, scale(norm(sub(x.b, x.a)), nl)) };
                    const chord = dist(x.a, x.b) * k;
                    return { ...x, b: add(x.a, scale(norm(sub(x.b, x.a)), chord)), bulge: x.bulge * k };
                  }),
                }));
              }}
            />
          </Row>
          <Row label="Curve">
            <span className="flex items-center gap-1.5">
              <button
                onClick={() =>
                  edit((s) => ({
                    ...s,
                    walls: s.walls.map((x) => {
                      if (x.id !== w.id) return x;
                      if (x.bulge) {
                        const nw = { ...x };
                        delete nw.bulge;
                        return nw;
                      }
                      return { ...x, bulge: Math.round(dist(x.a, x.b) * 0.25) };
                    }),
                  }))
                }
                disabled={!!w.locked}
                className="press rounded-md bg-white/8 px-2 py-0.5 text-[11px] text-[var(--text-2)] hover:bg-white/14 hover:text-[var(--text)] disabled:opacity-40"
                title={w.bulge ? "Make this wall straight again" : "Bend into an arc (or drag the ◆ handle on the canvas)"}
              >
                {w.bulge ? "Straighten" : "Bend"}
              </button>
              {!!w.bulge && (
                <NumInput
                  value={w.bulge}
                  min={-Math.round(dist(w.a, w.b) / 2)}
                  max={Math.round(dist(w.a, w.b) / 2)}
                  suffix="cm"
                  onChange={(b) =>
                    edit((s) => ({
                      ...s,
                      walls: s.walls.map((x) => (x.id === w.id ? { ...x, bulge: b || undefined } : x)),
                    }))
                  }
                />
              )}
            </span>
          </Row>
          <Row label="Thickness">
            <NumInput
              value={w.thickness}
              min={5}
              max={80}
              suffix="cm"
              onChange={(t) =>
                edit((s) => ({
                  ...s,
                  walls: s.walls.map((x) => (x.id === w.id ? { ...x, thickness: t } : x)),
                }))
              }
            />
          </Row>
          <Row label="Height">
            <NumInput
              value={wallHeight(scene, w)}
              min={30}
              max={600}
              suffix="cm"
              onChange={(hv) =>
                edit((s) => ({
                  ...s,
                  walls: s.walls.map((x) => (x.id === w.id ? { ...x, height: hv } : x)),
                }))
              }
            />
          </Row>
          <Row label="Color">
            <span className="flex items-center gap-1.5">
              <button
                onClick={() =>
                  edit((s) => ({
                    ...s,
                    walls: s.walls.map((x) => (x.id === w.id ? { ...x, color: undefined } : x)),
                  }))
                }
                title="Default"
                className={`press rounded-full border border-white/30 ${!w.color ? "ring-2 ring-white/70" : ""}`}
                style={{ backgroundColor: "#d6d3d1", width: 15, height: 15 }}
              />
              {ROOM_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    edit((s) => ({
                      ...s,
                      walls: s.walls.map((x) => (x.id === w.id ? { ...x, color: c } : x)),
                    }))
                  }
                  className={`press rounded-full ${w.color === c ? "ring-2 ring-white/70" : ""}`}
                  style={{ backgroundColor: c, width: 15, height: 15 }}
                />
              ))}
            </span>
          </Row>
          <LockRow
            locked={!!w.locked}
            onChange={(locked) =>
              edit((s) => ({
                ...s,
                walls: s.walls.map((x) => (x.id === w.id ? { ...x, locked } : x)),
              }))
            }
          />
          <p className="pt-2 text-[11px] leading-relaxed text-[var(--text-3)]">
            Drag the round endpoint handles to extend or reshape; connected corners move together.
            Drag the ◆ midpoint handle to curve the wall.
          </p>
        </>
      );
    }
  } else if (selection?.kind === "room") {
    const r = scene.rooms.find((x) => x.id === selection.id);
    if (r) {
      title = "Room";
      const area = polygonArea(r.poly) / 10000;
      body = (
        <>
          <Row label="Name">
            <input
              value={r.name}
              onChange={(e) =>
                edit((s) => ({
                  ...s,
                  rooms: s.rooms.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)),
                }))
              }
              className="w-32 rounded-lg border border-white/8 bg-white/6 px-2 py-1 text-[12px] text-[var(--text)] outline-none transition-colors focus:border-[var(--tint)]"
            />
          </Row>
          <Row label="Area">
            <span className="text-[12px] tabular-nums text-[var(--text)]">{area.toFixed(2)} m²</span>
          </Row>
          <Row label="Color">
            <span className="flex gap-1.5">
              {ROOM_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    edit((s) => ({
                      ...s,
                      rooms: s.rooms.map((x) => (x.id === r.id ? { ...x, color: c } : x)),
                    }))
                  }
                  className={`press h-4.5 w-4.5 rounded-full ${r.color === c ? "ring-2 ring-white/70 ring-offset-1 ring-offset-transparent" : ""}`}
                  style={{ backgroundColor: c, width: 17, height: 17 }}
                />
              ))}
            </span>
          </Row>
          <LockRow
            locked={!!r.locked}
            onChange={(locked) =>
              edit((s) => ({
                ...s,
                rooms: s.rooms.map((x) => (x.id === r.id ? { ...x, locked } : x)),
              }))
            }
          />
          <p className="pt-2 text-[11px] leading-relaxed text-[var(--text-3)]">
            Drag to move the label region · Delete removes the room tag only, not the walls.
          </p>
        </>
      );
    }
  } else if (selection?.kind === "opening") {
    const o = scene.openings.find((x) => x.id === selection.id);
    if (o) {
      title = OPENING_DEFAULTS[o.kind].label;
      // kinds with a meaningful side (flip) or hinge (swing) toggle
      const flippable = o.kind !== "window" && o.kind !== "doorway" && o.kind !== "window-sliding" && o.kind !== "door-sliding" && o.kind !== "door-pocket";
      const hinged = o.kind === "door-single" || o.kind === "window-casement" || o.kind === "door-pocket";
      const isDoor = flippable || hinged;
      body = (
        <>
          <Row label="Width">
            <NumInput
              value={o.width}
              min={30}
              max={400}
              suffix="cm"
              onChange={(width) =>
                edit((s) => ({
                  ...s,
                  openings: s.openings.map((x) => (x.id === o.id ? { ...x, width } : x)),
                }))
              }
            />
          </Row>
          {isDoor && (
            <Row label="Swing">
              <span className="flex gap-1">
                {flippable && (
                  <Toggle
                    value={o.flip}
                    label="Side (F)"
                    onChange={(flip) =>
                      edit((s) => ({
                        ...s,
                        openings: s.openings.map((x) => (x.id === o.id ? { ...x, flip } : x)),
                      }))
                    }
                  />
                )}
                {hinged && (
                  <Toggle
                    value={o.swing}
                    label="Hinge"
                    onChange={(swing) =>
                      edit((s) => ({
                        ...s,
                        openings: s.openings.map((x) => (x.id === o.id ? { ...x, swing } : x)),
                      }))
                    }
                  />
                )}
              </span>
            </Row>
          )}
          <p className="pt-2 text-[11px] leading-relaxed text-[var(--text-3)]">
            Drag along its wall to reposition.
          </p>
        </>
      );
    }
  } else if (selection?.kind === "stairs") {
    const st = scene.stairs.find((x) => x.id === selection.id);
    if (st) {
      title = st.kind === "spiral" ? "Spiral stairs" : "Stairs";
      body = (
        <>
          <Row label={st.kind === "spiral" ? "Diameter" : "Width"}>
            <NumInput
              value={st.width}
              min={60}
              max={500}
              suffix="cm"
              onChange={(width) =>
                edit((s) => ({
                  ...s,
                  stairs: s.stairs.map((x) => (x.id === st.id ? { ...x, width } : x)),
                }))
              }
            />
          </Row>
          {st.kind === "straight" && (
            <Row label="Length">
              <NumInput
                value={st.length}
                min={100}
                max={800}
                suffix="cm"
                onChange={(length) =>
                  edit((s) => ({
                    ...s,
                    stairs: s.stairs.map((x) => (x.id === st.id ? { ...x, length } : x)),
                  }))
                }
              />
            </Row>
          )}
          <Row label="Steps">
            <NumInput
              value={st.steps}
              min={3}
              max={40}
              onChange={(steps) =>
                edit((s) => ({
                  ...s,
                  stairs: s.stairs.map((x) => (x.id === st.id ? { ...x, steps: Math.round(steps) } : x)),
                }))
              }
            />
          </Row>
          <Row label="Rotation">
            <NumInput
              value={(st.rot * 180) / Math.PI}
              min={-360}
              max={360}
              step={15}
              suffix="°"
              onChange={(deg) =>
                edit((s) => ({
                  ...s,
                  stairs: s.stairs.map((x) =>
                    x.id === st.id ? { ...x, rot: (deg * Math.PI) / 180 } : x
                  ),
                }))
              }
            />
          </Row>
          <Row label="Quick rotate">
            <span className="flex gap-1">
              {[-90, -45, 45, 90].map((deg) => (
                <button
                  key={deg}
                  onClick={() =>
                    edit((s) => ({
                      ...s,
                      stairs: s.stairs.map((x) =>
                        x.id === st.id ? { ...x, rot: x.rot + (deg * Math.PI) / 180 } : x
                      ),
                    }))
                  }
                  className="rounded-md border border-white/10 bg-white/4 px-1.5 py-0.5 press text-[11px] text-[var(--text-2)] hover:text-[var(--text)]"
                >
                  {deg > 0 ? `↻${deg}` : `↺${-deg}`}
                </button>
              ))}
            </span>
          </Row>
          {st.houseId &&
            (() => {
              const house = scene.houses.find((h) => h.id === st.houseId);
              if (!house) return null;
              const others = house.floors.filter((f) => f.id !== st.floorId);
              if (!others.length) return null;
              const target = house.floors.find((f) => f.id === st.linkTo);
              return (
                <>
                  <Row label="Leads to">
                    <select
                      value={st.linkTo ?? ""}
                      onChange={(e) =>
                        edit((s) => ({
                          ...s,
                          stairs: s.stairs.map((x) =>
                            x.id === st.id ? { ...x, linkTo: e.target.value || undefined } : x
                          ),
                        }))
                      }
                      className="rounded-lg border border-white/8 bg-white/6 px-2 py-1 text-[12px] text-[var(--text)] outline-none transition-colors focus:border-[var(--tint)]"
                    >
                      <option value="">None</option>
                      {others.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </Row>
                  {target && (
                    <button
                      onClick={() => {
                        const est = useEditor.getState();
                        est.select([]);
                        est.mutate((s) => setActiveFloor(s, house.id, target.id));
                      }}
                      className="press mb-1 w-full rounded-lg border border-white/10 px-2 py-1.5 text-[12px] text-[var(--text-2)] hover:text-[var(--text)]"
                    >
                      Go to {target.name} \u2191
                    </button>
                  )}
                </>
              );
            })()}
          <LockRow
            locked={!!st.locked}
            onChange={(locked) =>
              edit((s) => ({
                ...s,
                stairs: s.stairs.map((x) => (x.id === st.id ? { ...x, locked } : x)),
              }))
            }
          />
          <p className="pt-2 text-[11px] leading-relaxed text-[var(--text-3)]">
            Drag the round handle above the stairs to rotate freely · press{" "}
            <kbd className="rounded-md border border-white/10 bg-white/4 px-1">R</kbd> to rotate 15°.
          </p>
        </>
      );
    }
  } else if (selection?.kind === "item") {
    const it = scene.items.find((x) => x.id === selection.id);
    if (it) {
      title = itemDef(it.kind).label;
      body = (
        <>
          <Row label="Width">
            <NumInput
              value={it.w}
              min={10}
              max={600}
              suffix="cm"
              onChange={(w) =>
                edit((s) => ({ ...s, items: s.items.map((x) => (x.id === it.id ? { ...x, w } : x)) }))
              }
            />
          </Row>
          <Row label="Depth">
            <NumInput
              value={it.h}
              min={10}
              max={600}
              suffix="cm"
              onChange={(h) =>
                edit((s) => ({ ...s, items: s.items.map((x) => (x.id === it.id ? { ...x, h } : x)) }))
              }
            />
          </Row>
          <Row label="Rotation">
            <NumInput
              value={(it.rot * 180) / Math.PI}
              min={-360}
              max={360}
              step={15}
              suffix="°"
              onChange={(deg) =>
                edit((s) => ({
                  ...s,
                  items: s.items.map((x) => (x.id === it.id ? { ...x, rot: (deg * Math.PI) / 180 } : x)),
                }))
              }
            />
          </Row>
          <Row label="Quick rotate">
            <span className="flex gap-1">
              {[-90, -45, 45, 90].map((deg) => (
                <button
                  key={deg}
                  onClick={() =>
                    edit((s) => ({
                      ...s,
                      items: s.items.map((x) =>
                        x.id === it.id ? { ...x, rot: x.rot + (deg * Math.PI) / 180 } : x
                      ),
                    }))
                  }
                  className="rounded-md border border-white/10 bg-white/4 px-1.5 py-0.5 press text-[11px] text-[var(--text-2)] hover:text-[var(--text)]"
                >
                  {deg > 0 ? `↻${deg}` : `↺${-deg}`}
                </button>
              ))}
            </span>
          </Row>
          <Row label="Swap W/D">
            <button
              onClick={() =>
                edit((s) => ({
                  ...s,
                  items: s.items.map((x) => (x.id === it.id ? { ...x, w: x.h, h: x.w } : x)),
                }))
              }
              className="press rounded-lg border border-white/10 px-2 py-1 text-[12px] text-[var(--text-2)] hover:text-[var(--text)]"
            >
              ⇄ Swap
            </button>
          </Row>
          <LockRow
            locked={!!it.locked}
            onChange={(locked) =>
              edit((s) => ({
                ...s,
                items: s.items.map((x) => (x.id === it.id ? { ...x, locked } : x)),
              }))
            }
          />
          <p className="pt-2 text-[11px] leading-relaxed text-[var(--text-3)]">
            Drag the round handle above the item to rotate freely ·{" "}
            <kbd className="rounded-md border border-white/10 bg-white/4 px-1">R</kbd> rotate ·{" "}
            <kbd className="rounded-md border border-white/10 bg-white/4 px-1">⌘D</kbd> duplicate
          </p>
        </>
      );
    }
  } else if (selection?.kind === "note") {
    const n = scene.notes.find((x) => x.id === selection.id);
    if (n) {
      title = "Note";
      body = (
        <>
          <Row label="Text">
            <input
              value={n.text}
              onChange={(e) =>
                edit((s) => ({
                  ...s,
                  notes: s.notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)),
                }))
              }
              className="w-36 rounded-lg border border-white/8 bg-white/6 px-2 py-1 text-[12px] text-[var(--text)] outline-none transition-colors focus:border-[var(--tint)]"
            />
          </Row>
          <Row label="Size">
            <NumInput
              value={n.size}
              min={12}
              max={60}
              suffix="cm"
              onChange={(size) =>
                edit((s) => ({
                  ...s,
                  notes: s.notes.map((x) => (x.id === n.id ? { ...x, size } : x)),
                }))
              }
            />
          </Row>
          <LockRow
            locked={!!n.locked}
            onChange={(locked) =>
              edit((s) => ({
                ...s,
                notes: s.notes.map((x) => (x.id === n.id ? { ...x, locked } : x)),
              }))
            }
          />
          <button
            onClick={() => deleteSelected()}
            className="press mt-1 w-full rounded-lg border border-white/10 px-2 py-1.5 text-[12px] text-[var(--danger)] hover:bg-white/6"
          >
            Delete note
          </button>
        </>
      );
    }
  }

  if (!body) return <SceneChip />;

  return (
    <aside
      key={`${selection?.kind}:${selection && "id" in selection ? selection.id : ""}`}
      data-props
      className="glass materialize absolute right-3 top-[70px] z-10 w-[264px] rounded-2xl px-4 py-3.5"
    >
      <div className="pb-1.5 text-[13px] font-semibold tracking-[-0.005em] text-[var(--text)]">
        {title}
      </div>
      {body}
    </aside>
  );
}

function MultiCard({ count }: { count: number }) {
  const [dupCount, setDupCount] = useState(3);
  const setLockedAll = (locked: boolean) => {
    const st = useEditor.getState();
    const ids = (kind: string) =>
      new Set(st.selection.filter((s) => s.kind === kind).map((s) => s.id));
    const w = ids("wall"), i = ids("item"), t = ids("stairs"), r = ids("room"), n = ids("note");
    st.checkpoint();
    st.mutate((s) => ({
      ...s,
      walls: s.walls.map((x) => (w.has(x.id) ? { ...x, locked } : x)),
      items: s.items.map((x) => (i.has(x.id) ? { ...x, locked } : x)),
      stairs: s.stairs.map((x) => (t.has(x.id) ? { ...x, locked } : x)),
      rooms: s.rooms.map((x) => (r.has(x.id) ? { ...x, locked } : x)),
      notes: s.notes.map((x) => (n.has(x.id) ? { ...x, locked } : x)),
    }));
  };
  const groupSelection = () => {
    const st = useEditor.getState();
    st.checkpoint();
    const { scene, houseId } = groupAsHouse(
      st.scene,
      st.selection,
      `House ${st.scene.houses.length + 1}`
    );
    st.mutate(() => scene);
    st.setActiveHouse(houseId);
  };
  return (
    <aside
      key={`multi:${count}`}
      className="glass materialize absolute right-3 top-[70px] z-10 w-[264px] rounded-2xl px-4 py-3.5"
    >
      <div className="pb-2 text-[13px] font-semibold tracking-[-0.005em] text-[var(--text)]">
        {count} selected
      </div>
      <button
        onClick={groupSelection}
        className="press mb-2 w-full rounded-lg bg-[var(--tint)] px-2 py-1.5 text-[12px] font-medium text-white hover:brightness-110"
      >
        Group as house
      </button>
      <div className="flex gap-2">
        <button
          onClick={() => duplicateSelected()}
          className="press flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-[12px] text-[var(--text-2)] hover:text-[var(--text)]"
        >
          Duplicate (⌘D)
        </button>
        <button
          onClick={() => deleteSelected()}
          className="press flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-[12px] text-[var(--danger)] hover:bg-white/6"
        >
          Delete
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={50}
          value={dupCount}
          onChange={(e) => setDupCount(Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1))))}
          className="w-14 rounded-lg border border-white/8 bg-white/6 px-2 py-1 text-right text-[12px] tabular-nums text-[var(--text)] outline-none transition-colors focus:border-[var(--tint)]"
        />
        <button
          onClick={() => duplicateSelectedTimes(dupCount, 60)}
          className="press flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-[12px] text-[var(--text-2)] hover:text-[var(--text)]"
          title="Copies in a row; trailing numbers auto-increment (Pen 1 → Pen 2, Pen 3…)"
        >
          Duplicate ×{dupCount}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setLockedAll(true)}
          className="press flex-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <LockIcon /> Lock all
          </span>
        </button>
        <button
          onClick={() => setLockedAll(false)}
          className="press flex-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-[var(--text-2)] hover:text-[var(--text)]"
        >
          Unlock all
        </button>
      </div>
      <p className="pt-2 text-[11px] leading-relaxed text-[var(--text-3)]">
        ⌘C copy · ⌘V paste · drag any selected element to move the whole group.
      </p>
    </aside>
  );
}

function SceneChip() {
  const scene = useEditor((s) => s.scene);
  const totalWall = scene.walls.reduce((acc, w) => acc + wallLen(w), 0);
  // marked floor area on the floors currently shown
  const vis = visibleScene(scene);
  const area = vis.rooms.reduce((acc, r) => acc + (r.poly.length >= 3 ? polygonArea(r.poly) : 0), 0) / 10000;
  return (
    <div className="glass-chip absolute right-3 top-[70px] z-10 max-w-[300px] rounded-xl px-3.5 py-2.5 text-[11px] leading-relaxed text-[var(--text-3)]">
      <div className="flex gap-3 text-[var(--text-2)]">
        <span>{scene.walls.length} walls · {(totalWall / 100).toFixed(1)} m</span>
        <span>{scene.openings.length} openings</span>
        <span>{scene.items.length + scene.stairs.length} objects</span>
      </div>
      {vis.rooms.length > 0 && (
        <div className="text-[var(--text-2)]">
          {vis.rooms.length} {vis.rooms.length === 1 ? "room" : "rooms"} on view · {area.toFixed(1)} m² floor area
        </div>
      )}
      <div className="pt-0.5">
        V select · W wall · C curve · B room · D door · N window · S stairs · ? all shortcuts
      </div>
    </div>
  );
}
