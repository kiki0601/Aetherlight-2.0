import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type View = "library" | "develop";
type AdjustmentKey = "exposure" | "contrast" | "highlights" | "shadows" | "whites" | "blacks" | "temperature" | "tint" | "vibrance" | "saturation";
type Adjustments = Record<AdjustmentKey, number>;
type Control = [AdjustmentKey, string, number, number, number];

const DEFAULT_ADJUSTMENTS: Adjustments = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0 };
const BASIC_CONTROLS: Control[] = [["exposure", "Exposure", -5, 5, 0.01], ["contrast", "Contrast", -100, 100, 1], ["highlights", "Highlights", -100, 100, 1], ["shadows", "Shadows", -100, 100, 1], ["whites", "Whites", -100, 100, 1], ["blacks", "Blacks", -100, 100, 1]];
const COLOR_CONTROLS: Control[] = [["temperature", "Temperature", -100, 100, 1], ["tint", "Tint", -100, 100, 1], ["vibrance", "Vibrance", -100, 100, 1], ["saturation", "Saturation", -100, 100, 1]];

function formatValue(value: number, step: number) { return step < 1 ? value.toFixed(2) : Math.round(value).toString(); }
function clamp(value: number, min = 0, max = 255) { return Math.min(max, Math.max(min, value)); }
function smoothstep(edge0: number, edge1: number, value: number) { const t = clamp((value - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }

function applyAdjustments(source: ImageData, adjustments: Adjustments) {
  const data = source.data;
  const exposureFactor = Math.pow(2, adjustments.exposure);
  const contrast = 1 + adjustments.contrast / 100;
  const saturation = 1 + adjustments.saturation / 100;
  const vibrance = adjustments.vibrance / 100;
  const temperature = adjustments.temperature / 100;
  const tint = adjustments.tint / 100;
  const highlightAmount = adjustments.highlights / 100;
  const shadowAmount = adjustments.shadows / 100;
  const whiteAmount = adjustments.whites / 100;
  const blackAmount = adjustments.blacks / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * exposureFactor, g = data[i + 1] * exposureFactor, b = data[i + 2] * exposureFactor;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const shadowWeight = 1 - smoothstep(0.15, 0.55, luminance), highlightWeight = smoothstep(0.45, 0.9, luminance);
    if (shadowAmount >= 0) { const lift = shadowAmount * 70 * shadowWeight; r += lift; g += lift; b += lift; } else { const darken = -shadowAmount * 55 * shadowWeight; r -= darken; g -= darken; b -= darken; }
    if (highlightAmount >= 0) { const lift = highlightAmount * 55 * highlightWeight; r += lift; g += lift; b += lift; } else { const darken = -highlightAmount * 55 * highlightWeight; r -= darken; g -= darken; b -= darken; }
    if (whiteAmount !== 0) { const delta = whiteAmount * 45 * smoothstep(0.55, 1, luminance); r += delta; g += delta; b += delta; }
    if (blackAmount !== 0) { const delta = blackAmount * 40 * (1 - smoothstep(0, 0.45, luminance)); r += delta; g += delta; b += delta; }
    r = (r - 127.5) * contrast + 127.5; g = (g - 127.5) * contrast + 127.5; b = (b - 127.5) * contrast + 127.5;
    r += temperature * 32; b -= temperature * 32; r += tint * 18; b += tint * 18; g -= tint * 22;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const vibranceBoost = vibrance * (1 - Math.min(1, Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r)) / 382);
    const saturationFactor = saturation + vibranceBoost;
    r = gray + (r - gray) * saturationFactor; g = gray + (g - gray) * saturationFactor; b = gray + (b - gray) * saturationFactor;
    data[i] = clamp(r); data[i + 1] = clamp(g); data[i + 2] = clamp(b);
  }
  return source;
}

function App() {
  const [view, setView] = useState<View>("library");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [zoom, setZoom] = useState(1);
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [selectedTool, setSelectedTool] = useState("Picker");
  const [isRendering, setIsRendering] = useState(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceImageDataRef = useRef<ImageData | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const pendingAdjustmentsRef = useRef(adjustments);

  const imageStyle = useMemo<React.CSSProperties>(() => ({ transform: `scale(${zoom})` }), [zoom]);
  function updateAdjustment(key: AdjustmentKey, value: number) { setAdjustments(current => ({ ...current, [key]: Number.isFinite(value) ? value : 0 })); }
  function importImage() { fileInputRef.current?.click(); }
  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file)); setImageName(file.name); setView("develop"); setZoom(1); setAdjustments(DEFAULT_ADJUSTMENTS); event.target.value = "";
  }
  function exportEdit() {
    const payload = { app: "Aetherlight 2.0", version: "0.1.0", image: imageName || null, zoom, adjustments };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${imageName.replace(/\.[^.]+$/, "") || "aetherlight-edit"}.aetherlight.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  function resetAdjustments() { setAdjustments(DEFAULT_ADJUSTMENTS); }

  useEffect(() => {
    if (!imageUrl) return;
    const image = new Image();
    image.onload = () => {
      const source = document.createElement("canvas");
      const maxPreviewDimension = 1800;
      const scale = Math.min(1, maxPreviewDimension / Math.max(image.naturalWidth, image.naturalHeight));
      source.width = Math.max(1, Math.round(image.naturalWidth * scale)); source.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = source.getContext("2d", { willReadFrequently: true }); if (!context) return;
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high"; context.drawImage(image, 0, 0, source.width, source.height);
      sourceCanvasRef.current = source; sourceImageDataRef.current = context.getImageData(0, 0, source.width, source.height);
      const display = displayCanvasRef.current; if (display) { display.width = source.width; display.height = source.height; }
      renderImage(false);
    };
    image.src = imageUrl;
    return () => { image.onload = null; };
  }, [imageUrl]);

  function renderImage(interactive = isDraggingSlider) {
    if (renderFrameRef.current !== null) cancelAnimationFrame(renderFrameRef.current);
    renderFrameRef.current = requestAnimationFrame(() => {
      const source = sourceImageDataRef.current, display = displayCanvasRef.current;
      if (!source || !display) return;
      const displayContext = display.getContext("2d"); if (!displayContext) return;
      setIsRendering(true);
      try {
        if (interactive) {
          const previewScale = Math.min(1, 900 / Math.max(display.width, display.height));
          const preview = document.createElement("canvas");
          preview.width = Math.max(1, Math.round(display.width * previewScale));
          preview.height = Math.max(1, Math.round(display.height * previewScale));
          const pctx = preview.getContext("2d", { willReadFrequently: true });
          if (!pctx) return;
          pctx.imageSmoothingEnabled = true;
          pctx.imageSmoothingQuality = "medium";
          pctx.drawImage(sourceCanvasRef.current!, 0, 0, preview.width, preview.height);
          const processed = applyAdjustments(pctx.getImageData(0, 0, preview.width, preview.height), pendingAdjustmentsRef.current);
          pctx.putImageData(processed, 0, 0);
          displayContext.clearRect(0, 0, display.width, display.height);
          displayContext.imageSmoothingEnabled = true;
          displayContext.drawImage(preview, 0, 0, display.width, display.height);
        } else {
          const copy = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
          const processed = applyAdjustments(copy, pendingAdjustmentsRef.current);
          displayContext.putImageData(processed, 0, 0);
        }
      } catch (error) {
        console.error("Aetherlight render error:", error);
      } finally {
        setIsRendering(false);
      }
    });
  }

  useEffect(() => { pendingAdjustmentsRef.current = adjustments; renderImage(isDraggingSlider); }, [adjustments, isDraggingSlider]);

  return <div className="app-shell">
    <header className="topbar"><div className="brand">AETHERLIGHT <span>2.0</span></div><nav><button className={`nav ${view === "library" ? "active" : ""}`} onClick={() => setView("library")}>LIBRARY</button><button className={`nav ${view === "develop" ? "active" : ""}`} onClick={() => setView("develop")}>DEVELOP</button></nav><div className="actions"><button onClick={importImage}>Import</button><button onClick={exportEdit} disabled={!imageName}>Export</button></div><input ref={fileInputRef} className="hidden-input" type="file" accept="image/*" onChange={handleFile} /></header>
    <main className="workspace"><aside className="leftbar"><div className="tool-title">TOOLS</div>{["Crop", "Heal", "Mask", "Picker"].map(tool => <button key={tool} className={selectedTool === tool ? "selected" : ""} onClick={() => setSelectedTool(tool)}>{tool}</button>)}</aside>
      <section className="canvas">{imageUrl ? <div className="image-stage" onWheel={event => { event.preventDefault(); setZoom(current => Math.min(8, Math.max(0.1, current * (event.deltaY < 0 ? 1.1 : 0.9)))); }}><canvas ref={displayCanvasRef} style={imageStyle} draggable={false} /></div> : <button className="canvas-empty" onClick={importImage}><strong>Aetherlight 2.0</strong><span>GPU-first RAW photo development</span><small>Click to import an image</small></button>}{imageUrl && <div className="zoom-bar"><button onClick={() => setZoom(z => Math.max(0.1, z / 1.15))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(z => Math.min(8, z * 1.15))}>+</button><button onClick={() => setZoom(1)}>FIT</button></div>}{isRendering && <div className="render-status">RENDERING</div>}</section>
      <aside className="rightbar">{view === "library" ? <div className="library-panel"><div className="panel-title">LIBRARY</div>{!imageUrl ? <div className="empty-panel">No photos imported.<br /><button onClick={importImage}>IMPORT PHOTO</button></div> : <div className="library-card" onClick={() => setView("develop")}><img src={imageUrl} alt="" /><div><strong>{imageName}</strong><span>Ready to develop</span></div></div>}</div> : <div className="develop-panel"><div className="panel-heading-row"><div className="panel-title">ADJUSTMENTS</div><button className="reset" onClick={resetAdjustments}>RESET</button></div><section><h3>BASIC</h3>{BASIC_CONTROLS.map(([key, label, min, max, step]) => <Slider key={key} label={label} value={adjustments[key]} min={min} max={max} step={step} onChange={v => updateAdjustment(key, v)} onDragStart={() => setIsDraggingSlider(true)} onDragEnd={() => setIsDraggingSlider(false)} />)}</section><section><h3>COLOR</h3>{COLOR_CONTROLS.map(([key, label, min, max, step]) => <Slider key={key} label={label} value={adjustments[key]} min={min} max={max} step={step} onChange={v => updateAdjustment(key, v)} onDragStart={() => setIsDraggingSlider(true)} onDragEnd={() => setIsDraggingSlider(false)} />)}</section><section><h3>CURVES</h3><button className="feature-button">OPEN CURVE EDITOR</button></section><section><h3>DETAIL</h3><Slider label="Sharpening" value={0} min={0} max={100} step={1} onChange={() => {}} /><Slider label="Noise Reduction" value={0} min={0} max={100} step={1} onChange={() => {}} /></section><section><h3>MASKING</h3><div className="mask-buttons"><button onClick={() => setSelectedTool("Brush Mask")}>BRUSH</button><button onClick={() => setSelectedTool("Linear Mask")}>LINEAR</button><button onClick={() => setSelectedTool("Radial Mask")}>RADIAL</button><button onClick={() => setSelectedTool("AI Mask")}>AI</button></div></section></div>}</aside></main>
    <footer><span>ENGINE • {isRendering ? "RENDERING" : "READY"}</span><span>{imageUrl ? imageName : "NO PHOTO"}</span><span>TOOL • {selectedTool.toUpperCase()}</span></footer>
  </div>;
}

function Slider({ label, value, min, max, step, onChange, onDragStart, onDragEnd }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; onDragStart?: () => void; onDragEnd?: () => void }) {
  return <div className="slider-row"><label>{label}</label><input type="range" min={min} max={max} step={step} value={value} onPointerDown={onDragStart} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} onChange={event => onChange(Number(event.target.value))} /><input className="value-input" type="number" min={min} max={max} step={step} value={formatValue(value, step)} onChange={event => onChange(Number(event.target.value))} /></div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
