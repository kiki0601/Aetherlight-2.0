import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type View = "library" | "develop";
type AdjustmentKey = "exposure" | "contrast" | "highlights" | "shadows" | "whites" | "blacks" | "temperature" | "tint" | "vibrance" | "saturation";

type Adjustments = Record<AdjustmentKey, number>;

const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
};

const BASIC_CONTROLS: Array<[AdjustmentKey, string, number, number, number]> = [
  ["exposure", "Exposure", -5, 5, 0.01],
  ["contrast", "Contrast", -100, 100, 1],
  ["highlights", "Highlights", -100, 100, 1],
  ["shadows", "Shadows", -100, 100, 1],
  ["whites", "Whites", -100, 100, 1],
  ["blacks", "Blacks", -100, 100, 1],
];

const COLOR_CONTROLS: Array<[AdjustmentKey, string, number, number, number]> = [
  ["temperature", "Temperature", -100, 100, 1],
  ["tint", "Tint", -100, 100, 1],
  ["vibrance", "Vibrance", -100, 100, 1],
  ["saturation", "Saturation", -100, 100, 1],
];

function formatValue(value: number, step: number) {
  return step < 1 ? value.toFixed(2) : Math.round(value).toString();
}

function App() {
  const [view, setView] = useState<View>("library");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [selectedTool, setSelectedTool] = useState("Picker");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageStyle = useMemo<React.CSSProperties>(() => {
    const exposure = adjustments.exposure;
    const contrast = 1 + adjustments.contrast / 100;
    const saturation = 1 + adjustments.saturation / 100;
    const brightness = Math.max(0.05, 1 + exposure / 5);
    return {
      transform: `scale(${zoom})`,
      filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`,
    };
  }, [adjustments, zoom]);

  function updateAdjustment(key: AdjustmentKey, value: number) {
    setAdjustments((current) => ({ ...current, [key]: value }));
  }

  function importImage() {
    fileInputRef.current?.click();
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    setView("develop");
    setZoom(1);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    event.target.value = "";
  }

  function exportEdit() {
    const payload = {
      app: "Aetherlight 2.0",
      version: "0.1.0",
      image: imageName || null,
      zoom,
      adjustments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${imageName.replace(/\.[^.]+$/, "") || "aetherlight-edit"}.aetherlight.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetAdjustments() {
    setAdjustments(DEFAULT_ADJUSTMENTS);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">AETHERLIGHT <span>2.0</span></div>
        <nav>
          <button className={`nav ${view === "library" ? "active" : ""}`} onClick={() => setView("library")}>LIBRARY</button>
          <button className={`nav ${view === "develop" ? "active" : ""}`} onClick={() => setView("develop")}>DEVELOP</button>
        </nav>
        <div className="actions">
          <button onClick={importImage}>Import</button>
          <button onClick={exportEdit} disabled={!imageName}>Export</button>
        </div>
        <input ref={fileInputRef} className="hidden-input" type="file" accept="image/*" onChange={handleFile} />
      </header>

      <main className="workspace">
        <aside className="leftbar">
          <div className="tool-title">TOOLS</div>
          {["Crop", "Heal", "Mask", "Picker"].map((tool) => (
            <button key={tool} className={selectedTool === tool ? "selected" : ""} onClick={() => setSelectedTool(tool)}>{tool}</button>
          ))}
        </aside>

        <section className="canvas">
          {imageUrl ? (
            <div className="image-stage" onWheel={(event) => {
              event.preventDefault();
              setZoom((current) => Math.min(8, Math.max(0.1, current * (event.deltaY < 0 ? 1.1 : 0.9))));
            }}>
              <img src={imageUrl} alt={imageName} style={imageStyle} draggable={false} />
            </div>
          ) : (
            <button className="canvas-empty" onClick={importImage}>
              <strong>Aetherlight 2.0</strong>
              <span>GPU-first RAW photo development</span>
              <small>Click to import an image</small>
            </button>
          )}
          {imageUrl && (
            <div className="zoom-bar">
              <button onClick={() => setZoom((z) => Math.max(0.1, z / 1.15))}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(8, z * 1.15))}>+</button>
              <button onClick={() => setZoom(1)}>FIT</button>
            </div>
          )}
        </section>

        <aside className="rightbar">
          {view === "library" ? (
            <div className="library-panel">
              <div className="panel-title">LIBRARY</div>
              {!imageUrl ? (
                <div className="empty-panel">No photos imported.<br /><button onClick={importImage}>IMPORT PHOTO</button></div>
              ) : (
                <div className="library-card" onClick={() => setView("develop")}>
                  <img src={imageUrl} alt="" />
                  <div><strong>{imageName}</strong><span>Ready to develop</span></div>
                </div>
              )}
            </div>
          ) : (
            <div className="develop-panel">
              <div className="panel-heading-row">
                <div className="panel-title">ADJUSTMENTS</div>
                <button className="reset" onClick={resetAdjustments}>RESET</button>
              </div>

              <section><h3>BASIC</h3>{BASIC_CONTROLS.map(([key, label, min, max, step]) => <Slider key={key} label={label} value={adjustments[key]} min={min} max={max} step={step} onChange={(v) => updateAdjustment(key, v)} />)}</section>
              <section><h3>COLOR</h3>{COLOR_CONTROLS.map(([key, label, min, max, step]) => <Slider key={key} label={label} value={adjustments[key]} min={min} max={max} step={step} onChange={(v) => updateAdjustment(key, v)} />)}</section>
              <section><h3>CURVES</h3><button className="feature-button">OPEN CURVE EDITOR</button></section>
              <section><h3>DETAIL</h3><Slider label="Sharpening" value={0} min={0} max={100} step={1} onChange={() => {}} /><Slider label="Noise Reduction" value={0} min={0} max={100} step={1} onChange={() => {}} /></section>
              <section><h3>MASKING</h3><div className="mask-buttons"><button onClick={() => setSelectedTool("Brush Mask")}>BRUSH</button><button onClick={() => setSelectedTool("Linear Mask")}>LINEAR</button><button onClick={() => setSelectedTool("Radial Mask")}>RADIAL</button><button onClick={() => setSelectedTool("AI Mask")}>AI</button></div></section>
            </div>
          )}
        </aside>
      </main>

      <footer><span>ENGINE • READY</span><span>{imageUrl ? imageName : "NO PHOTO"}</span><span>TOOL • {selectedTool.toUpperCase()}</span></footer>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <div className="slider-row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <input className="value-input" type="number" min={min} max={max} step={step} value={formatValue(value, step)} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
