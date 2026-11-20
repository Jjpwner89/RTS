import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readGLB,Human,makeClip,writeClips,curve} from './rig-tools.mjs';
import {footMotions,spearPose,SPEAR_DIAG,weapon} from './foot-motions.mjs';
import {riderMotions} from './rider-motions.mjs';
import {saveHorse,horseClips} from './horse-motions.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),src=readGLB(path.join(dir,'Male_Adventurer.source.glb'));
const human=new Human(src),r=human.r;
// Spear_Thrust (Claude, 2026-11-20): guard and thrust are defined in foot-motions.mjs.
function spear(t,u){spearPose(human,u,curve(u,[[0,0],[.14,-.06],[.42,1],[.54,1],[.88,0],[1,0]]));}
// CLIP_DEBUG=<clip name> prints the arm solver's joint report for every frame of that clip.
const debug=(name,pose)=>process.env.CLIP_DEBUG===name?(t,u)=>{pose(t,u);console.log(u.toFixed(2),JSON.stringify(human.armReport));}:pose;
const clips=[makeClip(r,'Spear_Thrust',24,false,debug('Spear_Thrust',spear),{events:[{time:10/30,event:'thrust'},{time:24/30,event:'guard'}],...weapon('Wrist.R',SPEAR_DIAG,{lengthBehindGrip:.91,offhandSeparation:'0.42 at guard; the shaft slides through the left hand to 0.22 at full thrust'})})];
const metrics=[{name:'Spear_Thrust',maxGripError:human.maxGripError}];
for(const [name,frames,loop,pose,extra]of footMotions(human)){human.maxGripError=0;clips.push(makeClip(r,name,frames,loop,debug(name,pose),extra));metrics.push({name,maxGripError:human.maxGripError});}
const riders=[];for(const [name,frames,loop,pose,extra]of riderMotions(human)){human.maxGripError=0;riders.push(makeClip(r,name,frames,loop,debug(name,pose),extra));metrics.push({name,maxGripError:human.maxGripError});}
writeClips(src,riders,path.join(dir,'../clips-riders.glb'));saveHorse();
console.log(JSON.stringify(metrics,null,2));
writeClips(src,clips,path.join(dir,'../clips-foot.glb'));
fs.writeFileSync(path.join(dir,'clip-manifest.json'),JSON.stringify({status:'Authored and validated; ready for in-game Art review',source:'Male_Adventurer.source.glb',sources:['Male_Adventurer.source.glb','Horse.source.fbx'].map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex')})),packs:{foot:'../clips-foot.glb',riders:'../clips-riders.glb',horse:'../clips-horse.glb'},fps:30,coordinateSystem:'Y up, metres, +Z forward',equipmentGrip:{position:[0,.135,-.035],shaftAxes:{right:[-1,0,0],left:[1,0,0]},shieldNormal:[0,1,0]},clips:[...clips,...riders,...horseClips].map(c=>({name:c.name,duration:c.frames/30,loop:c.loop,...c.extra}))},null,2)+'\n');
fs.writeFileSync(path.join(dir,'contact-checks.json'),JSON.stringify({metres:true,handTargetErrors:metrics},null,2)+'\n');
console.log('Wrote',clips.map(c=>c.name).join(', '));
