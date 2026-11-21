import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Rig,readGLB,writeClips,makeClip,V,curve} from './rig-tools.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
export const horseSource=readGLB(path.join(dir,'Horse.normalized.glb'));
export const horseRig=new Rig(horseSource);
horseRig.sample('Armature|Idle',0);const base=horseRig.capture(),r=horseRig;
const feet={},footQ={};
for(let p of ['Front','Back'])for(let s of ['L','R']){let n=p+'Foot'+s;feet[n]=r.pos(n);footQ[n]=r.quat(n);}
const body=r.pos('Body');
const stride=(u,span,lift,duty)=>{u=(u%1+1)%1;if(u<duty)return [span*(1-2*u/duty),0];let t=(u-duty)/(1-duty);return [-span+2*span*(t*t*(3-2*t)),lift*Math.sin(Math.PI*t)];};
function leg(p,s,point){const name=p+'Foot'+s;r.setPos(name,point);r.setQ(name,footQ[name]);r.limb(p+'UpLeg'+s,p+'LowLeg'+s,p+'LowLeg'+s+'_end',point,V([point.x,p==='Back'?.6:.4,point.z+(p==='Back'?-.8:.9)]));}
export function horsePose(kind,u){
 r.restore(base);
 if(kind==='Rear'){
  let k=curve(u,[[0,0],[.16,-.08],[.48,1],[.66,1],[.90,0],[1,0]]),angle=-48*k*Math.PI/180;
  // The body rotates about the planted hind-hoof line, leaving root motion at zero.
  const pivot=V([0,.021,-.66]),q=r.quat('Body');
  const rot=new (q.constructor)().setFromAxisAngle(V([1,0,0]),angle);
  r.setPos('Body',body.clone().sub(pivot).applyQuaternion(rot).add(pivot));r.setQ('Body',rot.multiply(q));
  r.turn('Neck',[1,0,0],18*k);r.turn('Head',[1,0,0],12*k);
  for(let s of ['L','R']){
   leg('Back',s,feet['BackFoot'+s]);
   let rise=Math.max(0,k),p=feet['FrontFoot'+s].clone().sub(pivot).applyAxisAngle(V([1,0,0]),-48*rise*Math.PI/180).add(pivot);p.y+=.18*rise;p.z-=.20*rise;
   leg('Front',s,p);
  }
 }else{
  const gallop=kind==='Gallop',cycle=u*Math.PI*2;
  r.setPos('Body',body.clone().add(V([0,(gallop?-.21:-.06)+(gallop?.033:.016)*Math.sin(cycle*(gallop?1:2)),0])));
  r.turn('Body',[1,0,0],gallop?3+4*Math.cos(cycle):1.4*Math.cos(cycle*2));
  r.turn('Neck',[1,0,0],gallop?12+3*Math.cos(cycle):2*Math.sin(cycle*2));r.turn('Head',[1,0,0],gallop?5:0);
  const phase=gallop?{BackL:0,BackR:.12,FrontL:.48,FrontR:.60}:{FrontL:0,BackR:0,FrontR:.5,BackL:.5};
  for(let p of ['Front','Back'])for(let s of ['L','R']){
   // Long strides, so the hooves sweep back at the speeds horses move in the game: about 5.5 m/s planted
   // at a gallop's own pace and 2.3 m/s at a trot's (Claude, 2026-11-21; they were 3.2 and 0.75). The body
   // sits a little lower so the legs reach the longer strides.
   const [z,y]=stride(u+phase[p+s],gallop?.42:.32,gallop?.26:.15,gallop?.23:.42),point=feet[p+'Foot'+s].clone();point.z+=z;point.y+=y;
   leg(p,s,point);
  }
  r.turn('Tail1',[1,0,0],gallop?-14:-3);r.turn('Tail2',[0,0,1],5*Math.sin(cycle));
 }
 r.update();
}
export const horseClips=[
 makeClip(r,'Gallop',20,true,(t,u)=>horsePose('Gallop',u),{gait:'four-beat charge',cycleSeconds:20/30}),
 makeClip(r,'Rear',60,false,(t,u)=>horsePose('Rear',u),{events:[{time:1,event:'rear-apex'},{time:1.8,event:'forefeet-land'}]}),
 makeClip(r,'Trot',20,true,(t,u)=>horsePose('Trot',u),{gait:'diagonal pairs',cycleSeconds:20/30})
];
export function saveHorse(){console.log('Horse maximum limb reach excess',r.maxLimbError);writeClips(horseSource,horseClips,path.join(dir,'../clips-horse.glb'));}
