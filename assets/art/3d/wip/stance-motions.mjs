// Holding stances for the baked soldiers (Claude, 2026-11-21). The game draws soldiers as meshes baked once in
// the source's Idle pose (tools/models/lineup); these one-pose clips give each kit arms that actually hold it.
// The bake plays Idle, then copies only the arm and finger joints of one side (or both, for _2H) from a stance,
// and hangs each weapon from the hand by the stance's grip (weapon metadata, as in the action clips).
// Directions are model space: +Z forward, +Y up, the figure's right hand toward -X.
import {V,gripAxis} from './rig-tools.mjs';
import {SPEAR_DIAG,SWORD_DIAG,TOOL_DIAG} from './foot-motions.mjs';

const FINGERS=/^(Index|Middle|Ring|Pinky|Thumb)/;
export function stanceMotions(h){
 const r=h.r;
 // The bake's body pose, with the given hands closed in the source's sword grip.
 function idle(...closed){r.sample('Idle',0.4);for(let i=0;i<r.nodes.length;i++){const n=r.nodes[i].name;if(FINGERS.test(n)&&closed.some(s=>n.endsWith('.'+s)))r.nodes[i].quaternion.copy(h.grip[i].q);}r.update();r.fkPrev={};}
 // Upper-arm and forearm directions whose natural wrist best grips `want` at `target` (as in the
 // armsearch tool): a coarse grid, scored by aim error, distance and joint effort.
 function reach(s,target,want,diag){
  const snap=r.capture(),dirs=[];
  for(let a=0;a<360;a+=20)for(let e=-80;e<=80;e+=10){const ar=a*Math.PI/180,er=e*Math.PI/180;dirs.push([Math.sin(ar)*Math.cos(er),Math.sin(er),Math.cos(ar)*Math.cos(er)]);}
  let best=null;
  for(const up of dirs){if((s==='R'?up[0]:-up[0])>.35||up[1]>.3)continue;
   for(const fore of dirs){if(V(up).angleTo(V(fore))>2.4)continue;
    r.restore(snap);r.fkPrev={};const x=h.aimFk(s,up,fore,want,{diag});
    const score=x.aimError+300*x.grip.distanceTo(V(target))+x.joints.reduce((a,v)=>a+Math.abs(v),0)/20;
    if(!best||score<best.score)best={score,up,fore};}}
  r.restore(snap);r.fkPrev={};return h.aimFk(s,best.up,best.fore,want,{diag});
 }
 const hold=(bone,diag)=>({bone,grip:[0,.135,-.035],axis:gripAxis(bone.endsWith('R')?'R':'L',diag).toArray().map(v=>+v.toFixed(4)),diag});
 return [
  // Spear (or lance, or javelin) upright at the right side, forearm forward, the fist thumb-up
  // around the shaft.
  ['Hold_Spear_R',1,false,()=>{idle('R');h.aimFk('R',[-.1,-1,-.05],[-.05,-.15,1],[0,1,.08],{diag:0});},{hold:{R:hold('Wrist.R',0)}}],
  // Sword, axe or hatchet held ready, point or head up and forward.
  ['Hold_Sword_R',1,false,()=>{idle('R');h.aimFk('R',[-.15,-.97,.1],[0,-.25,1],[0,.75,.65],{diag:SWORD_DIAG});},{hold:{R:hold('Wrist.R',SWORD_DIAG)}}],
  // Shield on the left forearm, carried across the front: the fist thumb-up on the grip, so the
  // shield's face (back of the hand) looks forward and a little out to the left.
  ['Hold_Shield_L',1,false,()=>{idle('L');h.aimFk('L',[.35,-1,.3],[-.75,-.12,.65],[0,1,0],{diag:0});},{shield:{bone:'Wrist.L',up:'hand +X',face:'hand +Z'}}],
  // Bow upright in the left fist, held low and a little forward.
  ['Hold_Bow_L',1,false,()=>{idle('L');h.aimFk('L',[.1,-1,0],[.05,-.5,.85],[0,1,.05],{diag:0});},{hold:{L:hold('Wrist.L',0)}}],
  // Two-handed axe across the body: right hand low at the end of the haft, left hand up it, the
  // head up by the left shoulder.
  ['Hold_Axe_2H',1,false,()=>{idle('R','L');const want=V([.42,.86,.28]).normalize();const g=h.aimFk('R',[-.15,-.97,.15],[.35,-.3,.9],want.toArray(),{diag:TOOL_DIAG});
   reach('L',g.grip.clone().addScaledVector(want,.42),want.toArray(),TOOL_DIAG);},{hold:{R:hold('Wrist.R',TOOL_DIAG)},offhand:.42}],
  // Crossbow held ready at the waist, barrel forward and a little down; the left hand under the
  // fore-stock.
  ['Hold_Crossbow_2H',1,false,()=>{idle('R','L');const g=h.aimFk('R',[-.15,-.97,.1],[.12,-.1,1],[0,-.2,1],{diag:30});
   reach('L',g.grip.clone().add(V([.04,-.03,.26])),[0,-.2,1],20);},{hold:{R:hold('Wrist.R',30)},crossbow:{barrel:[0,-.2,1],bow:[1,0,0],at:'right grip'}}],
 ];
}
