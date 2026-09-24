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
  /** show a length label on every visible wall */
  dimsOn: boolean;
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
  /** Replace the whole scene as one undoable step (import / sample). */
  importScene: (s: Scene) => void;
  /** Transient status message shown as a toast. */
  flash: { text: string; tone: "ok" | "error"; at: number } | null;
  showFlash: (text: string, tone?: "ok" | "error") => void;
  clearScene: () => void;
  toggleGrid: () => void;
  toggleDims: () => void;
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
  dimsOn: false,
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

  importScene: (s) => {
    set((st) => ({
      past: [...st.past.slice(-MAX_HISTORY + 1), clone(st.scene)],
      future: [],
      scene: s,
      selection: [],
      activeHouseId: s.houses.some((h) => h.id === st.activeHouseId) ? st.activeHouseId : null,
    }));
    scheduleSave(s);
  },

  flash: null,
  showFlash: (text, tone = "ok") => set({ flash: { text, tone, at: Date.now() } }),

  clearScene: () => {
    get().checkpoint();
    set({ scene: emptyScene(), selection: [] });
    scheduleSave(get().scene);
  },

  toggleGrid: () => set((st) => ({ gridOn: !st.gridOn })),
  toggleDims: () => set((st) => ({ dimsOn: !st.dimsOn })),
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

/** Coerce parsed JSON into a Scene (fills in collections added in later versions). */
export function normalizeScene(s: unknown): Scene | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Partial<Scene>;
  if (!Array.isArray(o.walls)) return null;
  const arr = <T,>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : []);
  return {
    walls: o.walls,
    openings: arr(o.openings),
    stairs: arr(o.stairs),
    items: arr(o.items),
    houses: arr(o.houses),
    rooms: arr(o.rooms),
    notes: arr(o.notes),
  };
}

export function loadSavedScene(): Scene | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeScene(JSON.parse(raw));
  } catch {
    // corrupt save — start fresh
  }
  return null;
}
