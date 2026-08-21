type Point = { x: number; y: number };

type PanState = {
  x: number;
  y: number;
  dragging: boolean;
  pointerId: number | null;
  startPointer: Point;
  startPan: Point;
};

const panByStage = new WeakMap<HTMLElement, PanState>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resetPan(stage: HTMLElement, stack: HTMLElement) {
  const state = panByStage.get(stage);
  if (!state) return;
  state.x = 0;
  state.y = 0;
  stack.style.translate = "0px 0px";
}

function getPanBounds(stage: HTMLElement, stack: HTMLElement) {
  const rect = stack.getBoundingClientRect();
  const maxX = Math.max(0, (rect.width - stage.clientWidth) / 2);
  const maxY = Math.max(0, (rect.height - stage.clientHeight) / 2);
  return { maxX, maxY };
}

function clampPan(stage: HTMLElement, stack: HTMLElement) {
  const state = panByStage.get(stage);
  if (!state) return;
  const { maxX, maxY } = getPanBounds(stage, stack);
  state.x = clamp(state.x, -maxX, maxX);
  state.y = clamp(state.y, -maxY, maxY);
  stack.style.translate = `${state.x}px ${state.y}px`;
}

function install(stage: HTMLElement) {
  if (panByStage.has(stage)) return;

  const stack = stage.querySelector<HTMLElement>(".image-stack");
  if (!stack) return;

  const state: PanState = {
    x: 0,
    y: 0,
    dragging: false,
    pointerId: null,
    startPointer: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
  };
  panByStage.set(stage, state);

  stage.style.touchAction = "none";
  stage.style.userSelect = "none";

  const updateCursor = () => {
    const { maxX, maxY } = getPanBounds(stage, stack);
    const pannable = maxX > 1 || maxY > 1;
    stage.style.cursor = state.dragging ? "grabbing" : pannable ? "grab" : "default";
  };

  stage.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".zoom-bar, button, input")) return;

    const { maxX, maxY } = getPanBounds(stage, stack);
    if (maxX <= 1 && maxY <= 1) return;

    state.dragging = true;
    state.pointerId = event.pointerId;
    state.startPointer = { x: event.clientX, y: event.clientY };
    state.startPan = { x: state.x, y: state.y };
    stage.setPointerCapture(event.pointerId);
    updateCursor();
    event.preventDefault();
  });

  stage.addEventListener("pointermove", event => {
    if (!state.dragging || state.pointerId !== event.pointerId) return;

    const { maxX, maxY } = getPanBounds(stage, stack);
    state.x = clamp(state.startPan.x + event.clientX - state.startPointer.x, -maxX, maxX);
    state.y = clamp(state.startPan.y + event.clientY - state.startPointer.y, -maxY, maxY);
    stack.style.translate = `${state.x}px ${state.y}px`;
    event.preventDefault();
  });

  const endDrag = (event: PointerEvent) => {
    if (!state.dragging || state.pointerId !== event.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    try { stage.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
    clampPan(stage, stack);
    updateCursor();
  };

  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("lostpointercapture", () => {
    state.dragging = false;
    state.pointerId = null;
    clampPan(stage, stack);
    updateCursor();
  });

  const fitButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".zoom-bar button"))
    .find(button => button.textContent?.trim().toUpperCase() === "FIT");
  fitButton?.addEventListener("click", () => resetPan(stage, stack));

  const observer = new MutationObserver(() => {
    requestAnimationFrame(() => {
      clampPan(stage, stack);
      updateCursor();
    });
  });
  observer.observe(stack, { attributes: true, attributeFilter: ["style"] });

  window.addEventListener("resize", () => {
    clampPan(stage, stack);
    updateCursor();
  });

  updateCursor();
}

const observer = new MutationObserver(() => {
  document.querySelectorAll<HTMLElement>(".image-stage").forEach(install);
});

observer.observe(document.documentElement, { childList: true, subtree: true });
document.querySelectorAll<HTMLElement>(".image-stage").forEach(install);
