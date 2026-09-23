import { create } from "zustand";
import { Scene, Selection, Tool, Vec, emptyScene } from "./types";

const MAX_HISTORY = 100;
const STORAGE_KEY = "roughhouse-scene-v1";

interface EditorState {
  scene: Scene;
  past: Scene[];
  future: Scene[];
  tool: Tool;
  selection: Selection[];
  gridOn: boolean;
  pan: Vec;
  zoom: number; // screen px per cm
  /** House that owns newly drawn elements (null = plain canvas). */
  activeHouseId: string | null;

  setTool: (t: Tool) => void;
  select: (s: Selection[]) => void;
  /** Push an undo snapshot. Call once before a discrete change or at drag start. */
  checkpoint: () => void;
  mutate: (fn: (s: Scene) => Scene) => void;
  undo: () => void;
  redo: () => void;
  loadScene: (s: Scene) => void;
  clearScene: () => void;
  toggleGrid: () => void;
  setActiveHouse: (id: string | null) => void;
  setView: (pan: Vec, zoom: number) => void;
}

const clone = (s: Scene): Scene => JSON.parse(JSON.stringify(s));

export const useEditor = create<EditorState>((set, get) => ({
  scene: emptyScene(),
  past: [],
  future: [],
  tool: "select",
  selection: [],
  gridOn: true,
  pan: { x: 0, y: 0 },
  zoom: 0.75,
  activeHouseId: null,

  setTool: (tool) => set({ tool, selection: [] }),
  select: (selection) => set({ selection }),

  checkpoint: () =>
    set((st) => ({
      past: [...st.past.slice(-MAX_HISTORY + 1), clone(st.scene)],
      future: [],
    })),

  mutate: (fn) => {
    set((st) => ({ scene: fn(st.scene) }));
    scheduleSave(get().scene);
  },

  undo: () =>
    set((st) => {
      if (!st.past.length) return st;
      const prev = st.past[st.past.length - 1];
      scheduleSave(prev);
      return {
        scene: prev,
        past: st.past.slice(0, -1),
        future: [clone(st.scene), ...st.future].slice(0, MAX_HISTORY),
        selection: [],
      };
    }),

  redo: () =>
    set((st) => {
      if (!st.future.length) return st;
      const next = st.future[0];
      scheduleSave(next);
      return {
        scene: next,
        future: st.future.slice(1),
        past: [...st.past, clone(st.scene)].slice(-MAX_HISTORY),
        selection: [],
      };
    }),

  loadScene: (s) => {
    set({ scene: s, past: [], future: [], selection: [] });
    scheduleSave(s);
  },

  clearScene: () => {
    get().checkpoint();
    set({ scene: emptyScene(), selection: [] });
    scheduleSave(get().scene);
  },

  toggleGrid: () => set((st) => ({ gridOn: !st.gridOn })),
  setActiveHouse: (activeHouseId) => set({ activeHouseId }),
  setView: (pan, zoom) => set({ pan, zoom }),
}));

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(scene: Scene) {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
    } catch {
      // storage full / unavailable — ignore
    }
  }, 400);
}

export function loadSavedScene(): Scene | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.walls)) {
      return {
        walls: s.walls ?? [],
        openings: s.openings ?? [],
        stairs: s.stairs ?? [],
        items: s.items ?? [],
        houses: s.houses ?? [],
        rooms: s.rooms ?? [],
        notes: s.notes ?? [],
      };
    }
  } catch {
    // corrupt save — start fresh
  }
  return null;
}
