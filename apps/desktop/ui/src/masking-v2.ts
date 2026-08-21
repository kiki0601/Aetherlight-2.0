type BrushConfig = { size: number; feather: number; flow: number; erasing: boolean; overlay: boolean };

const DEFAULTS: BrushConfig = { size: 90, feather: 70, flow: 100, erasing: false, overlay: true };
let config: BrushConfig = { ...DEFAULTS };
let lastPoint: { x: number; y: number } | null = null;
let painting = false;
let installedCanvas: HTMLCanvasElement | null = null;
let panel: HTMLDivElement | null = null;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);

function isBrushActive() {
  const leftMask = Array.from(document.querySelectorAll<HTMLButtonElement>('.leftbar button')).find(b => b.textContent?.trim().toUpperCase() === 'MASK');
  const footer = $('footer')?.textContent?.toUpperCase() || '';
  return !!leftMask?.classList.contains('selected') || footer.includes('TOOL • BRUSH MASK');
}

function findOverlay() {
  return $('.mask-overlay-canvas') as HTMLCanvasElement | null;
}

function pointFromEvent(event: PointerEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.max(0, Math.min(canvas.width - 1, (event.clientX - rect.left) * canvas.width / rect.width)),
    y: Math.max(0, Math.min(canvas.height - 1, (event.clientY - rect.top) * canvas.height / rect.height)),
  };
}

function getMaskCanvas() {
  const overlay = findOverlay();
  if (!overlay) return null;
  return overlay.parentElement?.querySelector<HTMLCanvasElement>('.mask-data-canvas') || null;
}

function ensureMaskCanvas() {
  const overlay = findOverlay();
  if (!overlay) return null;
  let mask = overlay.parentElement?.querySelector<HTMLCanvasElement>('.mask-data-canvas');
  if (!mask) {
    mask = document.createElement('canvas');
    mask.className = 'mask-data-canvas';
    mask.width = overlay.width;
    mask.height = overlay.height;
    mask.style.display = 'none';
    overlay.parentElement?.appendChild(mask);
  }
  if (mask.width !== overlay.width || mask.height !== overlay.height) {
    mask.width = overlay.width;
    mask.height = overlay.height;
  }
  return mask;
}

function stamp(x: number, y: number) {
  const mask = ensureMaskCanvas();
  if (!mask) return;
  const ctx = mask.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const overlay = findOverlay();
  const rect = overlay?.getBoundingClientRect();
  const scale = rect?.width ? mask.width / rect.width : 1;
  const radius = Math.max(1, config.size * scale / 2);
  const feather = Math.max(0, Math.min(1, config.feather / 100));
  const inner = radius * (1 - feather);
  const left = Math.max(0, Math.floor(x - radius));
  const top = Math.max(0, Math.floor(y - radius));
  const right = Math.min(mask.width - 1, Math.ceil(x + radius));
  const bottom = Math.min(mask.height - 1, Math.ceil(y + radius));
  if (right < left || bottom < top) return;

  const image = ctx.getImageData(left, top, right - left + 1, bottom - top + 1);
  const flow = Math.max(0.01, Math.min(1, config.flow / 100));

  for (let yy = 0; yy < image.height; yy++) {
    for (let xx = 0; xx < image.width; xx++) {
      const px = left + xx;
      const py = top + yy;
      const distance = Math.hypot(px - x, py - y);
      if (distance > radius) continue;
      const normalized = inner >= radius ? 1 : distance <= inner ? 1 : 1 - (distance - inner) / Math.max(0.0001, radius - inner);
      const eased = normalized * normalized * (3 - 2 * normalized);
      const amount = Math.round(255 * eased * flow);
      const index = (yy * image.width + xx) * 4;
      const current = image.data[index + 3];
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = config.erasing ? Math.max(0, current - amount) : Math.max(current, amount);
    }
  }
  ctx.putImageData(image, left, top);
}

function stroke(from: { x: number; y: number } | null, to: { x: number; y: number }) {
  if (!from) {
    stamp(to.x, to.y);
    return;
  }
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const overlay = findOverlay();
  const rect = overlay?.getBoundingClientRect();
  const scale = rect?.width ? overlay!.width / rect.width : 1;
  const spacing = Math.max(1, config.size * scale * 0.12);
  const count = Math.max(1, Math.ceil(distance / spacing));
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    stamp(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
}

function refreshOverlay() {
  const overlay = findOverlay();
  const mask = getMaskCanvas();
  if (!overlay || !mask) return;
  const ctx = overlay.getContext('2d');
  const maskCtx = mask.getContext('2d', { willReadFrequently: true });
  if (!ctx || !maskCtx) return;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!config.overlay) return;
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

function nativeSetInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function findMaskRange(labelText: string) {
  const section = Array.from(document.querySelectorAll<HTMLElement>('.rightbar section')).find(s => s.querySelector('h3')?.textContent?.trim().toUpperCase() === 'MASKING');
  if (!section) return null;
  return Array.from(section.querySelectorAll<HTMLInputElement>('.slider-row input[type="range"]')).find(input => input.parentElement?.querySelector('label')?.textContent?.trim().toUpperCase() === labelText.toUpperCase()) || null;
}

function syncBrushValue(label: string, value: number) {
  const input = findMaskRange(label);
  if (input) nativeSetInput(input, String(value));
}

function clickMaskButton(text: string) {
  const section = Array.from(document.querySelectorAll<HTMLElement>('.rightbar section')).find(s => s.querySelector('h3')?.textContent?.trim().toUpperCase() === 'MASKING');
  const button = section ? Array.from(section.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim().toUpperCase() === text.toUpperCase()) : null;
  button?.click();
}

function buildPanel() {
  if (panel) return;
  panel = document.createElement('div');
  panel.className = 'mask-v2-panel';
  panel.innerHTML = `
    <div class="mask-v2-title"><strong>BRUSH MASK</strong><span>V2</span></div>
    <div class="mask-v2-row"><label>Size</label><input data-key="size" type="range" min="5" max="400" step="1" value="${config.size}"><output>${config.size}</output></div>
    <div class="mask-v2-row"><label>Feather</label><input data-key="feather" type="range" min="0" max="100" step="1" value="${config.feather}"><output>${config.feather}</output></div>
    <div class="mask-v2-row"><label>Flow</label><input data-key="flow" type="range" min="1" max="100" step="1" value="${config.flow}"><output>${config.flow}</output></div>
    <div class="mask-v2-actions"><button data-action="erase">ERASE</button><button data-action="overlay">OVERLAY</button></div>
    <div class="mask-v2-actions"><button data-action="invert">INVERT</button><button data-action="clear">CLEAR</button></div>
    <div class="mask-v2-subtitle">LOCAL ADJUSTMENTS</div>
    <div class="mask-v2-local"><div class="mask-v2-row"><label>Exposure</label><input data-local="Exposure" type="range" min="-5" max="5" step="0.01" value="0"><output>0.00</output></div>
    <div class="mask-v2-row"><label>Contrast</label><input data-local="Contrast" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
    <div class="mask-v2-row"><label>Highlights</label><input data-local="Highlights" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
    <div class="mask-v2-row"><label>Shadows</label><input data-local="Shadows" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
    <div class="mask-v2-row"><label>Temperature</label><input data-local="Temperature" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
    <div class="mask-v2-row"><label>Tint</label><input data-local="Tint" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
    <div class="mask-v2-row"><label>Vibrance</label><input data-local="Vibrance" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div>
    <div class="mask-v2-row"><label>Saturation</label><input data-local="Saturation" type="range" min="-100" max="100" step="1" value="0"><output>0</output></div></div>`;
  document.querySelector('.canvas')?.appendChild(panel);

  panel.querySelectorAll<HTMLInputElement>('input[data-key]').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.key as 'size' | 'feather' | 'flow';
      const value = Number(input.value);
      config[key] = value;
      (input.nextElementSibling as HTMLOutputElement).value = String(value);
      const labels: Record<string, string> = { size: 'Brush Size', feather: 'Feather', flow: 'Flow' };
      syncBrushValue(labels[key], value);
    });
  });

  panel.querySelectorAll<HTMLInputElement>('input[data-local]').forEach(input => {
    input.addEventListener('input', () => {
      const label = input.dataset.local!;
      const value = Number(input.value);
      (input.nextElementSibling as HTMLOutputElement).value = Math.abs(value) < 0.001 ? '0.00' : String(value);
      const target = findMaskRange(label);
      if (target) nativeSetInput(target, String(value));
    });
  });

  panel.querySelector('[data-action="erase"]')?.addEventListener('click', () => {
    config.erasing = !config.erasing;
    clickMaskButton(config.erasing ? 'ERASE' : 'PAINT');
    panel?.querySelector('[data-action="erase"]')!.textContent = config.erasing ? 'PAINT' : 'ERASE';
  });
  panel.querySelector('[data-action="overlay"]')?.addEventListener('click', () => {
    config.overlay = !config.overlay;
    clickMaskButton('OVERLAY');
    refreshOverlay();
  });
  panel.querySelector('[data-action="invert"]')?.addEventListener('click', () => clickMaskButton('INVERT'));
  panel.querySelector('[data-action="clear"]')?.addEventListener('click', () => clickMaskButton('CLEAR'));
}

function hideDuplicateRightMask() {
  const section = Array.from(document.querySelectorAll<HTMLElement>('.rightbar section')).find(s => s.querySelector('h3')?.textContent?.trim().toUpperCase() === 'MASKING');
  if (section) section.style.display = 'none';
}

function installCanvasHandlers() {
  const overlay = findOverlay();
  if (!overlay || overlay === installedCanvas) return;
  installedCanvas = overlay;
  overlay.style.touchAction = 'none';
  overlay.style.pointerEvents = 'auto';
  ensureMaskCanvas();

  document.addEventListener('pointerdown', event => {
    if (!isBrushActive() || event.target !== overlay) return;
    const point = pointFromEvent(event as PointerEvent, overlay);
    if (!point) return;
    painting = true;
    lastPoint = point;
    stamp(point.x, point.y);
    refreshOverlay();
  }, true);

  document.addEventListener('pointermove', event => {
    if (!isBrushActive() || !painting || event.target !== overlay) return;
    const point = pointFromEvent(event as PointerEvent, overlay);
    if (!point) return;
    stroke(lastPoint, point);
    lastPoint = point;
    refreshOverlay();
  }, true);

  const end = () => {
    if (!painting) return;
    painting = false;
    lastPoint = null;
    refreshOverlay();
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
}

function mount() {
  hideDuplicateRightMask();
  if (isBrushActive()) buildPanel();
  installCanvasHandlers();
  requestAnimationFrame(mount);
}

mount();
