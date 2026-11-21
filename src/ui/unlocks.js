// What the interface shows at each step of the climb (DESIGN_NOTES, "An interface that grows
// with rank"). One table: every screen asks it, so nothing is gated two ways. A key with no
// entry is always shown; with no world (the village and battle test pages) everything is.
// `intro` is the one line that introduces it the first time it appears (news.js).
const ORDER = ['Reeve', 'Lord', 'Count', 'Duke', 'King'];
export const rankAtLeast = (w, r) => ORDER.indexOf(w.crowned ? 'King' : w.rank) >= ORDER.indexOf(r);
const rank = r => w => rankAtLeast(w, r);

export const UNLOCKS = {
  realm: { when: rank('Lord'), intro: 'New: the Realm screen brings every place you hold together: villages, supplies, vassals and the purse.' },
  towns: { when: rank('Lord'), intro: 'New: town templates lay out a whole quarter of buildings at once.' },
  masons: { when: rank('Lord') },
  greatkeep: { when: rank('Lord') },
  'b:hall': { when: rank('Count'), intro: "New: a knights' hall trains your veterans into men-at-arms and knights." },
  'b:cathedral': { when: rank('Count'), intro: 'New: a cathedral, the showpiece of a realm, in a village of 100 people.' },
  // Sellsword companies wait at market towns: worth a section once you have seen one of them.
  companies: { when: w => (w.companies || []).some(c => c.employer === 0 || w.byId[c.home]?.seen) },
};

export function unlocked(w, key) {
  if (!w) return true;
  const U = UNLOCKS[key];
  return !U || !!U.when(w);
}

// Introductions already shown in this campaign, saved with it (save.js WORLD_KEYS). A save
// from before this existed counts everything it has already unlocked as seen, so a player
// who is already a lord isn't told about the Realm screen they have been using. A test
// campaign starts with none seen, so its rank's introductions can be tried.
function seenList(w) {
  if (!w.uiSeen) w.uiSeen = w.time > 60 && !w.options?.test ?Object.keys(UNLOCKS).filter(k => UNLOCKS[k].intro && unlocked(w, k)) : [];
  return w.uiSeen;
}
export const isFresh = (w, key) => !!w && !!UNLOCKS[key]?.intro && unlocked(w, key) && !seenList(w).includes(key);
export function markSeen(w, key) { if (w && !seenList(w).includes(key)) w.uiSeen.push(key); }
