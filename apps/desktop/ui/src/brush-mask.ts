type MaskState = {
  size: number;
  feather: number;
  flow: number;
  erasing: boolean;
  overlay: boolean;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
};

const state: MaskState = {
  size: 90, feather: 70, flow: 100, erasing: false, overlay: true,
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0
};

let active = false;
let painting = false;
let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;
let stage: HTMLElement | null = null;
let display: HTMLCanvasElement | null = null;
let panel: HTMLDivElement | null = null;
let cursor: HTMLDivElement | null = null;
let basePixels: ImageData | null = null;
let lastPoint: { x: number; y: number } | null = null;

function clamp(v: number, a = 0, b = 255) { return Math.min(b, Math.max(a, v)); }
function smooth(v: number) { return v * v * (3 - 2 * v); }
function getStage() { return document.querySelector<HTMLElement>(".image-stage"); }
function getDisplay() { return document.querySelector<HTMLCanvasElement>(".image-stage canvas"); }

function ensureCanvases() {
  stage = getStage(); display = getDisplay();
  if (!stage || !display) return false;
  if (!overlayCanvas) {
    overlayCanvas = document.createElement("canvas"); overlayCanvas.className = "brush-mask-overlay";
    maskCanvas = document.createElement("canvas"); maskCanvas.className = "brush-mask-data";
    stage.appendChild(overlayCanvas); stage.appendChild(maskCanvas);
    overlayCtx = overlayCanvas.getContext("2d"); maskCtx = maskCanvas.getContext("2d");
    maskCanvas.style.display = "none";
  }
  syncGeometry();
  return !!overlayCtx && !!maskCtx;
}

function syncGeometry() {
  if (!stage || !display || !overlayCanvas || !maskCanvas) return;
  const sr = stage.getBoundingClientRect(), dr = display.getBoundingClientRect();
  const left = dr.left - sr.left, top = dr.top - sr.top;
  for (const c of [overlayCanvas, maskCanvas]) {
    c.width = display.width; c.height = display.height;
    c.style.left = `${left}px`; c.style.top = `${top}px`; c.style.width = `${dr.width}px`; c.style.height = `${dr.height}px`;
  }
}

function startBase() {
  if (!display) return;
  try { basePixels = display.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, display.width, display.height) || null; } catch { basePixels = null; }
}

function drawOverlay() {
  if (!overlayCtx || !overlayCanvas || !maskCtx || !maskCanvas) return;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!state.overlay) return;
  const mask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const out = overlayCtx.createImageData(maskCanvas.width, maskCanvas.height);
  for (let i = 0; i < mask.length; i += 4) {
    const a = mask[i + 3]; out.data[i] = 235; out.data[i + 1] = 35; out.data[i + 2] = 55; out.data[i + 3] = Math.round(a * 0.38);
  }
  overlayCtx.putImageData(out, 0, 0);
}

function brushAt(x: number, y: number) {
  if (!maskCtx || !maskCanvas) return;
  const radius = Math.max(1, state.size / 2);
  const inner = radius * (1 - state.feather / 100);
  const left = Math.max(0, Math.floor(x - radius)), right = Math.min(maskCanvas.width - 1, Math.ceil(x + radius));
  const top = Math.max(0, Math.floor(y - radius)), bottom = Math.min(maskCanvas.height - 1, Math.ceil(y + radius));
  const img = maskCtx.getImageData(left, top, right - left + 1, bottom - top + 1);
  const flow = state.flow / 100;
  for (let yy = 0; yy <= bottom - top; yy++) for (let xx = 0; xx <= right - left; xx++) {
    const dx = left + xx - x, dy = top + yy - y, d = Math.hypot(dx, dy);
    if (d > radius) continue;
    const t = d <= inner ? 1 : smooth(1 - (d - inner) / Math.max(1, radius - inner));
    const amount = Math.round(255 * t * flow);
    const i = (yy * img.width + xx) * 4;
    if (state.erasing) img.data[i + 3] = Math.max(0, img.data[i + 3] - amount);
    else img.data[i + 3] = Math.min(255, img.data[i + 3] + amount);
  }
  maskCtx.putImageData(img, left, top);
}

function lineBrush(a: {x:number;y:number}, b: {x:number;y:number}) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const step = Math.max(2, state.size * 0.18);
  for (let d = 0; d <= distance; d += step) {
    const t = distance ? d / distance : 0; brushAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  drawOverlay(); applyMaskedResult();
}

function pointFromEvent(e: PointerEvent) {
  if (!overlayCanvas) return null;
  const r = overlayCanvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (overlayCanvas.width / r.width), y: (e.clientY - r.top) * (overlayCanvas.height / r.height) };
}

function applyMaskedResult() {
  if (!display || !maskCtx || !basePixels) return;
  const ctx = display.getContext("2d"); if (!ctx) return;
  const mask = maskCtx.getImageData(0, 0, display.width, display.height).data;
  const out = new ImageData(new Uint8ClampedArray(basePixels.data), basePixels.width, basePixels.height);
  const data = out.data;
  const exposure = Math.pow(2, state.exposure), contrast = 1 + state.contrast / 100, sat = 1 + state.saturation / 100, vib = state.vibrance / 100;
  for (let i = 0; i < data.length; i += 4) {
    const m = mask[i + 3] / 255; if (m <= 0) continue;
    let r = data[i] * exposure, g = data[i + 1] * exposure, b = data[i + 2] * exposure;
    const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
    const sw = 1 - smooth(Math.max(0, Math.min(1, (lum - .15) / .4)));
    const hw = smooth(Math.max(0, Math.min(1, (lum - .45) / .45)));
    const sh = state.shadows / 100 * 70 * sw, hi = state.highlights / 100 * 55 * hw;
    r += sh + hi; g += sh + hi; b += sh + hi;
    r = (r - 127.5) * contrast + 127.5; g = (g - 127.5) * contrast + 127.5; b = (b - 127.5) * contrast + 127.5;
    const temp = state.temperature / 100 * 32, tint = state.tint / 100;
    r += temp + tint * 18; b -= temp; b += tint * 18; g -= tint * 22;
    const gray = .2126*r + .7152*g + .0722*b;
    const vb = vib * (1 - Math.min(1, (Math.abs(r-g)+Math.abs(g-b)+Math.abs(b-r))/382));
    const sf = sat + vb; r = gray + (r-gray)*sf; g = gray + (g-gray)*sf; b = gray + (b-gray)*sf;
    data[i] = Math.round(clamp(data[i] + (r - data[i]) * m)); data[i+1] = Math.round(clamp(data[i+1] + (g - data[i+1]) * m)); data[i+2] = Math.round(clamp(data[i+2] + (b - data[i+2]) * m));
  }
  ctx.putImageData(out, 0, 0);
}

function rebuildAfterControl() { drawOverlay(); applyMaskedResult(); }
function addSlider(container: HTMLElement, label: string, key: keyof MaskState, min: number, max: number, step: number) {
  const row = document.createElement("div"); row.className = "brush-control-row";
  const text = document.createElement("label"); text.textContent = label;
  const input = document.createElement("input"); input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(state[key]);
  const value = document.createElement("span"); value.textContent = String(state[key]);
  input.addEventListener("input", () => { state[key] = Number(input.value) as never; value.textContent = step < 1 ? Number(input.value).toFixed(2) : input.value; rebuildAfterControl(); });
  row.append(text, input, value); container.appendChild(row);
}

function buildPanel() {
  if (panel) return;
  panel = document.createElement("div"); panel.className = "brush-mask-panel";
  panel.innerHTML = `<div class="brush-mask-title"><strong>BRUSH MASK</strong><button data-close>×</button></div><div class="brush-mask-tools"><button data-erase>PAINT</button><button data-overlay>OVERLAY</button><button data-clear>CLEAR</button></div><div class="brush-mask-section"><h4>BRUSH</h4></div><div class="brush-mask-section"><h4>MASK ADJUSTMENTS</h4></div>`;
  document.body.appendChild(panel);
  panel.querySelector('[data-close]')?.addEventListener('click', () => deactivate());
  panel.querySelector('[data-erase]')?.addEventListener('click', e => { state.erasing = !state.erasing; (e.currentTarget as HTMLElement).textContent = state.erasing ? "ERASE" : "PAINT"; });
  panel.querySelector('[data-overlay]')?.addEventListener('click', () => { state.overlay = !state.overlay; drawOverlay(); });
  panel.querySelector('[data-clear]')?.addEventListener('click', () => { if (maskCtx && maskCanvas) maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height); if (basePixels && display) display.getContext("2d")?.putImageData(basePixels,0,0); drawOverlay(); });
  const sections = panel.querySelectorAll('.brush-mask-section');
  addSlider(sections[0], 'Size', 'size', 5, 500, 1); addSlider(sections[0], 'Feather', 'feather', 0, 100, 1); addSlider(sections[0], 'Flow', 'flow', 1, 100, 1);
  addSlider(sections[1], 'Exposure', 'exposure', -5, 5, .01); addSlider(sections[1], 'Contrast', 'contrast', -100, 100, 1); addSlider(sections[1], 'Highlights', 'highlights', -100, 100, 1); addSlider(sections[1], 'Shadows', 'shadows', -100, 100, 1); addSlider(sections[1], 'Temperature', 'temperature', -100, 100, 1); addSlider(sections[1], 'Tint', 'tint', -100, 100, 1); addSlider(sections[1], 'Vibrance', 'vibrance', -100, 100, 1); addSlider(sections[1], 'Saturation', 'saturation', -100, 100, 1);
}

function deactivate() { active = false; painting = false; panel?.remove(); panel = null; cursor?.remove(); cursor = null; if (overlayCtx && overlayCanvas) overlayCtx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height); }
function activate() {
  if (active) return; active = true; if (!ensureCanvases()) { active = false; return; }
  startBase(); buildPanel(); drawOverlay();
  cursor = document.createElement("div"); cursor.className = "brush-mask-cursor"; document.body.appendChild(cursor);
}

function bind() {
  const buttons = Array.from(document.querySelectorAll("button"));
  const maskButton = buttons.find(b => b.textContent?.trim().toUpperCase() === "MASK");
  if (maskButton && !maskButton.dataset.brushMaskBound) { maskButton.dataset.brushMaskBound = "1"; maskButton.addEventListener("click", () => setTimeout(activate, 30)); }
  if (!overlayCanvas) ensureCanvases();
  if (overlayCanvas && !overlayCanvas.dataset.bound) {
    overlayCanvas.dataset.bound = "1";
    overlayCanvas.addEventListener("pointerdown", e => { if (!active) return; e.preventDefault(); overlayCanvas!.setPointerCapture(e.pointerId); painting = true; lastPoint = pointFromEvent(e); if (lastPoint) { brushAt(lastPoint.x,lastPoint.y); drawOverlay(); applyMaskedResult(); } });
    overlayCanvas.addEventListener("pointermove", e => { if (!active) return; const p = pointFromEvent(e); if (!p) return; if (cursor) { cursor.style.left = `${e.clientX}px`; cursor.style.top = `${e.clientY}px`; cursor.style.width = `${state.size * overlayCanvas!.getBoundingClientRect().width / overlayCanvas!.width}px`; cursor.style.height = `${state.size * overlayCanvas!.getBoundingClientRect().height / overlayCanvas!.height}px`; } if (painting && lastPoint) lineBrush(lastPoint,p); lastPoint=p; });
    const end = () => { painting=false; lastPoint=null; };
    overlayCanvas.addEventListener("pointerup", end); overlayCanvas.addEventListener("pointercancel", end); overlayCanvas.addEventListener("pointerleave", end);
  }
  syncGeometry(); requestAnimationFrame(bind);
}

bind();