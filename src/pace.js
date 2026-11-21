// How fast figures walk, m/s: the one table for pace B (DESIGN_NOTES "Walking pace"). Normal movement is a walk,
// so the walk clips plant their feet; running (charging, fleeing, routing, a Run order) is a unit's own
// battle.js T.speed. Kept free of three.js so the game logic can read it; anim.js re-exports it.
// The clips' measured strides (anim.js gaitSpeed): a man walks 1.35 and runs 3.03, a horse trots 2.28 and
// gallops 5.36, a dog walks 0.96, trots 1.89 and runs 4.53. Each gait plays from 0.6× to 1.6× its stride.
export const PACE = {
  foot: 1.6,      // soldiers in formation, and villagers about their work (economy.js WALK)
  horse: 1.8,     // a slow trot: a horse has no walk clip yet, and its trot (2.28) can't slow below ~1.4
  dog: 2.4,       // a dog trots alongside the men
  wander: 1.0,    // a villager strolling with nothing to do: slow enough to read as idle, still a walk round a corner
};
// The walking speed of a battle unit type: its kind's pace, never faster than it can run. Engines crawl at
// their own speed either way.
export const walkSpeed = T => Math.min(T.speed, T.engine ? T.speed : T.mounted ? PACE.horse : T.dog ? PACE.dog : PACE.foot);
