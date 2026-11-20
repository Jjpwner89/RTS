import {V,curve} from './rig-tools.mjs';
import {horseRig,horsePose} from './horse-motions.mjs';
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
 ['Ride_Trot',30,true,(t,u)=>seated('Trot',u),{horseClip:'Trot',phase:0,seatHeight:1.185}],
 ['Ride_Gallop',20,true,(t,u)=>seated('Gallop',u),{horseClip:'Gallop',phase:0,seatHeight:1.185}],
 ['Ride_Couch',30,false,(t,u)=>{
  seated('Idle',0,true);const k=curve(u,[[0,0],[.15,0],[.70,1],[1,1]]);r.turn('Torso',[1,0,0],14*k);r.turn('Head',[1,0,0],-7*k);
  h.hand('R',[-.22,1.40+.10*k,.10],[0,1-k, k],null);
 },{hold:true,horseClip:'Idle',upperBodyOverlay:'Ride_Gallop',events:[{time:.7,event:'lance-couched'}]}],
 ['Ride_Slash',27,false,(t,u)=>{
  seated('Idle',0,true);const up=curve(u,[[0,0],[.30,1],[.42,1],[.69,0],[1,0]]),cut=curve(u,[[0,0],[.43,0],[.69,1],[1,0]]);
  r.turn('Torso',[0,1,0],-20*up+24*cut);r.turn('Torso',[1,0,0],8*cut);
  h.hand('R',[-.25-.10*cut,1.42+.39*up-.13*cut,.12+.15*cut],[0,.65*up+.2,1],null);
 },{horseClip:'Idle',events:[{time:.60,event:'sword-contact'}]}]
 ];
}
