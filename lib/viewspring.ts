// Critically damped spring for pan/zoom view transitions.
// Interruptible: a new target retargets mid-flight and velocity carries through;
// any direct manipulation (wheel, pan drag) calls cancelViewSpring() and takes over
// from the current presentation value — never a jump.
import { useEditor } from "./store";
import { Vec } from "./types";

let raf = 0;
let last = 0;
let vx = 0;
let vy = 0;
let vz = 0;
let target: { pan: Vec; zoom: number } | null = null;

export function cancelViewSpring() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  target = null;
  vx = vy = vz = 0;
}

export function springViewTo(pan: Vec, zoom: number, response = 0.35) {
  target = { pan: { ...pan }, zoom };
  const omega = (2 * Math.PI) / response; // ζ = 1 (no overshoot: this is chrome, not a flick)
  if (raf) return; // already animating — retarget only, velocity carries

  last = performance.now();
  const step = (now: number) => {
    raf = 0;
    if (!target) return;
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;

    const st = useEditor.getState();
    let { x, y } = st.pan;
    let z = st.zoom;

    // semi-implicit Euler, critically damped: x'' = -2ω x' − ω² (x − target)
    vx += (-2 * omega * vx - omega * omega * (x - target.pan.x)) * dt;
    vy += (-2 * omega * vy - omega * omega * (y - target.pan.y)) * dt;
    vz += (-2 * omega * vz - omega * omega * (z - target.zoom)) * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;

    const settled =
      Math.abs(x - target.pan.x) < 0.5 &&
      Math.abs(y - target.pan.y) < 0.5 &&
      Math.abs(z - target.zoom) < 0.001 &&
      Math.abs(vx) < 1 &&
      Math.abs(vy) < 1 &&
      Math.abs(vz) < 0.01;

    if (settled) {
      st.setView(target.pan, target.zoom);
      cancelViewSpring();
      return;
    }
    st.setView({ x, y }, z);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Reduced motion: jump straight to the target (still instant feedback, no travel). */
export function goToView(pan: Vec, zoom: number) {
  if (prefersReducedMotion()) {
    cancelViewSpring();
    useEditor.getState().setView(pan, zoom);
  } else {
    springViewTo(pan, zoom);
  }
}
