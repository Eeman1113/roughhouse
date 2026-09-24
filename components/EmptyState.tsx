"use client";

import { loadSample, pickSceneFile } from "@/lib/io";
import { useEditor } from "@/lib/store";

/** Welcome card on an empty canvas: three ways to start. Disappears once anything exists. */
export default function EmptyState() {
  const empty = useEditor(
    (s) =>
      !s.scene.walls.length &&
      !s.scene.items.length &&
      !s.scene.rooms.length &&
      !s.scene.notes.length &&
      !s.scene.stairs.length
  );
  const tool = useEditor((s) => s.tool);
  if (!empty || tool !== "select") return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
      <div className="glass materialize pointer-events-auto w-[320px] rounded-2xl p-4">
        <h2 className="text-[15px] font-semibold">Start a plan</h2>
        <p className="mb-3 text-[12px] text-[var(--text-2)]">Everything is in centimetres. You can undo anything.</p>
        <div className="flex flex-col gap-1.5">
          <Action
            primary
            title="Draw walls"
            hint="Click to place corners, Esc to finish"
            kbd="W"
            onClick={() => useEditor.getState().setTool("wall")}
          />
          <Action
            title="Open the sample house"
            hint="A furnished two-floor corner house"
            onClick={() => void loadSample("corner-house", "the Corner House sample")}
          />
          <Action title="Import a saved plan" hint="Or drop a .json file anywhere" kbd="⌘O" onClick={pickSceneFile} />
        </div>
      </div>
    </div>
  );
}

function Action({
  title,
  hint,
  kbd,
  onClick,
  primary,
}: {
  title: string;
  hint: string;
  kbd?: string;
  onClick: () => void;
  primary?: boolean;
}) {
return (
  <button
    onClick={onClick}
    className={`press flex w-full items-center justify-between gap-4 rounded-xl px-3.5 py-2.5 text-left ${
      primary ? "bg-[var(--tint)] text-white hover:brightness-110" : "bg-white/6 hover:bg-white/10"
    }`}
  >
    <span>
      <span className="block text-[13px] font-medium">{title}</span>
      <span className={`block text-[11px] ${primary ? "text-white/75" : "text-[var(--text-3)]"}`}>{hint}</span>
    </span>
    {kbd && (
      <kbd
        className={`rounded-md px-1.5 py-0.5 font-sans text-[11px] ${
          primary ? "bg-white/20 text-white" : "bg-white/8 text-[var(--text-2)]"
        }`}
      >
        {kbd}
      </kbd>
    )}
  </button>
);
}
