"use client";

import { useRef } from "react";
import {
  addFloor,
  deleteFloor,
  floorSelection,
  renameFloor,
  renameHouse,
  setActiveFloor,
  ungroupHouse,
} from "@/lib/houses";
import { polygonArea } from "@/lib/rooms";
import { useEditor } from "@/lib/store";
import { markSceneFade } from "@/lib/anim";

export default function HousePanel() {
  const houses = useEditor((s) => s.scene.houses);
  const rooms = useEditor((s) => s.scene.rooms);
  const activeHouseId = useEditor((s) => s.activeHouseId);
  const house = houses.find((h) => h.id === activeHouseId) ?? null;
  const nameRef = useRef<HTMLInputElement>(null);

  if (!houses.length) return null;

  const st = () => useEditor.getState();

  const commitName = () => {
    const value = nameRef.current?.value.trim();
    if (!house || !value || value === house.name) return;
    st().checkpoint();
    st().mutate((s) => renameHouse(s, house.id, value));
  };

  const switchFloor = (floorId: string) => {
    if (!house) return;
    st().select([]); // never keep hidden elements selected
    markSceneFade();
    st().mutate((s) => setActiveFloor(s, house.id, floorId)); // navigation, not an undo step
  };

  const floorRooms = house
    ? rooms.filter((r) => r.houseId === house.id && r.floorId === house.activeFloorId)
    : [];

  return (
    <div className="glass enter-bottom absolute bottom-3 left-1/2 z-10 flex max-w-[92vw] -translate-x-1/2 flex-col gap-1 rounded-2xl px-2 py-1.5">
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
      {/* house switcher: chips, plus a Canvas escape hatch */}
      {houses.map((h) => (
        <button
          key={h.id}
          onClick={() => st().setActiveHouse(h.id)}
          className={`press whitespace-nowrap rounded-lg px-2 py-1 text-[12px] font-medium ${
            h.id === activeHouseId
              ? "bg-[var(--tint-soft)] text-[#79b8ff]"
              : "text-[var(--text-2)] hover:bg-white/6"
          }`}
        >
          {h.name}
        </button>
      ))}
      <button
        onClick={() => st().setActiveHouse(null)}
        title="Draw outside any house"
        className={`press whitespace-nowrap rounded-lg px-2 py-1 text-[12px] ${
          activeHouseId === null
            ? "bg-white/10 text-[var(--text)]"
            : "text-[var(--text-3)] hover:bg-white/6"
        }`}
      >
        Canvas
      </button>

      {house && (
        <>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <input
            ref={nameRef}
            key={`${house.id}:${house.name}`}
            defaultValue={house.name}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              e.stopPropagation(); // don't trigger canvas shortcuts while typing
            }}
            title="House name"
            className="w-28 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] font-semibold tracking-[-0.005em] text-[var(--text)] outline-none transition-colors hover:border-white/10 focus:border-[var(--tint)]"
          />
          <div className="mx-1 h-5 w-px bg-white/10" />
          {/* floor tabs — double-click to rename */}
          {house.floors.map((f) => (
            <button
              key={f.id}
              onClick={() => switchFloor(f.id)}
              onDoubleClick={() => {
                const n = prompt("Floor name", f.name);
                if (n?.trim()) {
                  st().checkpoint();
                  st().mutate((s) => renameFloor(s, house.id, f.id, n.trim()));
                }
              }}
              title={`${f.name} — double-click to rename`}
              className={`press whitespace-nowrap rounded-lg px-2 py-1 text-[12px] ${
                f.id === house.activeFloorId
                  ? "bg-[var(--tint)] font-medium text-white"
                  : "text-[var(--text-2)] hover:bg-white/6"
              }`}
            >
              {f.name}
            </button>
          ))}
          <button
            onClick={() => {
              st().select([]);
              st().checkpoint();
              st().mutate((s) => addFloor(s, house.id));
            }}
            title="Add a floor above (clones this floor's walls)"
            className="press rounded-lg px-2 py-1 text-[13px] font-medium text-[var(--tint)] hover:bg-white/6"
          >
            +
          </button>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <button
            onClick={() => st().select(floorSelection(st().scene, house.id, house.activeFloorId))}
            title="Select everything on this floor"
            className="press whitespace-nowrap rounded-lg px-2 py-1 text-[12px] text-[var(--text-2)] hover:bg-white/6 hover:text-[var(--text)]"
          >
            Select
          </button>
          {house.floors.length > 1 && (
            <button
              onClick={() => {
                const f = house.floors.find((x) => x.id === house.activeFloorId)!;
                if (confirm(`Delete "${f.name}" and everything on it? (You can undo.)`)) {
                  st().select([]);
                  st().checkpoint();
                  st().mutate((s) => deleteFloor(s, house.id, f.id));
                }
              }}
              title="Delete this floor"
              className="press whitespace-nowrap rounded-lg px-2 py-1 text-[12px] text-[var(--danger)] hover:bg-white/6"
            >
              Delete floor
            </button>
          )}
          <button
            onClick={() => {
              const multi = house.floors.length > 1;
              if (
                !multi ||
                confirm(
                  `"${house.name}" has ${house.floors.length} floors — ungrouping drops them all onto the canvas, stacked. Continue? (You can undo.)`
                )
              ) {
                st().select([]);
                st().checkpoint();
                st().mutate((s) => ungroupHouse(s, house.id));
                st().setActiveHouse(null);
              }
            }}
            title="Dissolve the house (elements stay)"
            className="press whitespace-nowrap rounded-lg px-2 py-1 text-[12px] text-[var(--text-3)] hover:bg-white/6 hover:text-[var(--text)]"
          >
            Ungroup
          </button>
        </>
      )}
      </div>
      {floorRooms.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap border-t border-white/8 pt-1">
          {floorRooms.map((r) => (
            <span
              key={r.id}
              className="press flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-[var(--text-2)] hover:bg-white/6 hover:text-[var(--text)]"
              onClick={() => st().select([{ kind: "room", id: r.id }])}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              {r.name}
              <span className="text-[var(--text-3)]">
                {(polygonArea(r.poly) / 10000).toFixed(1)} m²
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  st().select([]);
                  st().checkpoint();
                  st().mutate((s) => ({ ...s, rooms: s.rooms.filter((x) => x.id !== r.id) }));
                }}
                title="Remove room (undoable)"
                className="ml-0.5 rounded px-0.5 text-[var(--text-3)] hover:text-[var(--danger)]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
