import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type View = "library" | "develop";
type AdjustmentKey = "exposure" | "contrast" | "highlights" | "shadows" | "whites" | "blacks" | "temperature" | "tint" | "vibrance" | "saturation";
type DetailKey = "sharpening" | "noiseReduction" | "colorNoiseReduction";
type CurveChannel = "rgb" | "red" | "green" | "blue";
type CurvePoint = { x: number; y: number };
type Curves = Record<CurveChannel, CurvePoint[]>;
type Adjustments = Record<AdjustmentKey, number>;
type DetailAdjustments = Record<DetailKey, number>;
type Control = [AdjustmentKey, string, number, number, number];

const DEFAULT_ADJUSTMENTS: Adjustments = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0 };
const DEFAULT_DETAIL: DetailAdjustments = { sharpening: 0, noiseReduction: 0, colorNoiseReduction: 0 };
const DEFAULT_CURVES: Curves = {
  rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
};
const BASIC_CONTROLS: Control[] = [["exposure", "Exposure", -5, 5, 0.01], ["contrast", "Contrast", -100, 100, 1], ["highlights", "Highlights", -100, 100, 1], ["shadows", "Shadows", -100, 100, 1], ["whites", "Whites", -100, 100, 1], ["blacks", "Blacks", -100, 100, 1]];
const COLOR_CONTROLS: Control[] = [["temperature", "Temperature", -100, 100, 1], ["tint", "Tint", -100, 100, 1], ["vibrance", "Vibrance", -100, 100, 1], ["saturation", "Saturation", -100, 100, 1]];

function cloneCurves(curves: Curves): Curves { return { rgb: curves.rgb.map(p => ({ ...p })), red: curves.red.map(p => ({ ...p })), green: curves.green.map(p => ({ ...p })), blue: curves.blue.map(p => ({ ...p })) }; }
function formatValue(value: number, step: number) { return step < 1 ? value.toFixed(2) : Math.round(value).toString(); }
function clamp(value: number, min = 0, max = 255) { return Math.min(max, Math.max(min, value)); }
function smoothstep(edge0: number, edge1: number, value: number) { const t = clamp((value - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }
function curveValue(points: CurvePoint[], x: number) {
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / Math.max(0.0001, b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return x;
}
function curveLut(points: CurvePoint[]) { const lut = new Uint8Array(256); for (let i = 0; i < 256; i++) lut[i] = Math.round(clamp(curveValue(points, i / 255), 0, 1) * 255); return lut; }
function applyCurves(source: ImageData, curves: Curves) {
  const data = source.data;
  const rgb = curveLut(curves.rgb), red = curveLut(curves.red), green = curveLut(curves.green), blue = curveLut(curves.blue);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = red[rgb[data[i]]];
    data[i + 1] = green[rgb[data[i + 1]]];
    data[i + 2] = blue[rgb[data[i + 2]]];
  }
  return source;
}

function applyAdjustments(source: ImageData, adjustments: Adjustments, detail: DetailAdjustments, curves: Curves = DEFAULT_CURVES) {
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

  applyCurves(source, curves);
  applyNoiseReduction(data, source.width, source.height, detail.noiseReduction, detail.colorNoiseReduction);
  applySharpening(data, source.width, source.height, detail.sharpening);
  return source;
}

function sample(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number) {
  const sx = Math.max(0, Math.min(width - 1, x));
  const sy = Math.max(0, Math.min(height - 1, y));
  return data[(sy * width + sx) * 4 + channel];
}
function applyNoiseReduction(data: Uint8ClampedArray, width: number, height: number, luminanceAmount: number, colorAmount: number) {
  if (luminanceAmount <= 0 && colorAmount <= 0) return;
  const source = new Uint8ClampedArray(data);
  const strength = Math.min(1, luminanceAmount / 100);
  const colorStrength = Math.min(1, colorAmount / 100);
  if (strength > 0) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const centerR = source[i], centerG = source[i + 1], centerB = source[i + 2];
      const nR = (sample(source, width, height, x - 1, y, 0) + sample(source, width, height, x + 1, y, 0) + sample(source, width, height, x, y - 1, 0) + sample(source, width, height, x, y + 1, 0)) / 4;
      const nG = (sample(source, width, height, x - 1, y, 1) + sample(source, width, height, x + 1, y, 1) + sample(source, width, height, x, y - 1, 1) + sample(source, width, height, x, y + 1, 1)) / 4;
      const nB = (sample(source, width, height, x - 1, y, 2) + sample(source, width, height, x + 1, y, 2) + sample(source, width, height, x, y - 1, 2) + sample(source, width, height, x, y + 1, 2)) / 4;
      const centerL = 0.2126 * centerR + 0.7152 * centerG + 0.0722 * centerB;
      const neighborL = 0.2126 * nR + 0.7152 * nG + 0.0722 * nB;
      const edge = Math.min(1, Math.abs(centerL - neighborL) / 48);
      const lumaBlend = strength * (1 - edge * 0.65);
      data[i] = clamp(centerR + (nR - centerR) * lumaBlend); data[i + 1] = clamp(centerG + (nG - centerG) * lumaBlend); data[i + 2] = clamp(centerB + (nB - centerB) * lumaBlend); data[i + 3] = source[i + 3];
    }
  }
  if (colorStrength > 0) {
    const chromaSource = new Uint8ClampedArray(data); const chromaBlend = colorStrength * 0.85;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4; const r = chromaSource[i], g = chromaSource[i + 1], b = chromaSource[i + 2];
      const centerY = 0.2126 * r + 0.7152 * g + 0.0722 * b; const centerCb = b - centerY; const centerCr = r - centerY;
      let neighborCb = 0, neighborCr = 0, neighborY = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = Math.max(0, Math.min(width - 1, x + dx)), ny = Math.max(0, Math.min(height - 1, y + dy)), ni = (ny * width + nx) * 4;
        const nr = chromaSource[ni], ng = chromaSource[ni + 1], nb = chromaSource[ni + 2]; const nyLum = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
        neighborY += nyLum; neighborCb += nb - nyLum; neighborCr += nr - nyLum;
      }
      neighborY /= 4; neighborCb /= 4; neighborCr /= 4;
      const edge = Math.min(1, Math.abs(centerY - neighborY) / 32); const blend = chromaBlend * (1 - edge * 0.75);
      const cb = centerCb + (neighborCb - centerCb) * blend, cr = centerCr + (neighborCr - centerCr) * blend, outR = centerY + cr, outB = centerY + cb, outG = (centerY - 0.2126 * outR - 0.0722 * outB) / 0.7152;
      data[i] = clamp(outR); data[i + 1] = clamp(outG); data[i + 2] = clamp(outB); data[i + 3] = chromaSource[i + 3];
    }
  }
}
function applySharpening(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (amount <= 0) return; const source = new Uint8ClampedArray(data); const strength = Math.min(1.5, amount / 70);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) { const center = source[i + c]; const average = (sample(source, width, height, x - 1, y, c) + sample(source, width, height, x + 1, y, c) + sample(source, width, height, x, y - 1, c) + sample(source, width, height, x, y + 1, c)) / 4; data[i + c] = clamp(center + (center - average) * strength); }
    data[i + 3] = source[i + 3];
  }
}

function App() {
  const [view, setView] = useState<View>("library");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [zoom, setZoom] = useState(1);
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [detail, setDetail] = useState<DetailAdjustments>(DEFAULT_DETAIL);
  const [curves, setCurves] = useState<Curves>(cloneCurves(DEFAULT_CURVES));
  const [showCurveEditor, setShowCurveEditor] = useState(false);
  const [selectedTool, setSelectedTool] = useState("Picker");
  const [isRendering, setIsRendering] = useState(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceImageDataRef = useRef<ImageData | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const pendingAdjustmentsRef = useRef(adjustments);
  const pendingDetailRef = useRef(detail);
  const pendingCurvesRef = useRef(curves);

  const imageStyle = useMemo<React.CSSProperties>(() => ({ transform: `scale(${zoom})` }), [zoom]);
  function updateAdjustment(key: AdjustmentKey, value: number) { setAdjustments(current => ({ ...current, [key]: Number.isFinite(value) ? value : 0 })); }
  function updateDetail(key: DetailKey, value: number) { setDetail(current => ({ ...current, [key]: Number.isFinite(value) ? value : 0 })); }
  function importImage() { fileInputRef.current?.click(); }
  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file)); setImageName(file.name); setView("develop"); setZoom(1); setAdjustments(DEFAULT_ADJUSTMENTS); setDetail(DEFAULT_DETAIL); setCurves(cloneCurves(DEFAULT_CURVES)); event.target.value = "";
  }
  function exportEdit() {
    const payload = { app: "Aetherlight 2.0", version: "0.1.0", image: imageName || null, zoom, adjustments, detail, curves };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${imageName.replace(/\.[^.]+$/, "") || "aetherlight-edit"}.aetherlight.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  function resetAdjustments() { setAdjustments(DEFAULT_ADJUSTMENTS); setDetail(DEFAULT_DETAIL); setCurves(cloneCurves(DEFAULT_CURVES)); }

  useEffect(() => {
    if (!imageUrl) return;
    const image = new Image();
    image.onload = () => {
      const source = document.createElement("canvas"); const maxPreviewDimension = 1800; const scale = Math.min(1, maxPreviewDimension / Math.max(image.naturalWidth, image.naturalHeight));
      source.width = Math.max(1, Math.round(image.naturalWidth * scale)); source.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = source.getContext("2d", { willReadFrequently: true }); if (!context) return;
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high"; context.drawImage(image, 0, 0, source.width, source.height);
      sourceCanvasRef.current = source; sourceImageDataRef.current = context.getImageData(0, 0, source.width, source.height);
      const display = displayCanvasRef.current; if (display) { display.width = source.width; display.height = source.height; }
      renderImage(false);
    };
    image.src = imageUrl; return () => { image.onload = null; };
  }, [imageUrl]);

  function renderImage(interactive = isDraggingSlider) {
    if (renderFrameRef.current !== null) cancelAnimationFrame(renderFrameRef.current);
    renderFrameRef.current = requestAnimationFrame(() => {
      const source = sourceImageDataRef.current, display = displayCanvasRef.current; if (!source || !display) return;
      const displayContext = display.getContext("2d"); if (!displayContext) return; setIsRendering(true);
      try {
        if (interactive) {
          const previewScale = Math.min(1, 900 / Math.max(display.width, display.height)); const preview = document.createElement("canvas");
          preview.width = Math.max(1, Math.round(display.width * previewScale)); preview.height = Math.max(1, Math.round(display.height * previewScale));
          const pctx = preview.getContext("2d", { willReadFrequently: true }); if (!pctx) return;
          pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = "medium"; pctx.drawImage(sourceCanvasRef.current!, 0, 0, preview.width, preview.height);
          const processed = applyAdjustments(pctx.getImageData(0, 0, preview.width, preview.height), pendingAdjustmentsRef.current, pendingDetailRef.current, pendingCurvesRef.current);
          pctx.putImageData(processed, 0, 0); displayContext.clearRect(0, 0, display.width, display.height); displayContext.imageSmoothingEnabled = true; displayContext.drawImage(preview, 0, 0, display.width, display.height);
        } else {
          const copy = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
          const processed = applyAdjustments(copy, pendingAdjustmentsRef.current, pendingDetailRef.current, pendingCurvesRef.current); displayContext.putImageData(processed, 0, 0);
        }
      } catch (error) { console.error("Aetherlight render error:", error); } finally { setIsRendering(false); }
    });
  }

  useEffect(() => { pendingAdjustmentsRef.current = adjustments; renderImage(isDraggingSlider); }, [adjustments, detail, curves, isDraggingSlider]);
  useEffect(() => { pendingDetailRef.current = detail; }, [detail]);
  useEffect(() => { pendingCurvesRef.current = curves; }, [curves]);

  return <div className="app-shell">
    <header className="topbar"><div className="brand">AETHERLIGHT <span>2.0</span></div><nav><button className={`nav ${view === "library" ? "active" : ""}`} onClick={() => setView("library")}>LIBRARY</button><button className={`nav ${view === "develop" ? "active" : ""}`} onClick={() => setView("develop")}>DEVELOP</button></nav><div className="actions"><button onClick={importImage}>Import</button><button onClick={exportEdit} disabled={!imageName}>Export</button></div><input ref={fileInputRef} className="hidden-input" type="file" accept="image/*" onChange={handleFile} /></header>
    <main className="workspace"><aside className="leftbar"><div className="tool-title">TOOLS</div>{["Crop", "Heal", "Mask", "Picker"].map(tool => <button key={tool} className={selectedTool === tool ? "selected" : ""} onClick={() => setSelectedTool(tool)}>{tool}</button>)}</aside>
      <section className="canvas">{imageUrl ? <div className="image-stage" onWheel={event => { event.preventDefault(); setZoom(current => Math.min(8, Math.max(0.1, current * (event.deltaY < 0 ? 1.1 : 0.9)))); }}><canvas ref={displayCanvasRef} style={imageStyle} draggable={false} /></div> : <button className="canvas-empty" onClick={importImage}><strong>Aetherlight 2.0</strong><span>GPU-first RAW photo development</span><small>Click to import an image</small></button>}{imageUrl && <div className="zoom-bar"><button onClick={() => setZoom(z => Math.max(0.1, z / 1.15))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(z => Math.min(8, z * 1.15))}>+</button><button onClick={() => setZoom(1)}>FIT</button></div>}{isRendering && <div className="render-status">RENDERING</div>}</section>
      <aside className="rightbar">{view === "library" ? <div className="library-panel"><div className="panel-title">LIBRARY</div>{!imageUrl ? <div className="empty-panel">No photos imported.<br /><button onClick={importImage}>IMPORT PHOTO</button></div> : <div className="library-card" onClick={() => setView("develop")}><img src={imageUrl} alt="" /><div><strong>{imageName}</strong><span>Ready to develop</span></div></div>}</div> : <div className="develop-panel"><div className="panel-heading-row"><div className="panel-title">ADJUSTMENTS</div><button className="reset" onClick={resetAdjustments}>RESET</button></div><section><h3>BASIC</h3>{BASIC_CONTROLS.map(([key, label, min, max, step]) => <Slider key={key} label={label} value={adjustments[key]} min={min} max={max} step={step} onChange={v => updateAdjustment(key, v)} onDragStart={() => setIsDraggingSlider(true)} onDragEnd={() => setIsDraggingSlider(false)} />)}</section><section><h3>COLOR</h3>{COLOR_CONTROLS.map(([key, label, min, max, step]) => <Slider key={key} label={label} value={adjustments[key]} min={min} max={max} step={step} onChange={v => updateAdjustment(key, v)} onDragStart={() => setIsDraggingSlider(true)} onDragEnd={() => setIsDraggingSlider(false)} />)}</section><section><h3>CURVES</h3><button className="feature-button" onClick={() => setShowCurveEditor(true)}>OPEN CURVE EDITOR</button></section><section><h3>DETAIL</h3><Slider label="Sharpening" value={detail.sharpening} min={0} max={100} step={1} onChange={v => updateDetail("sharpening", v)} onDragStart={() => setIsDraggingSlider(true)} onDragEnd={() => setIsDraggingSlider(false)} /><Slider label="Noise Reduction" value={detail.noiseReduction} min={0} max={100} step={1} onChange={v => updateDetail("noiseReduction", v)} onDragStart={() => setIsDraggingSlider(true)} onDragEnd={() => setIsDraggingSlider(false)} /><Slider label="Color Noise" value={detail.colorNoiseReduction} min={0} max={100} step={1} onChange={v => updateDetail("colorNoiseReduction", v)} onDragStart={() => setIsDraggingSlider(true)} onDragEnd={() => setIsDraggingSlider(false)} /></section><section><h3>MASKING</h3><div className="mask-buttons"><button onClick={() => setSelectedTool("Brush Mask")}>BRUSH</button><button onClick={() => setSelectedTool("Linear Mask")}>LINEAR</button><button onClick={() => setSelectedTool("Radial Mask")}>RADIAL</button><button onClick={() => setSelectedTool("AI Mask")}>AI</button></div></section></div>}</aside></main>
    <footer><span>ENGINE • {isRendering ? "RENDERING" : "READY"}</span><span>{imageUrl ? imageName : "NO PHOTO"}</span><span>TOOL • {selectedTool.toUpperCase()}</span></footer>
    {showCurveEditor && <CurveEditor imageData={sourceImageDataRef.current} adjustments={adjustments} detail={detail} curves={curves} onChange={setCurves} onClose={() => setShowCurveEditor(false)} />}
  </div>;
}

function CurveEditor({ imageData, adjustments, detail, curves, onChange, onClose }: { imageData: ImageData | null; adjustments: Adjustments; detail: DetailAdjustments; curves: Curves; onChange: React.Dispatch<React.SetStateAction<Curves>>; onClose: () => void }) {
  const [channel, setChannel] = useState<CurveChannel>("rgb");
  const [selectedPoint, setSelectedPoint] = useState(-1);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef(false);
  const curvesRef = useRef(curves);
  const channelRef = useRef(channel);
  const frameRef = useRef<number | null>(null);
  curvesRef.current = curves; channelRef.current = channel;

  const renderPreview = () => {
    if (!imageData || !imageCanvasRef.current) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const canvas = imageCanvasRef.current; if (!canvas) return;
      const maxW = 620, maxH = 620, scale = Math.min(1, maxW / imageData.width, maxH / imageData.height);
      canvas.width = Math.max(1, Math.round(imageData.width * scale)); canvas.height = Math.max(1, Math.round(imageData.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
      const copy = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      const identity: Curves = cloneCurves(DEFAULT_CURVES);
      const base = applyAdjustments(copy, adjustments, detail, identity);
      const curved = applyCurves(base, curvesRef.current);
      const temp = document.createElement("canvas"); temp.width = imageData.width; temp.height = imageData.height;
      temp.getContext("2d")?.putImageData(curved, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(temp, 0, 0, canvas.width, canvas.height);
    });
  };

  const drawGraph = () => {
    const canvas = graphCanvasRef.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return;
    const w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#101214"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const p = i / 4; ctx.beginPath(); ctx.moveTo(p * w, 0); ctx.lineTo(p * w, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p * h); ctx.lineTo(w, p * h); ctx.stroke(); }
    ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke();
    const points = curves[channel]; ctx.strokeStyle = channel === "rgb" ? "#f2f3f4" : channel === "red" ? "#ff6868" : channel === "green" ? "#73e38a" : "#6ea8ff"; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i <= 256; i++) { const x = i / 256, y = curveValue(points, x), px = x * w, py = (1 - y) * h; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.stroke();
    points.forEach((p, index) => { ctx.beginPath(); ctx.fillStyle = index === selectedPoint ? "#ffffff" : "#b8bdc5"; ctx.arc(p.x * w, (1 - p.y) * h, 5, 0, Math.PI * 2); ctx.fill(); });
  };

  useEffect(() => { drawGraph(); renderPreview(); }, [channel, curves]);
  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); }, []);

  function updatePoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = graphCanvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    const points = curvesRef.current[channelRef.current].map(p => ({ ...p }));
    const index = selectedPoint;
    if (index < 0 || index >= points.length) return;
    const minX = index === 0 ? 0 : points[index - 1].x + 0.002; const maxX = index === points.length - 1 ? 1 : points[index + 1].x - 0.002;
    points[index] = { x: Math.max(minX, Math.min(maxX, x)), y };
    onChange(current => ({ ...current, [channelRef.current]: points }));
  }
  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = graphCanvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    const points = curvesRef.current[channelRef.current]; let nearest = -1, distance = 0.035;
    points.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < distance) { nearest = i; distance = d; } });
    if (nearest < 0) { const next = [...points.map(p => ({ ...p })), { x, y }].sort((a, b) => a.x - b.x); onChange(current => ({ ...current, [channelRef.current]: next })); setSelectedPoint(next.findIndex(p => p.x === x && p.y === y)); } else setSelectedPoint(nearest);
    dragRef.current = true; event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) { if (dragRef.current) updatePoint(event); }
  function pointerUp() { dragRef.current = false; setSelectedPoint(-1); }
  function removePoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = graphCanvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    const points = curvesRef.current[channelRef.current]; let nearest = -1, distance = 0.035;
    points.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < distance && i !== 0 && i !== points.length - 1) { nearest = i; distance = d; } });
    if (nearest >= 0) onChange(current => ({ ...current, [channelRef.current]: current[channelRef.current].filter((_, i) => i !== nearest) }));
  }
  function resetChannel() { onChange(current => ({ ...current, [channel]: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })); setSelectedPoint(-1); }

  return <div className="curve-modal" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="curve-dialog"><div className="curve-header"><strong>CURVE EDITOR</strong><button onClick={onClose}>×</button></div><div className="curve-workspace"><div className="curve-preview-pane"><div className="curve-pane-label">LIVE PREVIEW</div>{imageData ? <canvas ref={imageCanvasRef} className="curve-preview" /> : <div className="curve-preview-empty">No image loaded</div>}</div><div className="curve-editor-pane"><div className="curve-tabs">{(["rgb", "red", "green", "blue"] as CurveChannel[]).map(c => <button key={c} className={channel === c ? "active" : ""} onClick={() => { setChannel(c); setSelectedPoint(-1); }}>{c.toUpperCase()}</button>)}</div><canvas ref={graphCanvasRef} className="curve-graph" width={560} height={560} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onDoubleClick={removePoint} /><div className="curve-hint">Click to add a point · Drag to shape · Double-click a point to remove it</div></div></div><div className="curve-footer"><button onClick={resetChannel}>RESET CHANNEL</button><button className="curve-done" onClick={onClose}>DONE</button></div></div></div>;
}

function Slider({ label, value, min, max, step, onChange, onDragStart, onDragEnd }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; onDragStart?: () => void; onDragEnd?: () => void }) {
  return <div className="slider-row"><label>{label}</label><input type="range" min={min} max={max} step={step} value={value} onPointerDown={onDragStart} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} onChange={event => onChange(Number(event.target.value))} /><input className="value-input" type="number" min={min} max={max} step={step} value={formatValue(value, step)} onChange={event => onChange(Number(event.target.value))} /></div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);