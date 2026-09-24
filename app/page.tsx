import Editor from "@/components/Editor";
import HousePanel from "@/components/HousePanel";
import PropertiesPanel from "@/components/PropertiesPanel";
import Toolbar from "@/components/Toolbar";
import TopBar from "@/components/TopBar";
import Toast from "@/components/Toast";

export default function Home() {
  return (
    <div className="relative h-dvh w-full overflow-hidden" style={{ backgroundColor: "var(--bg)" }}>
      {/* the canvas is the room — chrome floats above it */}
      <div className="absolute inset-0">
        <Editor />
      </div>
      <TopBar />
      <Toolbar />
      <PropertiesPanel />
      <HousePanel />
      <Toast />
    </div>
  );
}
