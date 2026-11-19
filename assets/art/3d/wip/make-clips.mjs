import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readGLB,Human,makeClip,writeClips,curve,V} from './rig-tools.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),src=readGLB(path.join(dir,'Male_Adventurer.source.glb'));
const human=new Human(src),r=human.r;
function spear(t,u){
 human.reset();let thrust=curve(u,[[0,0],[.20,-.04],[.44,1],[.55,1],[.86,0],[1,0]]),step=curve(u,[[0,0],[.12,0],[.34,1],[.65,1],[1,0]]);
 human.body(.79-.035*thrust,.015+.10*thrust,5+8*thrust,-12+18*thrust);
 human.legs([.145,.02275+.055*Math.sin(Math.PI*step),.12+.13*step],[-.16,.02275,-.19]);
 const rear=[-.19,1.19+.025*thrust,.015+.20*thrust],axis=V([.55,.06,1]).normalize(),front=V(rear).addScaledVector(axis,.29).toArray();
 human.hand('R',rear,axis.toArray());human.hand('L',front,axis.toArray());
}
const clips=[makeClip(r,'Spear_Thrust',24,false,spear,{events:[{time:10/30,event:'thrust'},{time:24/30,event:'guard'}],weapon:{bone:'Wrist.R',grip:[0,.135,-.035],axis:[1,0,0],offhandSeparation:.29}})];
writeClips(src,clips,path.join(dir,'../clips-foot.glb'));
fs.writeFileSync(path.join(dir,'clip-manifest.json'),JSON.stringify({source:'Male_Adventurer.source.glb',fps:30,clips:clips.map(c=>({name:c.name,duration:c.frames/30,loop:c.loop,...c.extra}))},null,2)+'\n');
console.log('Maximum grip error (m)',human.maxGripError);console.log('Wrote',clips.map(c=>c.name).join(', '));
