type LocalAdjustments = { exposure: number; contrast: number; highlights: number; shadows: number; temperature: number; tint: number; vibrance: number; saturation: number };

let basePixels: ImageData | null = null;
let lastMaskSignature = '';
let renderQueued = false;

function mask() { return document.querySelector<HTMLCanvasElement>('.mask-data-canvas'); }
function display() { return document.querySelector<HTMLCanvasElement>('.image-display'); }

function readLocal(): LocalAdjustments {
  const get = (name: string) => Number(document.querySelector<HTMLInputElement>(`.mask-v2-panel input[data-local="${name}"]`)?.value || 0);
  return { exposure: get('Exposure'), contrast: get('Contrast'), highlights: get('Highlights'), shadows: get('Shadows'), temperature: get('Temperature'), tint: get('Tint'), vibrance: get('Vibrance'), saturation: get('Saturation') };
}

function clamp(v: number) { return Math.max(0, Math.min(255, v)); }
function smoothstep(edge0: number, edge1: number, value: number) { const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); }

function applyLocal(source: ImageData, adjustments: LocalAdjustments) {
  const data = source.data;
  const exposure = Math.pow(2, adjustments.exposure);
  const contrast = 1 + adjustments.contrast / 100;
  const saturation = 1 + adjustments.saturation / 100;
  const vibrance = adjustments.vibrance / 100;
  const temperature = adjustments.temperature / 100;
  const tint = adjustments.tint / 100;
  const highlights = adjustments.highlights / 100;
  const shadows = adjustments.shadows / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * exposure, g = data[i + 1] * exposure, b = data[i + 2] * exposure;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const shadowWeight = 1 - smoothstep(0.15, 0.55, lum);
    const highlightWeight = smoothstep(0.45, 0.9, lum);
    const sh = shadows >= 0 ? shadows * 70 * shadowWeight : shadows * 55 * shadowWeight;
    const hi = highlights >= 0 ? highlights * 55 * highlightWeight : highlights * 55 * highlightWeight;
    r += sh + hi; g += sh + hi; b += sh + hi;
    r = (r - 127.5) * contrast + 127.5;
    g = (g - 127.5) * contrast + 127.5;
    b = (b - 127.5) * contrast + 127.5;
    r += temperature * 32 + tint * 18;
    b -= temperature * 32 - tint * 18;
    g -= tint * 22;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const boost = vibrance * (1 - Math.min(1, (Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r)) / 382));
    const sat = saturation + boost;
    r = gray + (r - gray) * sat;
    g = gray + (g - gray) * sat;
    b = gray + (b - gray) * sat;
    data[i] = clamp(r); data[i + 1] = clamp(g); data[i + 2] = clamp(b);
  }
  return source;
}

function signature(data: Uint8ClampedArray) {
  let value = 2166136261;
  const step = Math.max(4, Math.floor(data.length / 256));
  for (let i = 0; i < data.length; i += step) value = Math.imul(value ^ data[i], 16777619);
  return String(value >>> 0);
}

function applyMaskToDisplay(captureBase: boolean) {
  const out = display();
  const m = mask();
  if (!out || !m || !m.width || !m.height || out.width !== m.width || out.height !== m.height) return;
  const outCtx = out.getContext('2d', { willReadFrequently: true });
  const maskCtx = m.getContext('2d', { willReadFrequently: true });
  if (!outCtx || !maskCtx) return;

  const maskPixels = maskCtx.getImageData(0, 0, m.width, m.height);
  let hasMask = false;
  for (let i = 3; i < maskPixels.data.length; i += 64) {
    if (maskPixels.data[i] > 0) { hasMask = true; break; }
  }
  if (!hasMask) { basePixels = outCtx.getImageData(0, 0, out.width, out.height); return; }

  if (captureBase || !basePixels || basePixels.width !== out.width || basePixels.height !== out.height) {
    basePixels = outCtx.getImageData(0, 0, out.width, out.height);
  }

  const local = new ImageData(new Uint8ClampedArray(basePixels.data), basePixels.width, basePixels.height);
  applyLocal(local, readLocal());
  for (let i = 0; i < local.data.length; i += 4) {
    const a = maskPixels.data[i + 3] / 255;
    if (a <= 0) continue;
    local.data[i] = basePixels.data[i] + (local.data[i] - basePixels.data[i]) * a;
    local.data[i + 1] = basePixels.data[i + 1] + (local.data[i + 1] - basePixels.data[i + 1]) * a;
    local.data[i + 2] = basePixels.data[i + 2] + (local.data[i + 2] - basePixels.data[i + 2]) * a;
  }
  outCtx.putImageData(local, 0, 0);
  lastMaskSignature = signature(maskPixels.data);
}

function queueRender(captureBase = true) {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    renderQueued = false;
    applyMaskToDisplay(captureBase);
  }));
}

function bind() {
  const canvas = display();
  const m = mask();
  if (canvas && m) {
    queueRender(true);
    const localPanel = document.querySelector('.mask-v2-panel');
    if (localPanel && !localPanel.getAttribute('data-render-bound')) {
      localPanel.setAttribute('data-render-bound', '1');
      localPanel.addEventListener('input', event => {
        if ((event.target as HTMLElement)?.matches('input[data-local]')) queueRender(true);
      });
    }
    document.querySelectorAll<HTMLInputElement>('.rightbar .slider-row input[type="range"]').forEach(input => {
      if (input.closest('section')?.querySelector('h3')?.textContent?.trim().toUpperCase() === 'MASKING') return;
      if (input.dataset.maskRenderBound) return;
      input.dataset.maskRenderBound = '1';
      input.addEventListener('input', () => queueRender(true));
    });
    const pixels = m.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, m.width, m.height).data;
    if (pixels) {
      const current = signature(pixels);
      if (current !== lastMaskSignature) queueRender(false);
    }
  }
  requestAnimationFrame(bind);
}

bind();
