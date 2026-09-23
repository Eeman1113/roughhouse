"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { CATALOG } from "@/lib/catalog";
import { asset } from "@/lib/paths";
import { useEditor } from "@/lib/store";
import { Tool } from "@/lib/types";

const MAIN_TOOLS: { tool: Tool; label: string; key?: string; icon: React.ReactNode }[] = [
  {
    tool: "select",
    label: "Select",
    key: "V",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 3l14 8-6.5 1.5L10 19 5 3z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tool: "wall",
    label: "Wall",
    key: "W",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 17L14 6l4 0 3 3v4L10 21l-7-4z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tool: "room",
    label: "Room walls",
    key: "B",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="5" width="16" height="14" rx="1" />
      </svg>
    ),
  },
  {
    tool: "pan",
    label: "Hand",
    key: "H",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13m-9-1v6.5A3.5 3.5 0 0 0 11.5 22h3a5.5 5.5 0 0 0 5.5-5.5V13a1.5 1.5 0 0 0-3 0m-9-1l-1.8-1.8a1.6 1.6 0 0 0-2.3 2.2L8 17" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tool: "room-label",
    label: "Mark room",
    key: "M",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="5" width="16" height="14" rx="1" strokeDasharray="3 2.5" />
        <path d="M8 13.5l2.5 2.5L16 10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tool: "note",
    label: "Note",
    key: "T",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 5h14M12 5v14" strokeLinecap="round" />
        <path d="M9 19h6" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
  },
];

const I = {
  cls: "h-4 w-4",
  sw: 1.6,
};

const DOOR_TOOLS: { tool: Tool; label: string; key?: string; icon: React.ReactNode }[] = [
  {
    tool: "door-single",
    label: "Door",
    key: "D",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <path d="M3 19h4M17 19h4M7 19V6" />
        <path d="M7 6a13 13 0 0 1 10 13" strokeDasharray="2.5 2.5" />
      </svg>
    ),
  },
  {
    tool: "door-double",
    label: "Double door",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <path d="M2 19h2M20 19h2M4 19v-9M20 19v-9" />
        <path d="M4 10a9 9 0 0 1 8 9M20 10a9 9 0 0 0-8 9" strokeDasharray="2 2.5" />
      </svg>
    ),
  },
  {
    tool: "door-sliding",
    label: "Sliding door",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <path d="M2 10.5h12M10 14h12" strokeWidth="2.2" />
        <path d="M2 6.5h20M2 18h20" opacity="0.35" />
      </svg>
    ),
  },
  {
    tool: "door-pocket",
    label: "Pocket door",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <path d="M12 12h9" strokeWidth="2.2" />
        <path d="M3 12h9" strokeDasharray="2.5 2.5" />
        <path d="M2 8h8M2 16h8" opacity="0.35" />
      </svg>
    ),
  },
  {
    tool: "door-bifold",
    label: "Bifold door",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <path d="M2 17l5-8 5 8 5-8 5 8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tool: "door-garage",
    label: "Garage door",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <rect x="3" y="5" width="18" height="4" rx="1" />
        <path d="M6 9v10M18 9v10" strokeDasharray="2.5 2.5" />
      </svg>
    ),
  },
  {
    tool: "doorway",
    label: "Doorway",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <path d="M2 12h5M17 12h5" strokeWidth="2.2" />
        <path d="M8 12h8" strokeDasharray="2 3" opacity="0.6" />
      </svg>
    ),
  },
];

const WINDOW_TOOLS: { tool: Tool; label: string; key?: string; icon: React.ReactNode }[] = [
  {
    tool: "window",
    label: "Window",
    key: "N",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <rect x="3" y="9" width="18" height="6" />
        <path d="M3 12h18" />
      </svg>
    ),
  },
  {
    tool: "window-casement",
    label: "Casement",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <path d="M3 18h4M17 18h4M7 18V8" />
        <path d="M7 8a10 10 0 0 1 10 10" strokeDasharray="2 2.5" opacity="0.7" />
        <rect x="3" y="16.5" width="18" height="3" opacity="0.35" />
      </svg>
    ),
  },
  {
    tool: "window-double-casement",
    label: "Double casement",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <path d="M3 18V9M21 18V9" />
        <path d="M3 9a9 9 0 0 1 9 9M21 9a9 9 0 0 0-9 9" strokeDasharray="2 2.5" opacity="0.7" />
      </svg>
    ),
  },
  {
    tool: "window-sliding",
    label: "Sliding window",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <rect x="2" y="8" width="12" height="3.5" />
        <rect x="10" y="12.5" width="12" height="3.5" />
      </svg>
    ),
  },
  {
    tool: "window-bay",
    label: "Bay window",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <path d="M2 17h4l4-8h4l4 8h4" strokeLinejoin="round" />
        <path d="M10.5 12.5h3" opacity="0.6" />
      </svg>
    ),
  },
];

const STAIR_TOOLS: { tool: Tool; label: string; key?: string; icon: React.ReactNode }[] = [
  {
    tool: "stairs",
    label: "Stairs",
    key: "S",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <rect x="7" y="3" width="10" height="18" />
        <path d="M7 7.5h10M7 12h10M7 16.5h10" opacity="0.7" />
      </svg>
    ),
  },
  {
    tool: "stairs-spiral",
    label: "Spiral stairs",
    icon: (
      <svg viewBox="0 0 24 24" className={I.cls} fill="none" stroke="currentColor" strokeWidth={I.sw}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 12V3M12 12l6.4 6.4M12 12H3M12 12l6.4-6.4" opacity="0.6" />
      </svg>
    ),
  },
];

function ToolRow({
  tool,
  label,
  keyHint,
  icon,
}: {
  tool: Tool;
  label: string;
  keyHint?: string;
  icon?: React.ReactNode;
}) {
  const active = useEditor((s) => s.tool === tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <button
      onClick={() => setTool(tool)}
      title={keyHint ? `${label} (${keyHint})` : label}
      className={`press flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-left text-[12px] ${
        active
          ? "bg-[var(--tint-soft)] font-medium text-[#79b8ff]"
          : "text-[var(--text-2)] hover:bg-white/6 hover:text-[var(--text)]"
      }`}
    >
      {icon && <span className="shrink-0 opacity-80">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {keyHint && (
        <kbd className="rounded-md border border-white/10 bg-white/4 px-1.5 text-[10px] text-[var(--text-3)]">
          {keyHint}
        </kbd>
      )}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-4 first:pt-2.5">
      <div className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--text-3)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function ItemButton({ id, label }: { id: string; label: string }) {
  const tool: Tool = `item:${id}`;
  const active = useEditor((s) => s.tool === tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <button
      onClick={() => setTool(tool)}
      title={label}
      className={`press flex flex-col items-center gap-1 rounded-[10px] p-1.5 ${
        active ? "bg-[var(--tint-soft)]" : "hover:bg-white/6"
      }`}
    >
      <img
        src={asset(`/sprites/${id}.png`)}
        alt=""
        loading="lazy"
        className="h-9 w-9 object-contain opacity-85"
        style={{ filter: "invert(0.88)" }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
        draggable={false}
      />
      <span
        className={`w-full truncate text-center text-[10px] leading-tight ${
          active ? "font-medium text-[#79b8ff]" : "text-[var(--text-2)]"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export default function Toolbar() {
  const [query, setQuery] = useState("");
  const [openCat, setOpenCat] = useState<string | null>("Seating");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? CATALOG.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q))
      : CATALOG;
    const map = new Map<string, typeof CATALOG>();
    for (const c of filtered) {
      if (!map.has(c.cat)) map.set(c.cat, []);
      map.get(c.cat)!.push(c);
    }
    return map;
  }, [query]);

  const searching = query.trim().length > 0;

  return (
    <aside className="glass enter-left absolute bottom-3 left-3 top-[70px] z-10 flex w-[248px] flex-col rounded-2xl">
      <div className="fade-scroll flex-1 overflow-y-auto pb-4">
        <Section title="Tools">
          {MAIN_TOOLS.map((t) => (
            <ToolRow key={t.tool} tool={t.tool} label={t.label} keyHint={t.key} icon={t.icon} />
          ))}
        </Section>
        <Section title="Doors">
          {DOOR_TOOLS.map((t) => (
            <ToolRow key={t.tool} tool={t.tool} label={t.label} keyHint={t.key} icon={t.icon} />
          ))}
        </Section>
        <Section title="Windows">
          {WINDOW_TOOLS.map((t) => (
            <ToolRow key={t.tool} tool={t.tool} label={t.label} keyHint={t.key} icon={t.icon} />
          ))}
        </Section>
        <Section title="Stairs">
          {STAIR_TOOLS.map((t) => (
            <ToolRow key={t.tool} tool={t.tool} label={t.label} keyHint={t.key} icon={t.icon} />
          ))}
        </Section>
        <Section title={`Library · ${CATALOG.length}`}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="mb-2 w-full rounded-[10px] border border-white/8 bg-white/6 px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-3)] focus:border-[var(--tint)]"
          />
          {[...grouped.entries()].map(([cat, items]) => {
            const open = searching || openCat === cat;
            return (
              <div key={cat} className="mb-0.5">
                <button
                  onClick={() => setOpenCat(open && !searching ? null : cat)}
                  className="press flex w-full items-center justify-between rounded-lg px-1.5 py-1.5 text-[12px] font-semibold text-[var(--text-2)] hover:text-[var(--text)]"
                >
                  <span>{cat}</span>
                  <span
                    className={`text-[10px] text-[var(--text-3)] transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                  >
                    ▸
                  </span>
                </button>
                {open && (
                  <div className="grid grid-cols-3 gap-0.5 pb-1">
                    {items.map((c) => (
                      <ItemButton key={c.id} id={c.id} label={c.label} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      </div>
    </aside>
  );
}
