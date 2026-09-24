"use client";

import { useEffect, useState } from "react";
import { useEditor } from "@/lib/store";

/** Transient status line (imports, errors). Floats just under the top bar. */
export default function Toast() {
  const flash = useEditor((s) => s.flash);
  if (!flash) return null;
  // keyed remount: every new message starts visible and runs its own timer
  return <ToastLine key={flash.at} text={flash.text} tone={flash.tone} />;
}

function ToastLine({ text, tone }: { text: string; tone: "ok" | "error" }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), tone === "error" ? 4200 : 3200);
    return () => clearTimeout(t);
  }, [tone]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`glass pointer-events-none absolute left-1/2 top-[68px] z-30 -translate-x-1/2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-300 ${
        visible ? "opacity-100" : "-translate-y-1 opacity-0"
      } ${tone === "error" ? "text-[var(--danger)]" : "text-[var(--text)]"}`}
    >
      {text}
    </div>
  );
}
