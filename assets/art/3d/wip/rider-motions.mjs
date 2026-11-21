import {V,curve} from './rig-tools.mjs';
import {horseRig,horsePose} from './horse-motions.mjs';
import {keyed,weapon,SPEAR_DIAG,SWORD_DIAG} from './foot-motions.mjs';
horseRig.sample('Armature|Idle',0);
const referenceSeat=V([0,1.185,-.0666]),seatLocal=horseRig.by.Body.worldToLocal(referenceSeat.clone());
export function riderMotions(h){
 const r=h.r,TAU=Math.PI*2;
 function seated(kind,u,weapon=false){
  h.reset();const trot=kind==='Trot',gallop=kind==='Gallop';let shift=V([0,.004*Math.sin(TAU*u),0]);
  if(trot||gallop){horsePose(kind,u);shift=horseRig.by.Body.localToWorld(seatLocal.clone()).sub(referenceSeat);}
  const bounce=shift.y;h.body(1.155+bounce,-.10+shift.z,trot?5:gallop?19-2*Math.cos(TAU*u):1,0,shift.x);
  h.legs([.35+shift.x,.57+bounce,.13+shift.z],[-.35+shift.x,.57+bounce,.13+shift.z],{L:V([.58+shift.x,.93+bounce,.50+shift.z]),R:V([-.58+shift.x,.93+bounce,.50+shift.z])});
  r.turn('Foot.L',[0,1,0],12);r.turn('Foot.R',[0,1,0],-12);
  h.hand('L',[.10+shift.x,1.39+bounce,.28+shift.z],null,[0,-1,0]);
  if(!weapon)h.hand('R',[-.10+shift.x,1.39+bounce,.28+shift.z],null,[0,-1,0]);
  r.turn('Head',[1,0,0],gallop?-5:0);
 }
 return [
 ['Ride_Idle',90,true,(t,u)=>seated('Idle',u),{horseClip:'Idle',seatHeight:1.185}],
 ['Ride_Trot',20,true,(t,u)=>seated('Trot',u),{horseClip:'Trot',phase:0,seatHeight:1.185}],
 ['Ride_Gallop',20,true,(t,u)=>seated('Gallop',u),{horseClip:'Gallop',phase:0,seatHeight:1.185}],
 // Couch and Slash (Claude, 2026-11-20): the sword arm is keyed by upper-arm and forearm
 // directions plus the wanted weapon direction, and Human.aimFk keeps the wrist natural.
 ['Ride_Couch',30,false,(t,u)=>{
  // Lance carried angled up at rest, then lowered and couched: upper arm tucked to the side,
  // forearm forward, the point over the horse's neck a little to the left.
  seated('Idle',0,true);const k=curve(u,[[0,0],[.15,0],[.70,1],[1,1]]);r.turn('Torso',[1,0,0],14*k);r.turn('Head',[1,0,0],-7*k);
  keyed(h,'R',[[0,[-.26,-.97,0],[.43,-.5,.75],[0,.87,.5]],[1,[-.25,-.95,.15],[0,-.26,.97],[.15,.05,1]]],k,{diag:SPEAR_DIAG});
 },{hold:true,horseClip:'Idle',upperBodyOverlay:'Ride_Gallop',...weapon('Wrist.R',SPEAR_DIAG,{lengthBehindGrip:.9}),events:[{time:.7,event:'lance-couched'}]}],
 ['Ride_Slash',27,false,(t,u)=>{
  // Sword ready point-up, raised back over the right shoulder, cut forward and down to the
  // right side, then back to ready.
  seated('Idle',0,true);const up=curve(u,[[0,0],[.30,1],[.42,1],[.69,0],[1,0]]),cut=curve(u,[[0,0],[.43,0],[.69,1],[1,0]]);
  r.turn('Torso',[0,1,0],-20*up+24*cut);r.turn('Torso',[1,0,0],8*cut);
  const READY=[[0,-.97,-.26],[0,-.5,.87],[0,.7,1]],RAISED=[[-.75,-.5,.43],[.13,.97,-.22],[-.2,.2,-1]],CUT=[[-.43,-.5,.75],[-.43,-.5,.75],[-.3,-.3,1]],
   OVER=[[-.6,.2,.75],[-.2,.7,.68],[-.3,1,.2]];
  keyed(h,'R',[[0,...READY],[.30,...RAISED],[.42,...RAISED],[.55,...OVER],[.69,...CUT],[1,...READY]],u,{diag:SWORD_DIAG});
 },{horseClip:'Idle',...weapon('Wrist.R',SWORD_DIAG),events:[{time:.60,event:'sword-contact'}]}]
 ];
}
