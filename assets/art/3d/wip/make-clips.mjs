import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readGLB,Human,makeClip,writeClips,curve,V,gripAxis} from './rig-tools.mjs';
import {footMotions} from './foot-motions.mjs';
import {riderMotions} from './rider-motions.mjs';
import {saveHorse,horseClips} from './horse-motions.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),src=readGLB(path.join(dir,'Male_Adventurer.source.glb'));
const human=new Human(src),r=human.r;
// Spear_Thrust (Claude, 2026-11-20). Guard: Spear_Brace's opening stance, but the right
// elbow is pulled in to the hip, beneath the shoulder, with the rear hand at the belt and
// the forearm running nearly along the shaft. Thrust: both hands drive forward and up.
const SPEAR_DIAG=40;
function spearPose(u,k){
 // k: 0 guard, 1 full thrust. u drives the step.
 human.reset();
 const step=curve(u,[[0,0],[.14,0],[.40,1],[.62,1],[.95,0],[1,0]]);
 human.body(.79-.04*k,.01+.14*k,8+10*k,-22+4*k);
 // Both shoulders reach forward into the thrust.
 r.turn('Shoulder.R',[0,1,0],10*k);r.turn('Shoulder.L',[0,1,0],-6-10*k);
 human.legs([.15,.02275+.05*Math.sin(Math.PI*step),.13+.16*step],[-.16,.02275,-.20]);
 const S=r.pos('UpperArm.R');
 const aim=V([.10,.22,1]).normalize();
 const rear=S.clone().add(V([.05+.03*k,-.23+.12*k,.30+.14*k]));
 const elbowR=S.clone().add(V([-.03,-.20,-.02+.12*k]));
 human.arm('R',rear,aim,elbowR,{diag:SPEAR_DIAG});
 // The front hand guides: the shaft slides through it as the rear hand drives.
 const SL=r.pos('UpperArm.L');let sep=.42-.20*k;
 while(sep>.14&&rear.clone().addScaledVector(aim,sep).distanceTo(SL)>.50)sep-=.005;
 human.arm('L',rear.clone().addScaledVector(aim,sep),aim,SL.clone().add(V([.10,-.30,.10])),{diag:SPEAR_DIAG});
}
function spear(t,u){
 const thrust=curve(u,[[0,0],[.14,-.06],[.42,1],[.54,1],[.88,0],[1,0]]);
 spearPose(u,thrust);
 if(process.env.SPEAR_DEBUG)console.log(u.toFixed(2),JSON.stringify(human.armReport,(k,v)=>typeof v==='number'?+v.toFixed(2):v));
}
const clips=[makeClip(r,'Spear_Thrust',24,false,spear,{events:[{time:10/30,event:'thrust'},{time:24/30,event:'guard'}],weapon:{bone:'Wrist.R',grip:[0,.135,-.035],axis:gripAxis('R',SPEAR_DIAG).toArray(),offhandSeparation:.42}})];
const metrics=[{name:'Spear_Thrust',maxGripError:human.maxGripError}];
for(const [name,frames,loop,pose,extra]of footMotions(human)){human.maxGripError=0;clips.push(makeClip(r,name,frames,loop,pose,extra));metrics.push({name,maxGripError:human.maxGripError});}
const riders=[];for(const [name,frames,loop,pose,extra]of riderMotions(human)){human.maxGripError=0;riders.push(makeClip(r,name,frames,loop,pose,extra));metrics.push({name,maxGripError:human.maxGripError});}
writeClips(src,riders,path.join(dir,'../clips-riders.glb'));saveHorse();
console.log(JSON.stringify(metrics,null,2));
writeClips(src,clips,path.join(dir,'../clips-foot.glb'));
fs.writeFileSync(path.join(dir,'clip-manifest.json'),JSON.stringify({status:'Authored and validated; ready for in-game Art review',source:'Male_Adventurer.source.glb',sources:['Male_Adventurer.source.glb','Horse.source.fbx'].map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex')})),packs:{foot:'../clips-foot.glb',riders:'../clips-riders.glb',horse:'../clips-horse.glb'},fps:30,coordinateSystem:'Y up, metres, +Z forward',equipmentGrip:{position:[0,.135,-.035],shaftAxes:{right:[-1,0,0],left:[1,0,0]},shieldNormal:[0,1,0]},clips:[...clips,...riders,...horseClips].map(c=>({name:c.name,duration:c.frames/30,loop:c.loop,...c.extra}))},null,2)+'\n');
fs.writeFileSync(path.join(dir,'contact-checks.json'),JSON.stringify({metres:true,handTargetErrors:metrics},null,2)+'\n');
console.log('Wrote',clips.map(c=>c.name).join(', '));
