"use client";

/* eslint-disable @next/next/no-img-element */
import { sceneBounds } from "@/lib/geometry";
import { exportSceneJSON, fitSceneInView, loadSample, pickSceneFile } from "@/lib/io";
import { PRINT, drawGrid, drawHouseLabels, drawScene } from "@/lib/render";
import { useEditor } from "@/lib/store";
import { visibleScene } from "@/lib/houses";
import { asset } from "@/lib/paths";
import { goToView } from "@/lib/viewspring";

function Btn({
  onClick,
  title,
  disabled,
  tone = "default",
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  tone?: "default" | "tint" | "danger";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "tint"
      ? "bg-[var(--tint)] text-white hover:brightness-110"
      : tone === "danger"
        ? "text-[var(--danger)] hover:bg-white/8"
        : "text-[var(--text-2)] hover:bg-white/8 hover:text-[var(--text)]";
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`press rounded-lg px-2.5 py-1.5 text-[13px] font-medium disabled:cursor-default disabled:opacity-30 ${toneCls}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-white/10" />;
}

export default function TopBar() {
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const gridOn = useEditor((s) => s.gridOn);
  const zoom = useEditor((s) => s.zoom);

  const zoomBy = (f: number) => {
    const st = useEditor.getState();
    const nz = Math.min(8, Math.max(0.05, st.zoom * f));
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const wx = (cx - st.pan.x) / st.zoom;
    const wy = (cy - st.pan.y) / st.zoom;
    goToView({ x: cx - wx * nz, y: cy - wy * nz }, nz);
  };

  const fitView = () => fitSceneInView();

  const exportPNG = () => {
    const scene = visibleScene(useEditor.getState().scene);
    const b = sceneBounds(scene);
    if (!b) return;
    const margin = 180;
    const w = b.max.x - b.min.x + margin * 2;
    const h = b.max.y - b.min.y + margin * 2;
    const px = Math.min(2, 4000 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * px);
    canvas.height = Math.round(h * px);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = PRINT.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(px, px);
    ctx.translate(margin - b.min.x, margin - b.min.y);
    drawGrid(
      ctx,
      PRINT,
      { x: (margin - b.min.x) * px, y: (margin - b.min.y) * px },
      px,
      canvas.width,
      canvas.height
    );
    drawScene(ctx, scene, PRINT, px);
    drawHouseLabels(ctx, scene, PRINT, px);

    // overall dimension lines per building (and one for loose canvas walls)
    const groups: { walls: typeof scene.walls }[] = [];
    for (const house of scene.houses) {
      const hw = scene.walls.filter((w) => w.houseId === house.id);
      if (hw.length) groups.push({ walls: hw });
    }
    const loose = scene.walls.filter((w) => !w.houseId);
    if (loose.length) groups.push({ walls: loose });
    ctx.strokeStyle = PRINT.symbol;
    ctx.fillStyle = PRINT.symbol;
    ctx.lineWidth = 1.5 / px;
    ctx.font = "600 30px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    for (const g of groups) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const w2 of g.walls)
        for (const pt of [w2.a, w2.b]) {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        }
      const off = 60;
      const tick = 14;
      // horizontal dimension above
      const yD = minY - off;
      ctx.beginPath();
      ctx.moveTo(minX, yD - tick);
      ctx.lineTo(minX, yD + tick);
      ctx.moveTo(maxX, yD - tick);
      ctx.lineTo(maxX, yD + tick);
      ctx.moveTo(minX, yD);
      ctx.lineTo(maxX, yD);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${((maxX - minX) / 100).toFixed(2)} m`, (minX + maxX) / 2, yD - 8);
      // vertical dimension left
      const xD = minX - off;
      ctx.beginPath();
      ctx.moveTo(xD - tick, minY);
      ctx.lineTo(xD + tick, minY);
      ctx.moveTo(xD - tick, maxY);
      ctx.lineTo(xD + tick, maxY);
      ctx.moveTo(xD, minY);
      ctx.lineTo(xD, maxY);
      ctx.stroke();
      ctx.save();
      ctx.translate(xD - 8, (minY + maxY) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${((maxY - minY) / 100).toFixed(2)} m`, 0, 0);
      ctx.restore();
    }
    const a = document.createElement("a");
    a.download = "roughhouse-plan.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  return (
    <header className="glass enter-top absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl py-1.5 pl-2 pr-3">
      <img
        src={asset("/logo-ink.png")}
        alt="roughhouse"
        className="mx-1.5 h-8 w-auto select-none opacity-90"
        style={{ filter: "invert(1) brightness(1.4)" }}
        draggable={false}
      />
      <Divider />
      <Btn onClick={() => useEditor.getState().undo()} title="Undo (⌘Z)" disabled={!canUndo}>
        ↩
      </Btn>
      <Btn onClick={() => useEditor.getState().redo()} title="Redo (⌘⇧Z)" disabled={!canRedo}>
        ↪
      </Btn>
      <Divider />
      <div className="flex items-center rounded-xl bg-white/6 p-0.5">
        <Btn onClick={() => zoomBy(1 / 1.3)} title="Zoom out">
          −
        </Btn>
        <span className="w-12 text-center text-[12px] font-medium tabular-nums text-[var(--text-2)]">
          {Math.round(zoom * 100)}%
        </span>
        <Btn onClick={() => zoomBy(1.3)} title="Zoom in">
          +
        </Btn>
        <Btn onClick={fitView} title="Fit plan in view">
          Fit
        </Btn>
      </div>
      <Btn onClick={() => useEditor.getState().toggleGrid()} title="Toggle grid (G)">
        <span className={gridOn ? "text-[var(--tint)]" : undefined}>Grid</span>
      </Btn>
      <Divider />
      <Btn onClick={exportPNG} title="Export plan as PNG image" tone="tint">
        Export
      </Btn>
      <Btn onClick={exportSceneJSON} title="Save plan as a .json file (⌘S)">
        Save
      </Btn>
      <Btn onClick={pickSceneFile} title="Import a saved .json plan (⌘O) — or drop the file on the canvas">
        Import
      </Btn>
      <Btn
        onClick={() => void loadSample("corner-house", "the Corner House sample")}
        title="Load the Corner House showcase plan (undoable)"
      >
        Sample
      </Btn>
      <Divider />
      <Btn
        onClick={() => {
          if (confirm("Clear the whole plan? (You can undo this.)")) useEditor.getState().clearScene();
        }}
        title="Clear plan"
        tone="danger"
      >
        Clear
      </Btn>
    </header>
  );
}
