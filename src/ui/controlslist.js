// Every control in the game, on one screen (the game menu's Controls). Sections follow where you are:
// the world map, a village, a battle. Rows are [what you press, what it does].
import { swipeMode } from './wheel.js';
const alt = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? 'Option' : 'Alt');
// The camera's wheel and trackpad, the same everywhere (ui/wheel.js).
const wheel = () => (swipeMode() === 'pan'
  ? [['Mouse wheel, or pinch', 'Zoom'], ['Two-finger swipe', 'Move the view']]
  : [['Mouse wheel, pinch or two-finger swipe', 'Zoom']]);
const MAP = ['The world map', [
  ['Click', 'Select a place or an army'],
  ['Double-click a village of yours', 'Go into it'],
  ['Drag', 'Move the map (or W A S D, or the arrow keys)'],
  ['Q and E, middle-drag, or ALT-drag', 'Turn the map'],
  ['Right-click a place', 'March the selected army there (or press the March button on the place\'s card)'],
  ['Space', 'Pause and carry on'],
  ['1  2  3', 'Normal, double and fourfold speed'],
  ['Tab', 'The Realm screen: villages, supplies, vassals, houses and the purse'],
  ['Esc', 'Put away what is open, then deselect, then this menu'],
]];
const VILLAGE = ['In a village', [
  ['Click, or drag a box', 'Select regiments or a building'],
  ['Right-click', 'Move, or attack what is under the pointer; drag to set the line they form'],
  ['Move or Attack button, then click', 'The same without a right button (on the bar over your regiments)'],
  ['B, then a letter', 'Pick a building (the letter is shown on its button); right-click or Esc puts it away'],
  ['M', 'Back to the world map'],
  ['Space', 'Pause (you can still build and give orders)'],
  ['H  F', 'Halt the selection; centre the view on it'],
  ['Drag to the screen edge', 'Move the view (or W A S D, the arrows)'],
  ['Q and E, middle-drag, or ALT-drag', 'Turn the view'],
  ['Esc', 'Cancel a placement, clear the selection, then this menu'],
]];
const BATTLE = ['In a battle', [
  ['Click, or drag a box', 'Select regiments (double-click: all of that kind)'],
  ['Right-click', 'Move or attack; drag to set the line they form'],
  ['Move or Attack button, then click', 'The same without a right button'],
  ['Q and E, middle-drag, or ALT-drag', 'Turn the view (W A S D, the arrows or the screen edge move it)'],
  ['N  T  L  V  X', 'Formation: line, tight, loose, wedge, schiltron'],
  ['C  G  R  Z', 'Charge; hold; fire at will; run'],
  ['H  F', 'Halt; centre the view on the selection'],
  ['U  B', 'Dig a mine or counter-mine at a wall; burn a bridge (when the field has them)'],
  ['Space', 'Pause'],
  ['−  +', 'Slower and faster'],
  ['Esc', 'Clear the selection, then this menu'],
]];

// Each section gets the wheel rows after its first, and Alt named as this computer names it.
const dressed = list => list.map(([title, rows]) => [title, [rows[0], ...wheel(), ...rows.slice(1)].map(([k, what]) => [k.replace('ALT', alt()), what])]);
export function controlsFor() { return dressed(sections()); }
function sections() {
  const cls = document.body.className, page = location.pathname.split('/').pop();
  if (/mode-world/.test(cls)) return [MAP, VILLAGE, BATTLE];
  if (/mode-town/.test(cls) || page === 'town.html') return [VILLAGE, MAP, BATTLE];
  if (/mode-field/.test(cls) || page === 'battle.html') return [BATTLE, VILLAGE, MAP];
  if (page === 'muster.html') return [['The muster', [['Drag', 'Move the view'], ['Esc', 'This menu']]]];
  return [MAP, VILLAGE, BATTLE];
}
