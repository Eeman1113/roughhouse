import { asset } from "./paths";
import { ItemKind } from "./types";

// AI-generated top-view furniture sprites (black line art on transparent),
// tinted at runtime to match the palette.
const imgs = new Map<ItemKind, HTMLImageElement>();
const ready = new Set<ItemKind>();
const failed = new Set<ItemKind>();
const tints = new Map<string, HTMLCanvasElement>();

export function getItemSprite(kind: ItemKind, color: string): HTMLCanvasElement | null {
  if (typeof document === "undefined" || failed.has(kind)) return null;
  if (!imgs.has(kind)) {
    const el = new Image();
    el.onload = () => ready.add(kind);
    el.onerror = () => failed.add(kind);
    el.src = asset(`/sprites/${kind}.png`);
    imgs.set(kind, el);
  }
  if (!ready.has(kind)) return null;
  const key = `${kind}|${color}`;
  let c = tints.get(key);
  if (!c) {
    const img = imgs.get(kind)!;
    c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const cx = c.getContext("2d")!;
    cx.drawImage(img, 0, 0);
    cx.globalCompositeOperation = "source-in";
    cx.fillStyle = color;
    cx.fillRect(0, 0, c.width, c.height);
    tints.set(key, c);
  }
  return c;
}
