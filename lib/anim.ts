// Canvas-side micro-animations, Apple-style: elements arrive with a tiny
// critically-damped settle instead of popping into existence, and floor
// switches cross-fade. All of it collapses to instant under reduced motion.

const births = new Map<string, number>();
let sceneFadeTs = 0;

let reduced: boolean | null = null;
function prefersReduced(): boolean {
  if (reduced === null) {
    reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return reduced;
}

/** Call when an element is created/placed so it settles in. */
export function markBirth(id: string) {
  if (!prefersReduced()) births.set(id, performance.now());
}

/** Scale+alpha for a freshly created element; {1,1} once settled. */
export function birth(id: string): { scale: number; alpha: number } {
  const ts = births.get(id);
  if (ts === undefined) return { scale: 1, alpha: 1 };
  const t = (performance.now() - ts) / 280; // response ≈ 0.28s
  if (t >= 1) {
    births.delete(id);
    return { scale: 1, alpha: 1 };
  }
  const p = 1 - Math.pow(1 - t, 3); // ease-out cubic ≈ critically damped settle
  return { scale: 0.92 + 0.08 * p, alpha: Math.min(1, t * 2.5) };
}

/** Call when the visible floor changes. */
export function markSceneFade() {
  if (!prefersReduced()) sceneFadeTs = performance.now();
}

/** Global content alpha during a floor cross-fade. */
export function sceneFadeAlpha(): number {
  if (!sceneFadeTs) return 1;
  const t = (performance.now() - sceneFadeTs) / 200;
  if (t >= 1) {
    sceneFadeTs = 0;
    return 1;
  }
  return 0.35 + 0.65 * (1 - Math.pow(1 - t, 2));
}
