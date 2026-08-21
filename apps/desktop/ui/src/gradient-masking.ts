type GradientKind = "Linear Mask" | "Radial Mask";
type BlendMode = "replace" | "add" | "subtract";

type GradientState = {
  kind: GradientKind;
  feather: number;
  blend: BlendMode;
  invert: boolean;
  overlay: boolean;
};

const state: GradientState = {
  kind: "Linear Mask",
  feather: 60,
  blend: "replace",
  invert: false,
  overlay: true,
};

let panel: HTMLDivElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let drawing = false;
let start: { x: number; y: number } | null = null;
let end: { x: number; y: number } | null = null;
let installed = false;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);

function activeKind(): GradientKind | null {
  const footer = $("footer")?.textContent?.toUpperCase() || "";
  if (footer.includes("TOOL • LINEAR MASK")) return "Linear Mask";
  if (footer.includes("TOOL • RADIAL MASK")) return "Radial Mask";
  const selected = Array.from(document.querySelectorAll<HTMLButtonElement>(".mask-buttons button.active"))[0]?.textContent?.trim().toUpperCase();
  if (selected === "LINEAR") return "Linear Mask";
  if (selected === "RADIAL") return "Radial Mask";
  return null;
}

function overlayCanvas() {
  return $(".mask-overlay-canvas") as HTMLCanvasElement | null;
}

function maskCanvas() {
  return $(".mask-data-canvas") as HTMLCanvasElement | null;
}

function ensureMaskCanvas() {
  const overlay = overlayCanvas();
  if (!overlay) return null;
  let mask = maskCanvas();
  if (!mask) {
    mask = document.createElement("canvas");
    mask.className = "mask-data-canvas";
    mask.width = overlay.width;
    mask.height = overlay.height;
    mask.style.display = "none";
    overlay.parentElement?.appendChild(mask);
  }
  if (mask.width !== overlay.width || mask.height !== overlay.height) {
    mask.width = overlay.width;
    mask.height = overlay.height;
  }
  return mask;
}

function pointFromEvent(event: PointerEvent, target: HTMLCanvasElement) {
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.max(0, Math.min(target.width - 1, (event.clientX - rect.left) * target.width / rect.width)),
    y: Math.max(0, Math.min(target.height - 1, (event.clientY - rect.top) * target.height / rect.height)),
  };
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function gradientAlpha(x: number, y: number, from: { x: number; y: number }, to: { x: number; y: number }, kind: GradientKind) {
  const feather = Math.max(0, Math.min(1, state.feather / 100));
  if (kind === "Radial Mask") {
    const radius = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
    const distance = Math.hypot(x - from.x, y - from.y);
    const inner = radius * (1 - feather * 0.92);
    return distance <= inner ? 1 : 1 - smoothstep(inner, radius, distance);
  }

  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const lengthSquared = Math.max(1, vx * vx + vy * vy);
  const projection = ((x - from.x) * vx + (y - from.y) * vy) / lengthSquared;
  const transitionStart = Math.max(0, 1 - feather * 0.92);
  if (projection <= transitionStart) return 1;
  if (projection >= 1) return 0;
  return 1 - smoothstep(transitionStart, 1, projection);
}

function combine(current: number, next: number) {
  if (state.blend === "add") return Math.max(current, next);
  if (state.blend === "subtract") return Math.max(0, current - next);
  return next;
}

function renderGradient() {
  if (!start || !end) return;
  const mask = ensureMaskCanvas();
  const overlay = overlayCanvas();
  if (!mask || !overlay || !mask.width || !mask.height) return;
  const ctx = mask.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const pixels = ctx.getImageData(0, 0, mask.width, mask.height);
  const data = pixels.data;
  const from = start;
  const to = end;

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      let alpha = gradientAlpha(x, y, from, to, state.kind);
      if (state.invert) alpha = 1 - alpha;
      const i = (y * mask.width + x) * 4;
      const current = data[i + 3] / 255;
      const value = combine(current, alpha);
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(value * 255);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  refreshOverlay();
  triggerRender();
}

function refreshOverlay() {
  const overlay = overlayCanvas();
  const mask = maskCanvas();
  if (!overlay || !mask) return;
  const ctx = overlay.getContext("2d");
  const maskCtx = mask.getContext("2d", { willReadFrequently: true });
  if (!ctx || !maskCtx) return;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!state.overlay) return;
  const pixels = maskCtx.getImageData(0, 0, mask.width, mask.height);
  const output = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const alpha = pixels.data[i + 3];
    output.data[i] = 238;
    output.data[i + 1] = 42;
    output.data[i + 2] = 58;
    output.data[i + 3] = Math.round(alpha * 0.38);
  }
  ctx.putImageData(output, 0, 0);
}

function triggerRender() {
  const panelInput = panel?.querySelector<HTMLInputElement>('input[data-local="Exposure"]');
  panelInput?.dispatchEvent(new Event("input", { bubbles: true }));
  window.dispatchEvent(new CustomEvent("aetherlight-gradient-mask-changed"));
}

function clearMask() {
  const mask = maskCanvas();
  if (!mask) return;
  mask.getContext("2d")?.clearRect(0, 0, mask.width, mask.height);
  start = null;
  end = null;
  refreshOverlay();
  triggerRender();
}

function invertMask() {
  const mask = maskCanvas();
  if (!mask) return;
  const ctx = mask.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const pixels = ctx.getImageData(0, 0, mask.width, mask.height);
  for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255 - pixels.data[i];
  ctx.putImageData(pixels, 0, 0);
  state.invert = !state.invert;
  refreshOverlay();
  triggerRender();
}

function buildPanel() {
  if (panel) return;
  panel = document.createElement("div");
  panel.className = "gradient-mask-panel mask-v2-panel";
  panel.innerHTML = `
    <div class="mask-v2-title"><strong>GRADIENT MASK</strong><span>V1</span></div>
    <div class="mask-v2-row"><label>Feather</label><input data-gradient="feather" type="range" min="0" max="100" step="1" value="${state.feather}"><output>${state.feather}</output></div>
    <div class="gradient-mask-buttons"><button data-gradient-action="replace" class="active">REPLACE</button><button data-gradient-action="add">ADD</button><button data-gradient-action="subtract">SUBTRACT</button></div>
    <div class="gradient-mask-buttons"><button data-gradient-action="invert">INVERT</button><button data-gradient-action="overlay" class="active">OVERLAY</button><button data-gradient-action="clear">CLEAR</button></div>
    <div class="mask-v2-subtitle">LOCAL ADJUSTMENTS</div>
    <div class="mask-v2-local">
      <div class="mask-v2-row"><label>Exposure</label><input data-local="Exposure" type="range" min="-5" max="5" step="0.01" value="0"><output>0.00</output></div>
      <div class="mask-v2-row"><label>Contrast</label><input data-local="Contrast" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
      <div class="mask-v2-row"><label>Highlights</label><input data-local="Highlights" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
      <div class="mask-v2-row"><label>Shadows</label><input data-local="Shadows" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
      <div class="mask-v2-row"><label>Temperature</label><input data-local="Temperature" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
      <div class="mask-v2-row"><label>Tint</label><input data-local="Tint" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
      <div class="mask-v2-row"><label>Vibrance</label><input data-local="Vibrance" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
      <div class="mask-v2-row"><label>Saturation</label><input data-local="Saturation" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
    </div>`;
  $(".canvas")?.appendChild(panel);

  panel.querySelector<HTMLInputElement>('input[data-gradient="feather"]')?.addEventListener("input", event => {
    state.feather = Number((event.target as HTMLInputElement).value);
    const output = (event.target as HTMLInputElement).nextElementSibling as HTMLOutputElement | null;
    if (output) output.value = String(state.feather);
    if (start && end) renderGradient();
  });

  panel.querySelectorAll<HTMLButtonElement>("button[data-gradient-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.gradientAction;
      if (action === "replace" || action === "add" || action === "subtract") {
        state.blend = action;
        panel?.querySelectorAll("button[data-gradient-action]").forEach(b => {
          if (["replace", "add", "subtract"].includes(b.dataset.gradientAction || "")) b.classList.toggle("active", b === button);
        });
      } else if (action === "invert") {
        invertMask();
      } else if (action === "overlay") {
        state.overlay = !state.overlay;
        button.classList.toggle("active", state.overlay);
        refreshOverlay();
      } else if (action === "clear") {
        clearMask();
      }
    });
  });

  panel.querySelectorAll<HTMLInputElement>("input[data-local]").forEach(input => {
    input.addEventListener("input", () => {
      const output = input.nextElementSibling as HTMLOutputElement | null;
      if (output) output.value = input.step === "0.01" ? Number(input.value).toFixed(2) : input.value;
    });
  });
}

function removePanel() {
  panel?.remove();
  panel = null;
}

function installPointerHandlers() {
  const next = overlayCanvas();
  if (!next || next === canvas) return;
  canvas = next;
  canvas.style.touchAction = "none";

  canvas.addEventListener("pointerdown", event => {
    if (!activeKind()) return;
    const point = pointFromEvent(event, canvas!);
    if (!point) return;
    drawing = true;
    start = point;
    end = point;
    canvas!.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!drawing || !activeKind()) return;
    const point = pointFromEvent(event, canvas!);
    if (!point) return;
    end = point;
    renderGradient();
  });

  const finish = (event: PointerEvent) => {
    if (!drawing) return;
    drawing = false;
    const point = pointFromEvent(event, canvas!);
    if (point) end = point;
    renderGradient();
    try { canvas!.releasePointerCapture(event.pointerId); } catch {}
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}

function sync() {
  const kind = activeKind();
  const isGradient = !!kind;
  if (isGradient) {
    state.kind = kind!;
    buildPanel();
    const brushPanel = $(".mask-v2-panel:not(.gradient-mask-panel)") as HTMLElement | null;
    if (brushPanel) brushPanel.style.display = "none";
  } else {
    removePanel();
    const brushPanel = $(".mask-v2-panel:not(.gradient-mask-panel)") as HTMLElement | null;
    if (brushPanel) brushPanel.style.display = "";
  }
  installPointerHandlers();
  if (isGradient) refreshOverlay();
  requestAnimationFrame(sync);
}

sync();
