type CurveChannel = "rgb" | "red" | "green" | "blue";
type Point = { x: number; y: number };

const channels: Record<CurveChannel, Point[]> = {
  rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
};

let activeChannel: CurveChannel = "rgb";
let selectedPoint = -1;
let modal: HTMLDivElement | null = null;
let graph: HTMLCanvasElement | null = null;
let graphFrame = 0;

function clamp(v: number) { return Math.max(0, Math.min(1, v)); }
function sortPoints(points: Point[]) { points.sort((a, b) => a.x - b.x); }
function interpolate(points: Point[], x: number) {
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

function drawGraph() {
  if (!graph) return;
  const ctx = graph.getContext("2d"); if (!ctx) return;
  const w = graph.width, h = graph.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#101214"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const p = i / 4; ctx.beginPath(); ctx.moveTo(p * w, 0); ctx.lineTo(p * w, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p * h); ctx.lineTo(w, p * h); ctx.stroke(); }
  ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke();
  const pts = channels[activeChannel];
  ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 256; i++) { const x = i / 256, y = interpolate(pts, x); const px = x * w, py = (1 - y) * h; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.stroke();
  pts.forEach((p, index) => { ctx.beginPath(); ctx.fillStyle = index === selectedPoint ? "#ffffff" : "#9da3aa"; ctx.arc(p.x * w, (1 - p.y) * h, 5, 0, Math.PI * 2); ctx.fill(); });
}

function applyCurvesToCanvas() {
  const canvas = document.querySelector(".canvas canvas") as HTMLCanvasElement | null;
  if (!canvas || canvas.width === 0 || canvas.height === 0) return;
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const tables: Record<CurveChannel, Uint8Array> = { rgb: new Uint8Array(256), red: new Uint8Array(256), green: new Uint8Array(256), blue: new Uint8Array(256) };
  (Object.keys(tables) as CurveChannel[]).forEach(channel => { for (let i = 0; i < 256; i++) tables[channel][i] = Math.round(interpolate(channels[channel], i / 255) * 255); });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = tables.red[tables.rgb[data[i]]];
    data[i + 1] = tables.green[tables.rgb[data[i + 1]]];
    data[i + 2] = tables.blue[tables.rgb[data[i + 2]]];
  }
  ctx.putImageData(image, 0, 0);
}

function resetActive() { channels[activeChannel] = [{ x: 0, y: 0 }, { x: 1, y: 1 }]; selectedPoint = -1; drawGraph(); applyCurvesToCanvas(); }

function closeModal() { modal?.remove(); modal = null; graph = null; }

function openModal() {
  if (modal) return;
  modal = document.createElement("div"); modal.className = "curve-modal";
  modal.innerHTML = `<div class="curve-dialog"><div class="curve-header"><strong>CURVE EDITOR</strong><button data-curve-close>×</button></div><div class="curve-body"><div class="curve-tabs">${(["rgb", "red", "green", "blue"] as CurveChannel[]).map(c => `<button data-channel="${c}" class="${c === activeChannel ? "active" : ""}">${c.toUpperCase()}</button>`).join("")}</div><canvas class="curve-graph" width="560" height="420"></canvas><div class="curve-hint">Click to add a point · Drag to shape · Double-click a point to remove it</div></div><div class="curve-footer"><button data-curve-reset>RESET CHANNEL</button><button data-curve-done>DONE</button></div></div>`;
  document.body.appendChild(modal); graph = modal.querySelector(".curve-graph"); drawGraph();
  modal.querySelector("[data-curve-close]")?.addEventListener("click", closeModal);
  modal.querySelector("[data-curve-done]")?.addEventListener("click", closeModal);
  modal.querySelector("[data-curve-reset]")?.addEventListener("click", resetActive);
  modal.querySelectorAll("[data-channel]").forEach(button => button.addEventListener("click", () => { activeChannel = button.getAttribute("data-channel") as CurveChannel; selectedPoint = -1; modal?.querySelectorAll("[data-channel]").forEach(b => b.classList.toggle("active", b === button)); drawGraph(); applyCurvesToCanvas(); }));
  graph?.addEventListener("dblclick", event => { if (!graph) return; const r = graph.getBoundingClientRect(); const x = clamp((event.clientX - r.left) / r.width), y = clamp(1 - (event.clientY - r.top) / r.height); const points = channels[activeChannel]; let nearest = -1, distance = 0.035; points.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < distance && i !== 0 && i !== points.length - 1) { nearest = i; distance = d; } }); if (nearest >= 0) { points.splice(nearest, 1); selectedPoint = -1; drawGraph(); applyCurvesToCanvas(); } });
  graph?.addEventListener("pointerdown", event => { if (!graph) return; const r = graph.getBoundingClientRect(); const x = clamp((event.clientX - r.left) / r.width), y = clamp(1 - (event.clientY - r.top) / r.height); const points = channels[activeChannel]; let nearest = -1, distance = 0.035; points.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < distance) { nearest = i; distance = d; } }); if (nearest < 0) { points.push({ x, y }); sortPoints(points); selectedPoint = points.findIndex(p => p.x === x && p.y === y); } else selectedPoint = nearest; graph.setPointerCapture(event.pointerId); drawGraph(); });
  graph?.addEventListener("pointermove", event => { if (!graph || selectedPoint < 0 || !(event.buttons & 1)) return; const r = graph.getBoundingClientRect(); const points = channels[activeChannel]; const x = clamp((event.clientX - r.left) / r.width), y = clamp(1 - (event.clientY - r.top) / r.height); const minX = selectedPoint === 0 ? 0 : points[selectedPoint - 1].x + 0.002; const maxX = selectedPoint === points.length - 1 ? 1 : points[selectedPoint + 1].x - 0.002; points[selectedPoint] = { x: clamp(Math.min(maxX, Math.max(minX, x))), y }; drawGraph(); applyCurvesToCanvas(); });
  graph?.addEventListener("pointerup", () => { selectedPoint = -1; drawGraph(); });
}

function attach() {
  const buttons = Array.from(document.querySelectorAll("button"));
  const target = buttons.find(b => b.textContent?.trim() === "OPEN CURVE EDITOR");
  if (target && !(target as any).__aetherCurveAttached) { (target as any).__aetherCurveAttached = true; target.addEventListener("click", openModal); }
}

new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
attach();
