// The next thing to do, shown by a slow glow on the button or place that does it (campaign.js goalNudge).
// One element at a time; setting null puts it out.
let cur = null;
export function nudge(el) {
  if (cur === el || (!el && !cur)) return;
  cur?.classList.remove('goal-pulse');
  cur = el || null;
  cur?.classList.add('goal-pulse');
}
