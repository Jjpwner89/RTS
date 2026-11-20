// Animation authoring on the original Quaternius node hierarchy. No replacement rig.
import fs from 'node:fs';
export const T = await import(process.env.THREE_MODULE || 'three');
export const V=(a)=>new T.Vector3(...a), Q=()=>new T.Quaternion();
export const rad=x=>x*Math.PI/180;
export const smooth=x=>(x=Math.max(0,Math.min(1,x)),x*x*(3-2*x));
export function curve(t,keys){for(let i=1;i<keys.length;i++){if(t<=keys[i][0]){const a=keys[i-1],b=keys[i],u=smooth((t-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*u;}}return keys.at(-1)[1];}
export function readGLB(p){let b=fs.readFileSync(p),n=b.readUInt32LE(12);return {j:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
export function accessor(src,i){const a=src.j.accessors[i],v=src.j.bufferViews[a.bufferView],d={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];let b=src.bin.subarray((v.byteOffset||0)+(a.byteOffset||0));const out=[];for(let k=0;k<a.count;k++)for(let z=0;z<d;z++)out.push(b.readFloatLE(k*(v.byteStride||d*4)+z*4));return out;}
export class Rig{
 constructor(src){
  this.src=src;this.nodes=src.j.nodes.map(n=>{let o=new T.Object3D();o.name=n.name||'';o.position.fromArray(n.translation||[0,0,0]);o.quaternion.fromArray(n.rotation||[0,0,0,1]).normalize();o.scale.fromArray(n.scale||[1,1,1]);return o});
  src.j.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>this.nodes[i].add(this.nodes[c])));
  this.scene=new T.Group();src.j.scenes[src.j.scene||0].nodes.forEach(i=>this.scene.add(this.nodes[i]));
  this.by=Object.fromEntries(this.nodes.map(o=>[o.name,o]));this.original=this.capture();this.cache={};this.update();
 }
 update(){this.scene.updateMatrixWorld(true);}
 capture(){return this.nodes.map(o=>({p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));}
 restore(p){this.nodes.forEach((o,i)=>{o.position.copy(p[i].p);o.quaternion.copy(p[i].q);o.scale.copy(p[i].s)});this.update();}
 sample(name,t){this.restore(this.original);const a=this.src.j.animations.find(a=>a.name===name);if(!a)throw Error(name);
 for(const c of a.channels){let s=a.samplers[c.sampler],ts=this.cache[s.input]||=accessor(this.src,s.input),vs=this.cache[s.output]||=accessor(this.src,s.output),d=c.target.path==='rotation'?4:3;let hi=ts.findIndex(x=>x>=t);if(hi<0)hi=ts.length-1;let lo=Math.max(0,hi-1),u=ts[hi]===ts[lo]?0:(t-ts[lo])/(ts[hi]-ts[lo]);u=Math.max(0,Math.min(1,u));const o=this.nodes[c.target.node],prop={rotation:'quaternion',translation:'position',scale:'scale'}[c.target.path];
 if(d===4)o[prop].fromArray(vs,lo*d).slerp(Q().fromArray(vs,hi*d),u).normalize();else o[prop].fromArray(vs,lo*d).lerp(new T.Vector3().fromArray(vs,hi*d),u);
 }this.update();}
 pos(name){this.update();return this.by[name].getWorldPosition(new T.Vector3());}
 quat(name){this.update();return this.by[name].getWorldQuaternion(Q());}
 setPos(name,p){this.update();this.by[name].position.copy(this.by[name].parent.worldToLocal(p.clone()));this.update();}
 setQ(name,q){this.update();this.by[name].quaternion.copy(this.by[name].parent.getWorldQuaternion(Q()).invert().multiply(q));this.update();}
 turn(name,axis,deg){this.setQ(name,Q().setFromAxisAngle(V(axis),rad(deg)).multiply(this.quat(name)));}
 aim(name,local,target){this.update();let o=this.by[name],from=local.clone().applyQuaternion(this.quat(name)).normalize(),to=target.clone().sub(this.pos(name)).normalize();this.setQ(name,Q().setFromUnitVectors(from,to).multiply(this.quat(name)));}
 // Analytic two-link IK, with a stable bend pole in model coordinates.
 limb(a,b,end,target,pole,length2,localEndAxis){
 const A=this.pos(a),l1=this.pos(a).distanceTo(this.pos(b)),l2=length2||this.pos(b).distanceTo(this.pos(end)),v=target.clone().sub(A),dist=v.length(),d=Math.min(l1+l2-0.00001,Math.max(Math.abs(l1-l2)+0.00001,dist)),dir=v.normalize();
 let bend=pole.clone().sub(A);bend.addScaledVector(dir,-bend.dot(dir)).normalize();
 const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),B=A.clone().addScaledVector(dir,along).addScaledVector(bend,height);
 this.limbBases||={};const key=a+(localEndAxis?":grip":":wrist");
 if(!this.limbBases[key]){
  const qa=this.quat(a),qb=this.quat(b),B0=this.pos(b),endAxis=localEndAxis|| (end?this.by[end].position.clone():V([0,1,0]));
  const fore=endAxis.clone().applyQuaternion(qb),normal=B0.clone().sub(A).cross(fore).normalize();
  this.limbBases[key]={upper:frame(this.by[b].position,normal.clone().applyQuaternion(qa.invert())).invert(),lower:frame(endAxis,normal.clone().applyQuaternion(qb.invert())).invert()};
 }
 const normal=bend.clone().cross(dir).normalize(),basis=this.limbBases[key];
 this.setQ(a,frame(B.clone().sub(A),normal).multiply(basis.upper));
 this.setQ(b,frame(target.clone().sub(B),normal).multiply(basis.lower));
 this.maxLimbError=Math.max(this.maxLimbError||0,dist-l1-l2);return Math.max(0,dist-l1-l2);
 }
}
export function frame(x,y){x=x.clone().normalize();y=y.clone().addScaledVector(x,-y.dot(x));if(y.length()<1e-5)y=(Math.abs(x.x)<.8?V([1,0,0]):V([0,0,1])).addScaledVector(x,-(Math.abs(x.x)<.8?x.x:x.z));y.normalize();const z=x.clone().cross(y).normalize();return Q().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));}
export class Human{
 constructor(src){this.r=new Rig(src);this.r.sample('Idle_Neutral',0);this.base=this.r.capture();this.r.sample('Idle_Sword',0.4);this.grip=this.r.capture();this.r.restore(this.base);this.footQ={L:this.r.quat('Foot.L'),R:this.r.quat('Foot.R')};this.legLen={};for(let s of ['L','R'])this.legLen[s]=this.r.pos('LowerLeg.'+s).distanceTo(this.r.pos('Foot.'+s));}
 // Idle_Sword already closes the right fingers; curl only its open left hand.
 reset(){this.r.restore(this.base);for(let i=0;i<this.r.nodes.length;i++){if(/^(Index|Middle|Ring|Pinky|Thumb)/.test(this.r.nodes[i].name))this.r.nodes[i].quaternion.copy(this.grip[i].q);let m=this.r.nodes[i].name.match(/^(Index|Middle|Ring|Pinky)([234])/);if(m&&this.r.nodes[i].name.endsWith('.L'))this.r.nodes[i].quaternion.multiply(Q().setFromAxisAngle(V([1,0,0]),rad({2:-62,3:-74,4:-35}[m[2]])));}this.r.update();}
 body(y=.82,z=.02,lean=0,twist=0,x=0){this.r.setPos('Body',V([x,y,z]));this.r.turn('Torso',[1,0,0],lean);this.r.turn('Torso',[0,1,0],twist);this.r.turn('Head',[1,0,0],-lean*.5);}
 legs(left=[.15,.02275,.15],right=[-.15,.02275,-.12],poles=null){for(let [s,p]of [['L',left],['R',right]]){let target=V(p);this.r.setPos('Foot.'+s,target);this.r.setQ('Foot.'+s,this.footQ[s]);let pole=poles?.[s]||V([p[0],.5,1]);this.r.limb('UpperLeg.'+s,'LowerLeg.'+s,null,target,pole,this.legLen[s]);this.r.setPos('PT.'+s,pole);}}
 // Grip axes follow the mirrored hands: right -X, left +X.
 // Solve palm roll and elbow together; pronation belongs in the forearm.
 hand(s,centre,axis=[0,0,1],down=[0,-1,0],open=0,pole=null,options={}){
 const r=this.r,offset=V([0,.135,-.035]);
 const blendFingers=()=>{
  if(open)for(let i=0;i<r.nodes.length;i++){
   const name=r.nodes[i].name;
   if(/^(Index|Middle|Ring|Pinky|Thumb)/.test(name)&&name.endsWith('.'+s))r.nodes[i].quaternion.slerp(this.base[i].q,open);
  }
 };
 // Empty hands follow the forearm and retain the source wrist pose.
 if(axis===null){
  const wrist=r.by['Wrist.'+s],wristRest=this.base[r.nodes.indexOf(wrist)].q;
  wrist.quaternion.copy(wristRest);r.update();
  const endAxis=wrist.position.clone().add(offset.clone().applyQuaternion(wristRest));
  r.limb('UpperArm.'+s,'LowerArm.'+s,null,V(centre),pole||V([s==='L'?.65:-.65,1.05,-.25]),endAxis.length(),endAxis);
  wrist.quaternion.copy(wristRest);r.update();blendFingers();
  this.maxGripError=Math.max(this.maxGripError||0,r.pos('Wrist.'+s).add(offset.applyQuaternion(r.quat('Wrist.'+s))).distanceTo(V(centre)));
  return;
 }
 const A=r.pos('UpperArm.'+s),C=V(centre),x=V(axis).normalize().multiplyScalar(s==='R'?-1:1),pref=frame(x,down?V(down):C.clone().sub(A)),l1=A.distanceTo(r.pos('LowerArm.'+s)),l2=r.pos('LowerArm.'+s).distanceTo(r.pos('Wrist.'+s)),P=pole||V([s==='L'?.65:-.65,1.05,-.25]);
 // Minimise wrist bend while preserving contact and a continuous elbow path.
 const evaluate=angle=>{
  const q=Q().setFromAxisAngle(x,angle).multiply(pref),y=V([0,1,0]).applyQuaternion(q),target=C.clone().sub(V([0,.135,-.035]).applyQuaternion(q)),D=target.clone().sub(A),length=D.length(),d=Math.max(Math.abs(l1-l2)+.00001,Math.min(l1+l2-.00001,length)),dir=D.normalize(),natural=P.clone().sub(A);natural.addScaledVector(dir,-natural.dot(dir)).normalize();const bend=y.clone().negate().addScaledVector(dir,y.dot(dir));bend.addScaledVector(natural,.25).normalize();
  // The thrust explicitly keeps the elbow down, even when a straighter wrist would raise it.
  if(options.elbowPole)bend.copy(natural);
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),B=A.clone().addScaledVector(dir,along).addScaledVector(bend,height),fore=target.clone().sub(B).normalize(),flex=Math.acos(Math.max(-1,Math.min(1,y.dot(fore)))),reach=Math.max(0,length-l1-l2,Math.abs(l1-l2)-length);
  return {q,target,flex,reach,angle,bend,score:flex*flex+2500*reach*reach+.35*(1-bend.dot(natural))+.001*(1-Math.cos(angle))+(r.handElbows?.[s]?40*B.distanceToSquared(r.handElbows[s]):0)};
 };
 // Continue the previous palm roll rather than switching to the opposite grip.
 const previous=r.handFrames?.[s],baseY=V([0,1,0]).applyQuaternion(pref),baseZ=V([0,0,1]).applyQuaternion(pref);
 const previousY=previous&&V([0,1,0]).applyQuaternion(previous),start=previous?Math.atan2(previousY.dot(baseZ),previousY.dot(baseY)):0,range=previous?Math.PI/6:Math.PI;
 let best=evaluate(start);for(let i=0;i<=72;i++){const test=evaluate(start-range+2*range*i/72);if(test.score<best.score)best=test;}
 let step=range/36;for(let i=0;i<12;i++){step/=2;for(const a of [best.angle-step,best.angle+step]){let test=evaluate(a);if(test.score<best.score)best=test;}}
 (r.handFrames||={})[s]=best.q.clone();
 r.limb('UpperArm.'+s,'LowerArm.'+s,'Wrist.'+s,best.target,A.clone().add(best.bend));
 (r.handElbows||={})[s]=r.pos('LowerArm.'+s);
 // Forearm supplies pronation; the wrist supplies only the remaining swing.
 const fore=r.pos('Wrist.'+s).sub(r.pos('LowerArm.'+s)).normalize(),foreX=V([1,0,0]).applyQuaternion(best.q);foreX.addScaledVector(fore,-foreX.dot(fore)).normalize();
 r.setQ('LowerArm.'+s,frame(foreX,fore));
 r.setQ('Wrist.'+s,best.q);
 blendFingers();
 this.maxGripError=Math.max(this.maxGripError||0,r.pos('Wrist.'+s).add(V([0,.135,-.035]).applyQuaternion(best.q)).distanceTo(C));
 return best;
}
}
export function makeClip(r,name,frames,loop,pose,extra={}){
 r.handFrames={};r.handElbows={};r.armRoll={};r.fkPrev={};r.armElbow={};const samples=[];for(let f=0;f<=frames;f++){pose(f/30,f/frames);r.update();samples.push(r.capture());}if(loop)samples[frames]=samples[0];
 return {name,frames,loop,samples,extra};
}
export function writeClips(src,clips,path,{mesh=true}={}){
 const j=structuredClone(src.j),old=src.bin;j.animations=[];const chunks=[];let offset=0;
 // Retain only buffers used by the original meshes and skin, so source clips are not re-delivered.
 const used=new Set();if(mesh)for(let m of j.meshes||[])for(let p of m.primitives){Object.values(p.attributes).forEach(i=>used.add(i));if(p.indices!==undefined)used.add(p.indices);}
 for(let s of j.skins||[])used.add(s.inverseBindMatrices);
 const map=new Map(),views=[],accs=[];
 function put(data,type,count,extras={}){const buf=Buffer.from(data.buffer,data.byteOffset,data.byteLength);const vi=views.length;views.push({buffer:0,byteOffset:offset,byteLength:buf.length});chunks.push(buf);offset+=buf.length;if(offset%4){let pad=Buffer.alloc(4-offset%4);chunks.push(pad);offset+=pad.length;}const ai=accs.length;accs.push({bufferView:vi,componentType:5126,count,type,...extras});return ai;}
 for(let i of used){const a=j.accessors[i],v=j.bufferViews[a.bufferView],start=(v.byteOffset||0);const data=old.subarray(start,start+v.byteLength),vi=views.length;views.push({...v,buffer:0,byteOffset:offset});chunks.push(data);offset+=data.length;if(offset%4){let p=Buffer.alloc(4-offset%4);chunks.push(p);offset+=p.length;}map.set(i,accs.length);accs.push({...a,bufferView:vi});}
 if(mesh)for(let m of j.meshes||[])for(let p of m.primitives){for(let k of Object.keys(p.attributes))p.attributes[k]=map.get(p.attributes[k]);if(p.indices!==undefined)p.indices=map.get(p.indices);}
 for(let s of j.skins||[])s.inverseBindMatrices=map.get(s.inverseBindMatrices);
 if(!mesh){delete j.meshes;delete j.materials;delete j.skins;for(let n of j.nodes){delete n.mesh;delete n.skin;}}
 for(let clip of clips){
 let times=Float32Array.from({length:clip.frames+1},(_,f)=>f/30),input=put(times,'SCALAR',times.length,{min:[0],max:[clip.frames/30]}),channels=[],samplers=[];
 for(let i=0;i<j.nodes.length;i++){
 if(!src.j.skins?.some(s=>s.joints.includes(i)))continue;
 for(let [key,path,d]of [['p','translation',3],['q','rotation',4],['s','scale',3]]){
 let vals=clip.samples.map(p=>p[i][key].toArray());if(key==='q')for(let k=1;k<vals.length;k++){if(vals[k].reduce((s,v,n)=>s+v*vals[k-1][n],0)<0)vals[k]=vals[k].map(v=>-v);}
 let output=put(Float32Array.from(vals.flat()),d===4?'VEC4':'VEC3',times.length);channels.push({sampler:samplers.length,target:{node:i,path}});samplers.push({input,output,interpolation:'LINEAR'});
 }}
 j.animations.push({name:clip.name,channels,samplers,extras:{fps:30,loop:clip.loop,inPlace:true,...clip.extra}});
 }
 if(mesh)for(let m of j.materials||[]){let p=m.pbrMetallicRoughness||={};delete p.baseColorTexture;delete p.metallicRoughnessTexture;delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;p.roughnessFactor=.85;if(['Green','LightGreen'].includes(m.name)){m.name='cloth';p.baseColorFactor=[.35,.35,.35,1];}}
 delete j.textures;delete j.images;delete j.samplers;j.accessors=accs;j.bufferViews=views;j.buffers=[{byteLength:offset}];j.asset.generator='RTS Quaternius medieval clips — original mesh, hierarchy and bind matrices';
 let json=Buffer.from(JSON.stringify(j)),pad=Buffer.alloc((4-json.length%4)%4,32);json=Buffer.concat([json,pad]);let bin=Buffer.concat(chunks),head=Buffer.alloc(20),bh=Buffer.alloc(8);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+bin.length,8);head.writeUInt32LE(json.length,12);head.write('JSON',16);bh.writeUInt32LE(bin.length);bh.write('BIN\0',4);fs.writeFileSync(path,Buffer.concat([head,json,bh,bin]));return j;
}
// Deliberate grip (Claude, 2026-11-20). The animator chooses the elbow position; the solver
// does not. The shaft may lie diagonally across the palm (diag degrees, butt end toward the
// heel of the hand) as a real spear or tool grip does, so the forearm can run along the shaft.
// Palm roll is the only free choice. Each candidate is posed on the real rig and judged in the
// same joint terms as joint-scan.mjs: forearm twist against the upper arm, and wrist flexion
// and deviation against the forearm, all relative to the rest pose (arms hanging, palms in).
export function gripAxis(s,diag){const a=rad(diag);return V([s==='R'?-Math.cos(a):Math.cos(a),Math.sin(a),0]);}
const deg=x=>x*180/Math.PI;
export function swingTwist(q,axis){const p=V([q.x,q.y,q.z]),t=Q().set(...axis.clone().multiplyScalar(p.dot(axis)).toArray(),q.w).normalize();let a=2*Math.acos(Math.min(1,Math.abs(t.w)));if(V([t.x,t.y,t.z]).dot(axis)*t.w<0)a=-a;return deg(a);}
// Forearm twist, wrist flexion and wrist deviation in degrees. Deviation > 0 is toward the thumb.
export function armAngles(h,s){
 const r=h.r,i=n=>r.nodes.indexOf(r.by[n]),rest=n=>h.base[i(n)].q.clone().invert();
 const fore=swingTwist(rest('LowerArm.'+s).multiply(r.by['LowerArm.'+s].quaternion.clone()),V([0,1,0]));
 const w=rest('Wrist.'+s).multiply(r.by['Wrist.'+s].quaternion.clone()),y=V([0,1,0]).applyQuaternion(w);
 return {fore,wristTwist:swingTwist(w,V([0,1,0])),flex:deg(Math.atan2(y.z,y.y)),dev:deg(Math.atan2(s==='R'?-y.x:y.x,y.y))};
}
Human.prototype.arm=function(s,grip,axis,elbow,opts={}){
 // elbowSearch: also try elbow poles up to this far from the given one, keeping the most natural
 // arm that stays near the previous frame's elbow.
 const {elbowSearch=0}=opts;if(!elbowSearch)return this.armAt(s,grip,axis,elbow,opts);
 const r=this.r,E=V(elbow),prevE=r.armElbow?.[s],snap=r.capture(),roll=r.armRoll?.[s];let best=null;
 const offs=[[0,0,0]];for(const a of [-1,1])for(const k of [0,1,2]){const o=[0,0,0];o[k]=a;offs.push(o);}for(const a of [-1,1])for(const b of [-1,1])offs.push([a*.7,b*.7,0],[a*.7,0,b*.7],[0,a*.7,b*.7]);
 for(const o of offs){r.restore(snap);if(roll!==undefined)r.armRoll[s]=roll;const P=E.clone().addScaledVector(V(o),elbowSearch);const res=this.armAt(s,grip,axis,P,{...opts});const el=r.pos('LowerArm.'+s);
  const sc=res.score+(prevE?400*el.distanceToSquared(prevE):0)+20*res.reach;if(!best||sc<best.sc)best={sc,P};}
 r.restore(snap);if(roll!==undefined)r.armRoll[s]=roll;const res=this.armAt(s,grip,axis,best.P,opts);(r.armElbow||={})[s]=r.pos('LowerArm.'+s);return res;
};
Human.prototype.armAt=function(s,grip,axis,elbow,{diag=0,roll=null,rollRange=Math.PI,twistLimit=80,open=0,local=null}={}){
 const r=this.r,offset=V([0,.135,-.035]),C=V(grip),d=V(axis).normalize(),q0=Q().setFromUnitVectors(local?V(local).normalize():gripAxis(s,diag),d),E=V(elbow);
 const A=r.pos('UpperArm.'+s),l1=A.distanceTo(r.pos('LowerArm.'+s)),l2=r.pos('LowerArm.'+s).distanceTo(r.pos('Wrist.'+s));
 const pose=phi=>{
  const q=Q().setFromAxisAngle(d,phi).multiply(q0),W=C.clone().sub(offset.clone().applyQuaternion(q));
  r.limb('UpperArm.'+s,'LowerArm.'+s,'Wrist.'+s,W,E);
  const fore=r.pos('Wrist.'+s).sub(r.pos('LowerArm.'+s)).normalize(),fx=V([1,0,0]).applyQuaternion(q);fx.addScaledVector(fore,-fx.dot(fore)).normalize();
  r.setQ('LowerArm.'+s,frame(fx,fore));r.setQ('Wrist.'+s,q);
  const g=armAngles(this,s),ulnar=Math.max(0,-g.dev-35),radial=Math.max(0,g.dev-15),flex=Math.max(0,Math.abs(g.flex)-45),tw=Math.max(0,Math.abs(g.fore)-twistLimit);
  return {phi,g,reach:Math.max(0,A.distanceTo(W)-l1-l2),score:ulnar*ulnar+3*radial*radial+flex*flex+.02*g.flex*g.flex+.02*g.dev*g.dev+4*tw*tw+.01*g.fore*g.fore};
 };
 const prev=r.armRoll?.[s],centre=roll!==null?rad(roll):prev??0,range=roll!==null?0:prev!==undefined?Math.PI/4:rollRange;
 let best=pose(centre);for(let i=0;i<=72&&range;i++){const t=pose(centre-range+2*range*i/72);if(t.score<best.score)best=t;}
 for(let step=range/36;step>1e-3&&range;step/=2)for(const p of [best.phi-step,best.phi+step]){const t=pose(p);if(t.score<best.score)best=t;}
 (r.armRoll||={})[s]=best.phi;best=pose(best.phi);
 if(open)for(let i=0;i<r.nodes.length;i++){const n=r.nodes[i].name;if(/^(Index|Middle|Ring|Pinky|Thumb)/.test(n)&&n.endsWith('.'+s))r.nodes[i].quaternion.slerp(this.base[i].q,open);}
 r.update();
 const q=r.quat('Wrist.'+s);this.armReport=Object.assign(this.armReport||{},{[s]:{...Object.fromEntries(Object.entries(best.g).map(([k,v])=>[k,Math.round(v)])),reach:+best.reach.toFixed(3)}});
 this.maxGripError=Math.max(this.maxGripError||0,r.pos('Wrist.'+s).add(offset.applyQuaternion(q)).distanceTo(C));
 return best;
};
// Animator-style arm (Claude, 2026-11-20): give the upper arm's and forearm's directions in model
// space; the elbow and the grip follow from the real bone lengths, with the hand continuing the
// forearm. Only the palm roll around the weapon is solved. Returns the grip point.
Human.prototype.limbDirs=function(s,up,fore){
 const r=this.r,S=r.pos('UpperArm.'+s),l1=S.distanceTo(r.pos('LowerArm.'+s)),l2=r.pos('LowerArm.'+s).distanceTo(r.pos('Wrist.'+s));
 const E=S.clone().addScaledVector(V(up).normalize(),l1),f=V(fore).normalize();
 // The pole sits a little off the elbow toward where a relaxed elbow points (down, back and out),
 // so a straight arm still bends, and twists, the natural way.
 const out=V([s==='R'?-.3:.3,-1,-.6]).normalize(),u=V(up).normalize(),f2=f.clone();
 const lean=out.addScaledVector(u,-out.dot(u)).addScaledVector(f2.addScaledVector(u,-f2.dot(u)),-.0).normalize();
 return {elbow:E.clone().addScaledVector(lean,.03),grip:E.clone().addScaledVector(f,l2+.135)};
};
Human.prototype.pose=function(s,up,fore,axis,opts={}){const {elbow,grip}=this.limbDirs(s,up,fore);this.arm(s,grip,axis,elbow,opts);return grip;};
// Pure forward-kinematic arm (Claude, 2026-11-20). up/fore: model-space directions of the upper
// arm and forearm. roll: forearm twist in degrees, + turns the thumb toward the body (pronation)
// on either side. flex: wrist bend, + toward the palm. dev: wrist bend, + toward the thumb.
// The hand then holds its weapon along gripAxis(s,diag); returns {grip, axis} in model space.
Human.prototype.fk=function(s,up,fore,{roll=0,flex=0,dev=0,diag=0,open=0}={}){
 const r=this.r,{elbow,grip}=this.limbDirs(s,up,fore),A=r.pos('UpperArm.'+s),l2=r.pos('LowerArm.'+s).distanceTo(r.pos('Wrist.'+s));
 const W=r.pos('UpperArm.'+s).add(V(up).normalize().multiplyScalar(A.distanceTo(r.pos('LowerArm.'+s)))).addScaledVector(V(fore).normalize(),l2);
 const i=n=>r.nodes.indexOf(r.by[n]),m=s==='R'?1:-1;
 r.by['Wrist.'+s].quaternion.copy(this.base[i('Wrist.'+s)].q);r.by['LowerArm.'+s].quaternion.copy(this.base[i('LowerArm.'+s)].q);r.update();
 r.limb('UpperArm.'+s,'LowerArm.'+s,'Wrist.'+s,W,elbow);
 r.by['LowerArm.'+s].quaternion.multiply(Q().setFromAxisAngle(V([0,1,0]),rad(PRONATE*m*roll)));
 r.by['Wrist.'+s].quaternion.copy(this.base[i('Wrist.'+s)].q).multiply(Q().setFromAxisAngle(V([0,0,1]),rad(m*dev))).multiply(Q().setFromAxisAngle(V([1,0,0]),rad(FLEX*flex)));
 if(open)for(let k=0;k<r.nodes.length;k++){const n=r.nodes[k].name;if(/^(Index|Middle|Ring|Pinky|Thumb)/.test(n)&&n.endsWith('.'+s))r.nodes[k].quaternion.slerp(this.base[k].q,open);}
 r.update();const q=r.quat('Wrist.'+s);
 this.armReport=Object.assign(this.armReport||{},{[s]:Object.fromEntries(Object.entries(armAngles(this,s)).map(([k,v])=>[k,Math.round(v)]))});
 return {grip:r.pos('Wrist.'+s).add(V([0,.135,-.035]).applyQuaternion(q)),axis:gripAxis(s,diag).applyQuaternion(q)};
};
// Signs fixed by test so that + roll is pronation and + flex is toward the palm on both sides.
const PRONATE=-1,FLEX=-1;
// Point a weapon with natural joints only (Claude, 2026-11-20). The animator gives the arm
// directions and where the weapon should point; this searches forearm roll and wrist bend inside
// natural ranges for the closest match (staying near the previous frame), then poses the arm.
// The miss in degrees is reported as aimError: a large miss means the arm needs re-posing.
export const RANGE={roll:[-80,80],flex:[-50,50],dev:[-30,15]};
Human.prototype.aimFk=function(s,up,fore,want,{diag=0,open=0,prefer=null}={}){
 const r=this.r,m=s==='R'?1:-1,i=n=>r.nodes.indexOf(r.by[n]),w=V(want).normalize();
 this.fk(s,up,fore,{diag});
 const q0=r.quat('LowerArm.'+s),rest=this.base[i('Wrist.'+s)].q,g=gripAxis(s,diag);
 const axis=(roll,flex,dev)=>g.clone().applyQuaternion(Q().copy(q0).multiply(Q().setFromAxisAngle(V([0,1,0]),rad(-m*roll))).multiply(rest).multiply(Q().setFromAxisAngle(V([0,0,1]),rad(m*dev))).multiply(Q().setFromAxisAngle(V([1,0,0]),rad(-flex))));
 const prev=prefer||r.fkPrev?.[s];
 const cost=p=>{const e=Math.acos(Math.max(-1,Math.min(1,axis(...p).dot(w))));return e*e*400+.0004*(p[0]*p[0]+2*p[1]*p[1]+3*p[2]*p[2])+(prev?.002*((p[0]-prev[0])**2+(p[1]-prev[1])**2+(p[2]-prev[2])**2):0);};
 const lim=[RANGE.roll,RANGE.flex,RANGE.dev],clamp=p=>p.map((v,k)=>Math.max(lim[k][0],Math.min(lim[k][1],v)));
 let best=prev?clamp(prev):[0,0,0],bc=cost(best);
 if(!prev)for(let a=-80;a<=80;a+=20)for(let b=-40;b<=40;b+=20)for(let c=-30;c<=15;c+=15){const p=[a,b,c],k=cost(p);if(k<bc){bc=k;best=p;}}
 for(let step=16;step>.2;step/=2){let moved=true;while(moved){moved=false;for(let k=0;k<3;k++)for(const d of [-step,step]){const p=best.slice();p[k]+=d;const q=clamp(p),c=cost(q);if(c<bc-1e-9){bc=c;best=q;moved=true;}}}}
 (r.fkPrev||={})[s]=best;
 const out=this.fk(s,up,fore,{roll:best[0],flex:best[1],dev:best[2],diag,open});
 out.aimError=Math.acos(Math.max(-1,Math.min(1,out.axis.clone().normalize().dot(w))))*180/Math.PI;out.joints=best;
 this.armReport[s].aimError=Math.round(out.aimError);return out;
};
