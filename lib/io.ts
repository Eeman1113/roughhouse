// Scene file I/O: JSON save/import, sample plans, and fitting the view to a plan.
import { sceneBounds } from "./geometry";
import { normalizeScene, useEditor } from "./store";
import { Scene } from "./types";
import { goToView } from "./viewspring";
import { asset } from "./paths";

/** Animate the view so the whole plan fits on screen. */
export function fitSceneInView(scene: Scene = useEditor.getState().scene) {
  const b = sceneBounds(scene);
  if (!b || typeof window === "undefined") return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 140;
  const w = b.max.x - b.min.x || 100;
  const h = b.max.y - b.min.y || 100;
  const nz = Math.min(8, Math.max(0.05, Math.min((vw - margin * 2) / w, (vh - margin * 2) / h)));
  goToView({ x: (vw - w * nz) / 2 - b.min.x * nz, y: (vh - h * nz) / 2 - b.min.y * nz }, nz);
}

export function exportSceneJSON() {
  const scene = useEditor.getState().scene;
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.download = "roughhouse-plan.json";
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function applyImported(scene: Scene, label: string) {
  const st = useEditor.getState();
  st.importScene(scene);
  const n = scene.walls.length + scene.items.length + scene.openings.length;
  st.showFlash(`Imported ${label} · ${n} elements · ⌘Z to undo`);
  // let the canvas settle a frame before flying to the new plan
  setTimeout(() => fitSceneInView(scene), 80);
}

/** Import a roughhouse save file (JSON). Undoable. */
export async function importSceneFile(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    const scene = normalizeScene(JSON.parse(text));
    if (!scene) throw new Error("not a roughhouse plan");
    applyImported(scene, `“${file.name.replace(/\.json$/i, "")}”`);
    return true;
  } catch {
    useEditor.getState().showFlash("That file isn't a roughhouse save (.json)", "error");
    return false;
  }
}

/** Load a bundled sample plan from /public/samples. Undoable. */
export async function loadSample(name: string, label: string): Promise<void> {
  try {
    const res = await fetch(asset(`/samples/${name}.json`));
    const scene = normalizeScene(await res.json());
    if (!scene) throw new Error("bad sample");
    applyImported(scene, label);
  } catch {
    useEditor.getState().showFlash("Couldn't load the sample plan", "error");
  }
}

/** Open the OS file picker for a save file. */
export function pickSceneFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void importSceneFile(f);
  };
  input.click();
}
