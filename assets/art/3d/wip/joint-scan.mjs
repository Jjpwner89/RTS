// Joint-range scan of the arm chain in every human clip (Claude, 2026-11-20).
// A triage aid only: it points at frames worth looking at; it never approves a pose.
// Angles are relative to the rest pose (arms hanging, palms in), as in rig-tools armAngles:
// fore = forearm twist against the upper arm; flex/dev = wrist bend, dev > 0 toward the thumb.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {readGLB,Rig,V,armAngles} from './rig-tools.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),deg=x=>x*180/Math.PI;
const rest=new Rig(readGLB(path.join(dir,'Male_Adventurer.source.glb')));rest.sample('Idle_Neutral',0);const base=rest.capture();
export function scan(pack,names){
 const src=readGLB(path.join(dir,'..',pack)),r=new Rig(src),h={r,base},out=[];
 for(const a of src.j.animations){if(names&&!names.includes(a.name))continue;
  const frames=Math.round(30*Math.max(...a.samplers.map(s=>src.j.accessors[s.input].max[0]))),worst={};
  for(let f=0;f<=frames;f++){r.sample(a.name,f/30);
   for(const s of ['R','L']){
    const S=r.pos('UpperArm.'+s),E=r.pos('LowerArm.'+s),W=r.pos('Wrist.'+s),up=E.clone().sub(S).normalize(),fo=W.clone().sub(E).normalize();
    // Elbows bend toward the front of the upper arm (+Z at rest); the other way is broken.
    const front=V([0,0,1]).applyQuaternion(rest.quat('UpperArm.'+s).invert()).applyQuaternion(r.quat('UpperArm.'+s));
    const elbow=deg(up.angleTo(fo)),back=elbow>15&&fo.clone().addScaledVector(up,-fo.dot(up)).normalize().dot(front)<-.3;
    const g=Object.fromEntries(Object.entries(armAngles(h,s)).map(([k,v])=>[k,Math.round(v)]));
    const bad=(back?100:0)+Math.max(0,Math.abs(g.fore)-90)+2*Math.max(0,Math.abs(g.wristTwist)-20)+Math.max(0,Math.abs(g.flex)-60)+Math.max(0,-g.dev-45)+2*Math.max(0,g.dev-20);
    if(!worst[s]||bad>worst[s].bad)worst[s]={f,elbow:Math.round(elbow),back,...g,bad:Math.round(bad)};
   }}
  out.push({clip:a.name,...worst});
 }
 return out;
}
if(import.meta.url===`file://${process.argv[1]}`)for(const pack of process.argv.slice(2).length?process.argv.slice(2):['clips-foot.glb','clips-riders.glb'])for(const row of scan(pack))for(const s of ['R','L'])console.log(row.clip.padEnd(14),s,JSON.stringify(row[s]));
