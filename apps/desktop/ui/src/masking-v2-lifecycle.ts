function syncMaskToolVisibility() {
  const maskButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.leftbar button')).find(button => button.textContent?.trim().toUpperCase() === 'MASK');
  const active = !!maskButton?.classList.contains('selected') || (document.querySelector('footer')?.textContent?.toUpperCase() || '').includes('TOOL • BRUSH MASK');
  const panel = document.querySelector<HTMLElement>('.mask-v2-panel');
  const overlay = document.querySelector<HTMLCanvasElement>('.mask-overlay-canvas');
  if (panel) panel.style.display = active ? 'block' : 'none';
  if (overlay) overlay.style.pointerEvents = active ? 'auto' : 'none';
  requestAnimationFrame(syncMaskToolVisibility);
}

syncMaskToolVisibility();
