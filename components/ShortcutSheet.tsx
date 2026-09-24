"use client";

import { useEffect, useState } from "react";

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Tools",
    rows: [
      ["V", "Select"],
      ["W", "Wall (type a length, Enter)"],
      ["C", "Curved wall"],
      ["B", "Room walls"],
      ["M", "Mark room"],
      ["D", "Door"],
      ["N", "Window"],
      ["S", "Stairs"],
      ["T", "Note"],
      ["H / Space", "Hand (pan)"],
    ],
  },
  {
    title: "Edit",
    rows: [
      ["R / ⇧R", "Rotate selection"],
      ["F", "Flip door swing"],
      ["⌫", "Delete"],
      ["⌘C ⌘X ⌘V", "Copy, cut, paste"],
      ["⌘D", "Duplicate"],
      ["⌘A", "Select all"],
      ["⌘Z / ⌘⇧Z", "Undo / redo"],
      ["Esc", "Finish drawing / deselect"],
    ],
  },
  {
    title: "View & file",
    rows: [
      ["G", "Grid"],
      ["L", "Dimensions on every wall"],
      ["⌘S", "Save plan (.json)"],
      ["⌘O", "Import plan"],
      ["?", "This sheet"],
    ],
  },
];

/** Keyboard reference, toggled with "?". */
export default function ShortcutSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "?") setOpen((o) => !o);
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div
        className="glass materialize max-h-[80vh] w-[min(640px,92vw)] overflow-auto rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Keyboard shortcuts</h2>
          <span className="text-[11px] text-[var(--text-3)]">Esc to close</span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">{g.title}</h3>
              <ul className="flex flex-col gap-1">
                {g.rows.map(([k, label]) => (
                  <li key={k} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-[var(--text-2)]">{label}</span>
                    <kbd className="shrink-0 rounded-md bg-white/8 px-1.5 py-0.5 font-sans text-[11px] text-[var(--text)]">
                      {k}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
