// A greyed button says why (GENRE_BASICS, "Tooltips on every button"). why(btn, reason)
// greys the button when there is a reason and clears it when there isn't; the reason rides in
// data-why, so the button keeps its own title and the tooltip (tooltip.js) adds the reason
// under it. Safe to call every frame: it only touches the button when something changed.
export function why(btn, reason) {
  if (!btn) return btn;
  const r = reason || '';
  if (btn.disabled !== !!r) btn.disabled = !!r;
  if ((btn.dataset.why || '') !== r) { if (r) btn.dataset.why = r; else delete btn.dataset.why; }
  return btn;
}
