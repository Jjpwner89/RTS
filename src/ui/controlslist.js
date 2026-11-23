// Every control in the game, on one screen (the game menu's Controls). Sections follow where you are:
// the world map, a village, a battle. Rows are [what you press, what it does].
const MAP = ['The world map', [
  ['Click', 'Select a place or an army'],
  ['Double-click a village of yours', 'Go into it'],
  ['Drag', 'Move the map (or W A S D, or the arrow keys)'],
  ['Scroll', 'Zoom in and out'],
  ['Middle-drag, or Q and E', 'Turn the map'],
  ['Right-click a place', 'March the selected army there (or press the March button on the place\'s card)'],
  ['Space', 'Pause and carry on'],
  ['1  2  3', 'Normal, double and fourfold speed'],
  ['Tab', 'The Realm screen: villages, supplies, vassals, houses and the purse'],
  ['Esc', 'Put away what is open, then deselect, then this menu'],
]];
const VILLAGE = ['In a village', [
  ['Click, or drag a box', 'Select regiments or a building'],
  ['Right-click', 'Move, or attack what is under the pointer; drag to set the line they form'],
  ['B, then a letter', 'Pick a building (the letter is shown on its button); right-click or Esc puts it away'],
  ['M', 'Back to the world map'],
  ['Space', 'Pause (you can still build and give orders)'],
  ['H  F', 'Halt the selection; centre the view on it'],
  ['Drag to the screen edge', 'Move the view (or W A S D, the arrows; Q and E turn it)'],
  ['Scroll', 'Zoom'],
  ['Esc', 'Cancel a placement, clear the selection, then this menu'],
]];
const BATTLE = ['In a battle', [
  ['Click, or drag a box', 'Select regiments (double-click: all of that kind)'],
  ['Right-click', 'Move or attack; drag to set the line they form'],
  ['N  T  L  V  X', 'Formation: line, tight, loose, wedge, schiltron'],
  ['C  G  R  Z', 'Charge; hold; fire at will; run'],
  ['H  F', 'Halt; centre the view on the selection'],
  ['U  B', 'Dig a mine or counter-mine at a wall; burn a bridge (when the field has them)'],
  ['Space', 'Pause'],
  ['−  +', 'Slower and faster'],
  ['Esc', 'Clear the selection, then this menu'],
]];

export function controlsFor() {
  const cls = document.body.className, page = location.pathname.split('/').pop();
  if (/mode-world/.test(cls)) return [MAP, VILLAGE, BATTLE];
  if (/mode-town/.test(cls) || page === 'town.html') return [VILLAGE, MAP, BATTLE];
  if (/mode-field/.test(cls) || page === 'battle.html') return [BATTLE, VILLAGE, MAP];
  if (page === 'muster.html') return [['The muster', [['Drag', 'Move the view'], ['Scroll', 'Zoom'], ['Esc', 'This menu']]]];
  return [MAP, VILLAGE, BATTLE];
}
