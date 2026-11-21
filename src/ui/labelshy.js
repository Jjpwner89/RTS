// World-map place labels step aside from the panels and news strips drawn over them (QC: the Goals
// panel and the news line cut "Wolcombe" to "LWICK"). A label that a panel hides most of fades out
// (or the window's edge) instead of showing a torn half; it is back as soon as the panel folds, moves or goes. The labels
// are drawn once a frame by the map; this looks at them four times a second.
const COVER = '#top, #wpanel, #goals, #alerts, #log > div:not(.fade), #herald.show, #info, #stock, #build, #orders, #cards';
let last = 0;

function tick(now) {
  requestAnimationFrame(tick);
  if (now - last < 250 || !document.body.classList.contains('mode-world')) return;
  last = now;
  const boxes = [...document.querySelectorAll(COVER)].filter(b => b.getClientRects().length).map(b => b.getBoundingClientRect());
  for (const l of document.querySelectorAll('#world-labels .wlabel.place')) {
    const r = l.getBoundingClientRect();
    // A label running off the window's edge is as torn as one under a panel.
    let hidden = 1 - (Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))) / (r.width * r.height || 1);
    for (const b of boxes) {
      const w = Math.min(r.right, b.right) - Math.max(r.left, b.left), h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (w > 0 && h > 0) hidden = Math.max(hidden, (w * h) / (r.width * r.height || 1));
    }
    l.classList.toggle('shy', hidden > 0.2);
  }
}
requestAnimationFrame(tick);
