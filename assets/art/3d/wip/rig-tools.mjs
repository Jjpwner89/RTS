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
 limb(a,b,end,target,pole,length2){
 const A=this.pos(a),l1=this.pos(a).distanceTo(this.pos(b)),l2=length2||this.pos(b).distanceTo(this.pos(end)),v=target.clone().sub(A),dist=v.length(),d=Math.min(l1+l2-0.00001,Math.max(Math.abs(l1-l2)+0.00001,dist)),dir=v.normalize();
 let bend=pole.clone().sub(A);bend.addScaledVector(dir,-bend.dot(dir)).normalize();
 const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),B=A.clone().addScaledVector(dir,along).addScaledVector(bend,height);
 this.limbBases||={};
 if(!this.limbBases[a]){
  const qa=this.quat(a),qb=this.quat(b),B0=this.pos(b),endAxis=end?this.by[end].position.clone():V([0,1,0]);
  const fore=endAxis.clone().applyQuaternion(qb),normal=B0.clone().sub(A).cross(fore).normalize();
  this.limbBases[a]={upper:frame(this.by[b].position,normal.clone().applyQuaternion(qa.invert())).invert(),lower:frame(endAxis,normal.clone().applyQuaternion(qb.invert())).invert()};
 }
 const normal=bend.clone().cross(dir).normalize(),basis=this.limbBases[a];
 this.setQ(a,frame(B.clone().sub(A),normal).multiply(basis.upper));
 this.setQ(b,frame(target.clone().sub(B),normal).multiply(basis.lower));
 this.maxLimbError=Math.max(this.maxLimbError||0,dist-l1-l2);return Math.max(0,dist-l1-l2);
 }
}
export function frame(x,y){x=x.clone().normalize();y=y.clone().addScaledVector(x,-y.dot(x));if(y.length()<1e-5)y=(Math.abs(x.x)<.8?V([1,0,0]):V([0,0,1])).addScaledVector(x,-(Math.abs(x.x)<.8?x.x:x.z));y.normalize();const z=x.clone().cross(y).normalize();return Q().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));}
export class Human{
 constructor(src){this.r=new Rig(src);this.r.sample('Idle_Neutral',0);this.base=this.r.capture();this.r.sample('Idle_Sword',0.4);this.grip=this.r.capture();this.r.restore(this.base);this.footQ={L:this.r.quat('Foot.L'),R:this.r.quat('Foot.R')};this.legLen={};for(let s of ['L','R'])this.legLen[s]=this.r.pos('LowerLeg.'+s).distanceTo(this.r.pos('Foot.'+s));}
 reset(){this.r.restore(this.base);for(let i=0;i<this.r.nodes.length;i++){if(/^(Index|Middle|Ring|Pinky|Thumb)/.test(this.r.nodes[i].name))this.r.nodes[i].quaternion.copy(this.grip[i].q);let m=this.r.nodes[i].name.match(/^(Index|Middle|Ring|Pinky)([234])/);if(m)this.r.nodes[i].quaternion.multiply(Q().setFromAxisAngle(V([1,0,0]),rad({2:-62,3:-74,4:-35}[m[2]])));}this.r.update();}
 body(y=.82,z=.02,lean=0,twist=0,x=0){this.r.setPos('Body',V([x,y,z]));this.r.turn('Torso',[1,0,0],lean);this.r.turn('Torso',[0,1,0],twist);this.r.turn('Head',[1,0,0],-lean*.5);}
 legs(left=[.15,.02275,.15],right=[-.15,.02275,-.12],poles=null){for(let [s,p]of [['L',left],['R',right]]){let target=V(p);this.r.setPos('Foot.'+s,target);this.r.setQ('Foot.'+s,this.footQ[s]);let pole=poles?.[s]||V([p[0],.5,1]);this.r.limb('UpperLeg.'+s,'LowerLeg.'+s,null,target,pole,this.legLen[s]);this.r.setPos('PT.'+s,pole);}}
 // Grip centre is offset into the palm. local +X is the tool shaft axis.
 hand(s,centre,axis=[0,0,1],down=[0,-1,0],open=0,pole=null){
 let q=frame(V(axis),down?V(down):V(centre).sub(this.r.pos('UpperArm.'+s))),offset=V([0,.135,-.035]),target=V(centre).sub(offset.applyQuaternion(q));
 this.r.limb('UpperArm.'+s,'LowerArm.'+s,'Wrist.'+s,target,pole||V([s==='L'?.65:-.65,1.05,-.25]));
 this.r.setQ('Wrist.'+s,q);this.maxGripError=Math.max(this.maxGripError||0,this.r.pos('Wrist.'+s).add(V([0,.135,-.035]).applyQuaternion(q)).distanceTo(V(centre)));
 if(open)for(let i=0;i<this.r.nodes.length;i++)if(new RegExp('^(Index|Middle|Ring|Pinky|Thumb).*\\.'+s+'$').test(this.r.nodes[i].name))this.r.nodes[i].quaternion.slerp(this.base[i].q,open);
 }
}
export function makeClip(r,name,frames,loop,pose,extra={}){
 const samples=[];for(let f=0;f<=frames;f++){pose(f/30,f/frames);r.update();samples.push(r.capture());}if(loop)samples[frames]=samples[0];
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
