// Regression checks for the original-rig hand fix and spear torso clearance.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Rig,readGLB,accessor,T,V,Q} from './rig-tools.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const source=readGLB(path.join(dir,'Male_Adventurer.source.glb')),reference=new Rig(source);
reference.sample('Idle_Sword',.4);const closed=reference.capture();
reference.sample('Idle_Neutral',0);const relaxed=reference.capture();
const fingers=reference.nodes.map((n,i)=>/^(Index|Middle|Ring|Pinky|Thumb)/.test(n.name)&&n.name.endsWith('.R')?i:-1).filter(i=>i>=0);
const reports=[];
for(const pack of ['foot','riders']){
 const src=readGLB(path.join(dir,'../clips-'+pack+'.glb')),rig=new Rig(src);
 for(const clip of src.j.animations){
  const frames=Math.round(src.j.accessors[clip.samplers[0].input].max[0]*30);
  let maxRightWristBend=0,maxRightWristRotation=0,maxFingerArcError=0;
  for(let f=0;f<=frames;f++){
   rig.sample(clip.name,f/30);
   const wrist=rig.by['Wrist.R'].quaternion;
   maxRightWristBend=Math.max(maxRightWristBend,V([0,1,0]).applyQuaternion(wrist).angleTo(V([0,1,0]))*180/Math.PI);
   maxRightWristRotation=Math.max(maxRightWristRotation,Q().angleTo(wrist)*180/Math.PI);
   for(const i of fingers){const q=rig.by[reference.nodes[i].name].quaternion,a=closed[i].q,b=relaxed[i].q;maxFingerArcError=Math.max(maxFingerArcError,a.angleTo(q)+q.angleTo(b)-a.angleTo(b));}
  }
  if(maxRightWristBend>75||maxRightWristRotation>85||maxFingerArcError>.003)throw Error(clip.name+' has a folded wrist or additional finger curl');
  reports.push({clip:clip.name,frames:frames+1,maxRightWristBend,maxRightWristRotation,maxFingerArcError});
 }
}
function data(src,index){
 const a=src.j.accessors[index],v=src.j.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[a.type],bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],out=[];
 const b=src.bin,start=(v.byteOffset||0)+(a.byteOffset||0),read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
 for(let i=0;i<a.count;i++)for(let k=0;k<size;k++)out.push(b[read](start+i*(v.byteStride||size*bytes)+k*bytes));
 return out;
}
function torsoMeshes(src,rig){
 const torso=new Set(['Body','Hips','Abdomen','Torso','Chest','Neck']);
 return src.j.nodes.flatMap(n=>{
  if(n.skin===undefined||n.mesh===undefined||n.name==='Backpack')return [];
  const skin=src.j.skins[n.skin],bind=accessor(src,skin.inverseBindMatrices);
  return src.j.meshes[n.mesh].primitives.map(p=>{
   const pos=data(src,p.attributes.POSITION),weights=data(src,p.attributes.WEIGHTS_0),joints=data(src,p.attributes.JOINTS_0),indices=p.indices===undefined?Array.from({length:pos.length/3},(_,i)=>i):data(src,p.indices);
   const keep=Array.from({length:pos.length/3},(_,i)=>{let sum=0;for(let k=0;k<4;k++)if(torso.has(src.j.nodes[skin.joints[joints[i*4+k]]].name))sum+=weights[i*4+k];return sum>.60;});
   const triangles=[];for(let i=0;i<indices.length;i+=3)if(indices.slice(i,i+3).every(n=>keep[n]))triangles.push(indices.slice(i,i+3));
   return {pos,weights,joints,skin,triangles,bind:skin.joints.map((_,i)=>new T.Matrix4().fromArray(bind,i*16))};
  });
 });
}
const collisionReports=[];
const sources=[['male',source]];
const female=process.env.FEMALE_SOURCE||'/tmp/rts-medieval-clips/Female_Medieval.glb';
if(fs.existsSync(female))sources.push(['female',readGLB(female)]);
const pack=readGLB(path.join(dir,'../clips-foot.glb')),animated=new Rig(pack);
for(const [name,src] of sources){
 const rig=new Rig(src),meshes=torsoMeshes(src,rig);
 for(const clip of ['Spear_Thrust','Spear_Brace']){
  const a=pack.j.animations.find(a=>a.name===clip),frames=Math.round(pack.j.accessors[a.samplers[0].input].max[0]*30);
  let hits=0,maxOffhandError=0;const hitFrames=[];
  for(let f=0;f<=frames;f++){
   animated.sample(clip,f/30);
   for(const node of animated.nodes){const target=rig.by[node.name];if(target){target.position.copy(node.position);target.quaternion.copy(node.quaternion);target.scale.copy(node.scale);}}
   rig.update();
   const q=rig.quat('Wrist.R'),axis=V([-1,0,0]).applyQuaternion(q),grip=rig.pos('Wrist.R').add(V([0,.135,-.035]).applyQuaternion(q));
   const left=rig.pos('Wrist.L').add(V([0,.135,-.035]).applyQuaternion(rig.quat('Wrist.L')));
   maxOffhandError=Math.max(maxOffhandError,left.distanceTo(grip.clone().addScaledVector(axis,.29)));
   const start=grip.clone().addScaledVector(axis,-.91),y=V([0,1,0]).applyQuaternion(q),z=V([0,0,1]).applyQuaternion(q);
   // Nine rays cover the shaft centre and its 18 mm radius, along the full 2.6 m.
   const rays=Array.from({length:9},(_,i)=>new T.Ray(start.clone().addScaledVector(y,i?Math.cos(i*Math.PI/4)*.018:0).addScaledVector(z,i?Math.sin(i*Math.PI/4)*.018:0),axis));
   let frameHits=0;
   for(const m of meshes){
    const matrices=m.skin.joints.map((j,i)=>new T.Matrix4().multiplyMatrices(rig.nodes[j].matrixWorld,m.bind[i])),positions=[];
    for(const ids of m.triangles){
     const points=ids.map(i=>positions[i]||=(()=>{
      const p=new T.Vector3().fromArray(m.pos,i*3),sum=new T.Vector3();
      for(let k=0;k<4;k++)if(m.weights[i*4+k])sum.addScaledVector(p.clone().applyMatrix4(matrices[m.joints[i*4+k]]),m.weights[i*4+k]);
      return sum;
     })());
     for(const ray of rays){const hit=ray.intersectTriangle(...points,false,new T.Vector3());if(hit&&hit.distanceTo(ray.origin)<2.6)frameHits++;}
    }
   }
   hits+=frameHits;if(frameHits)hitFrames.push(f);
  }
  collisionReports.push({source:name,clip,frames:frames+1,shaftRadius:.018,torsoIntersections:hits,hitFrames,maxOffhandError});
 }
}
const result={handChecks:reports,spearClearance:collisionReports};
fs.writeFileSync(path.join(dir,'hand-validation.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({humanClips:reports.length,maxWristBend:Math.max(...reports.map(r=>r.maxRightWristBend)),spearClearance:collisionReports},null,2));
if(collisionReports.some(r=>r.torsoIntersections||r.maxOffhandError>.02))throw Error('Spear intersects the torso or misses the off hand; see hand-validation.json');
