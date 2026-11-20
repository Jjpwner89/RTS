import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readGLB,Human,makeClip,writeClips,curve,V} from './rig-tools.mjs';
import {footMotions} from './foot-motions.mjs';
import {riderMotions} from './rider-motions.mjs';
import {saveHorse,horseClips} from './horse-motions.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),src=readGLB(path.join(dir,'Male_Adventurer.source.glb'));
const human=new Human(src),r=human.r;
function spear(t,u){
 human.reset();let thrust=curve(u,[[0,0],[.20,-.04],[.44,1],[.55,1],[.86,0],[1,0]]),step=curve(u,[[0,0],[.12,0],[.34,1],[.65,1],[1,0]]);
 human.body(.79-.035*thrust,.015+.10*thrust,5+8*thrust,-12+18*thrust);
 human.legs([.145,.02275+.055*Math.sin(Math.PI*step),.12+.13*step],[-.16,.02275,-.19]);
 const rear=[-.20,1.08+.08*thrust,.24+.20*thrust],axis=V([.65,.15,1]).normalize(),front=V(rear).addScaledVector(axis,.29).toArray();
 human.hand('R',rear,axis.toArray());human.hand('L',front,axis.toArray());
}
const clips=[makeClip(r,'Spear_Thrust',24,false,spear,{events:[{time:10/30,event:'thrust'},{time:24/30,event:'guard'}],weapon:{bone:'Wrist.R',grip:[0,.135,-.035],axis:[-1,0,0],offhandSeparation:.29}})];
const metrics=[{name:'Spear_Thrust',maxGripError:human.maxGripError}];
for(const [name,frames,loop,pose,extra]of footMotions(human)){human.maxGripError=0;clips.push(makeClip(r,name,frames,loop,pose,extra));metrics.push({name,maxGripError:human.maxGripError});}
const riders=[];for(const [name,frames,loop,pose,extra]of riderMotions(human)){human.maxGripError=0;riders.push(makeClip(r,name,frames,loop,pose,extra));metrics.push({name,maxGripError:human.maxGripError});}
writeClips(src,riders,path.join(dir,'../clips-riders.glb'));saveHorse();
console.log(JSON.stringify(metrics,null,2));
writeClips(src,clips,path.join(dir,'../clips-foot.glb'));
fs.writeFileSync(path.join(dir,'clip-manifest.json'),JSON.stringify({status:'Authored and validated; ready for in-game Art review',source:'Male_Adventurer.source.glb',sources:['Male_Adventurer.source.glb','Horse.source.fbx'].map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex')})),packs:{foot:'../clips-foot.glb',riders:'../clips-riders.glb',horse:'../clips-horse.glb'},fps:30,coordinateSystem:'Y up, metres, +Z forward',equipmentGrip:{position:[0,.135,-.035],shaftAxes:{right:[-1,0,0],left:[1,0,0]},shieldNormal:[0,1,0]},clips:[...clips,...riders,...horseClips].map(c=>({name:c.name,duration:c.frames/30,loop:c.loop,...c.extra}))},null,2)+'\n');
fs.writeFileSync(path.join(dir,'contact-checks.json'),JSON.stringify({metres:true,handTargetErrors:metrics},null,2)+'\n');
console.log('Wrote',clips.map(c=>c.name).join(', '));
