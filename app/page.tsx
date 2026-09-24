import Editor from "@/components/Editor";
import HousePanel from "@/components/HousePanel";
import PropertiesPanel from "@/components/PropertiesPanel";
import Toolbar from "@/components/Toolbar";
import TopBar from "@/components/TopBar";
import Toast from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import ShortcutSheet from "@/components/ShortcutSheet";

export default function Home() {
  return (
    <div className="relative h-dvh w-full overflow-hidden" style={{ backgroundColor: "var(--bg)" }}>
      {/* the canvas is the room — chrome floats above it */}
      <div className="absolute inset-0">
        <Editor />
      </div>
      <EmptyState />
      <TopBar />
      <Toolbar />
      <PropertiesPanel />
      <HousePanel />
      <Toast />
      <ShortcutSheet />
    </div>
  );
}
