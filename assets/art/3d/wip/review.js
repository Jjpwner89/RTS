import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight-110);renderer.setClearColor('#e3dfd1');renderer.shadowMap.enabled=true;document.body.append(renderer.domElement);
const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x6c5e45,2));const light=new T.DirectionalLight(0xfff4de,3);light.position.set(-3,7,5);light.castShadow=true;light.shadow.mapSize.set(2048,2048);scene.add(light);
const camera=new T.PerspectiveCamera(33,innerWidth/(innerHeight-110),.01,100);const controls=new OrbitControls(camera,renderer.domElement);
const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardMaterial({color:0xb4b5a4,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);scene.add(new T.GridHelper(12,24,0x858b7c,0xa4aa9a));
const loader=new GLTFLoader(),packs={};for(const type of ['foot','riders','horse'])packs[type]=await loader.loadAsync('../clips-'+type+'.glb');const originalHorse=await loader.loadAsync('Horse.normalized.glb');
const entries=Object.entries(packs).flatMap(([kind,g])=>g.animations.map(c=>({kind,g,c})));const select=document.querySelector('#clip'),slider=document.querySelector('#time'),stamp=document.querySelector('#stamp'),play=document.querySelector('#play');entries.forEach(({kind,c})=>select.add(new Option(c.name,c.name)));
const mat=(color)=>new T.MeshStandardMaterial({color,roughness:.85,flatShading:true});
const wood=mat(0x755337),steel=mat(0x8d979c),blue=mat(0x627488),linen=mat(0xa59876);
function rod(len=2.6){const g=new T.Group(),s=new T.Mesh(new T.CylinderGeometry(.014,.017,len,8),wood);s.rotation.z=-Math.PI/2;s.position.x=len*.15;g.add(s);return g;}
function spear(len=2.6){const g=rod(len),tip=new T.Mesh(new T.ConeGeometry(.045,.23,4),steel);tip.rotation.z=-Math.PI/2;tip.position.x=len*.65+.11;g.add(tip);return g;}
function sword(){const g=rod(.17),blade=new T.Mesh(new T.BoxGeometry(.70,.035,.07),steel);blade.position.x=.41;g.add(blade);const guard=new T.Mesh(new T.BoxGeometry(.025,.035,.20),steel);guard.position.x=.06;g.add(guard);return g;}
function tool(kind){const g=rod(kind==='Hoe'?1.5:.85);let head;if(kind==='Hoe')head=new T.Mesh(new T.BoxGeometry(.06,.22,.15),steel);else if(kind==='Mine')head=new T.Mesh(new T.ConeGeometry(.055,.40,4),steel);else head=new T.Mesh(new T.BoxGeometry(.16,.045,.28),steel);head.position.x=kind==='Hoe'?1.0:.55;g.add(head);return g;}
function bow(){const g=new T.Group(),pts=[];for(let i=0;i<=16;i++){let x=(i/16-.5)*1.3;pts.push(new T.Vector3(x,-.18*(x/.65)**2,0));}g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),24,.014,5,false),wood));return g;}
function shield(){const m=new T.Mesh(new T.CylinderGeometry(.31,.31,.045,8),blue);return m;}
let display=null,mixers=[],action,playing=true,t=0,entry,activeProp,extra=[],sheetObjects=[];
function prep(o){o.traverse(n=>{if(n.name==='Backpack')n.visible=false;if(n.isMesh){n.castShadow=true;n.frustumCulled=false;[].concat(n.material).forEach(m=>{m.flatShading=true;m.roughness=.9;});}});}
function playClip(o,c){const m=new T.AnimationMixer(o),a=m.clipAction(c);a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();mixers.push({m,a});return a;}
function attach(o,bone,p){o.getObjectByName(bone)?.add(p);p.position.set(0,.135,-.035);return p;}
function choose(name){
 sheetObjects.forEach(o=>scene.remove(o));sheetObjects=[];if(display)scene.remove(display);display=new T.Group();scene.add(display);mixers=[];extra=[];activeProp=null;
 entry=entries.find(e=>e.c.name===name);select.value=name;const model=clone(entry.g.scene);display.add(model);prep(model);action=playClip(model,entry.c);
 if(entry.kind==='riders'){const horse=clone(packs.horse.scene);prep(horse);display.add(horse);const hc=packs.horse.animations.find(c=>c.name===name.replace('Ride_',''));if(hc)playClip(horse,hc);else{const idle=originalHorse.animations.find(c=>c.name.endsWith('|Idle'));const m=new T.AnimationMixer(horse);m.clipAction(idle).play();m.setTime(0);}}
 if(entry.kind!=='horse'){
  if(/Spear|March|Javelin|Couch/.test(name))activeProp=attach(model,'WristR',spear(name==='Ride_Couch'?3.2:name==='Javelin_Throw'?1.65:2.6));
  if(/Cheer|Shield|Slash/.test(name))activeProp=attach(model,'WristR',sword());
  if(/Shield/.test(name))attach(model,'WristL',shield());
  if(['Chop','Mine','Hoe'].includes(name))activeProp=attach(model,'WristR',tool(name));
  if(name==='Bow_Loose'){activeProp=attach(model,'WristL',bow());const geo=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3(),new T.Vector3()]);const line=new T.Line(geo,new T.LineBasicMaterial({color:0xc8bd98}));display.add(line);extra.push({kind:'bowstring',model,line,prop:activeProp});}
  if(name==='Crossbow_Span'){const g=rod(.95),cross=new T.Mesh(new T.BoxGeometry(.035,.6,.04),wood);cross.position.x=.56;g.add(cross);display.add(g);activeProp=g;extra.push({kind:'crossbow',model,prop:g});}
  if(name==='Chop'){const log=new T.Mesh(new T.CylinderGeometry(.2,.22,.55,9),wood);log.rotation.z=Math.PI/2;log.position.set(0,.50,.85);display.add(log);}if(name==='Mine'){const rock=new T.Mesh(new T.IcosahedronGeometry(.30,0),mat(0x7a7f78));rock.position.set(0,.65,.90);display.add(rock);}if(name==='Carry'){const sack=new T.Mesh(new T.IcosahedronGeometry(.23,1),linen);sack.scale.set(1,1.3,.8);model.getObjectByName('Chest').add(sack);sack.position.set(-.23,.08,-.10);}
 }
 t=0;slider.max=entry.c.duration;
 if(entry.kind==='foot'){camera.position.set(-3,2.1,4);controls.target.set(0,.9,.12);}else{camera.position.set(-4,2.8,5);controls.target.set(0,1.1,0);}controls.update();setTime(0);return {kind:entry.kind,duration:entry.c.duration};
}
function setTime(v){t=v;mixers.forEach(({m,a})=>{a.enabled=true;a.paused=false;m.setTime(Math.min(t,a.getClip().duration));});display.updateMatrixWorld(true);
 if(activeProp&&entry.c.name==='Javelin_Throw')activeProp.visible=t<.63333;
 for(const x of extra){if(x.kind==='crossbow'){const hand=x.model.getObjectByName('WristR');const p=hand.localToWorld(new T.Vector3(0,.135,-.035)),q=hand.getWorldQuaternion(new T.Quaternion());const v=Math.min(1,Math.max(0,(t-.30)/.15),Math.max(0,(2.55-t)/.15));const smooth=v*v*(3-2*v);p.lerp(new T.Vector3(0,.68,.36),smooth);const gx=new T.Vector3(0,-1,.10).normalize(),gy=new T.Vector3(1,0,0);gy.addScaledVector(gx,-gy.dot(gx)).normalize();const gz=gx.clone().cross(gy);q.slerp(new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(gx,gy,gz)),smooth);x.prop.position.copy(p);x.prop.quaternion.copy(q);}if(x.kind==='bowstring'){const points=[new T.Vector3(-.65,-.18,0).applyMatrix4(x.prop.matrixWorld),x.model.getObjectByName('WristR').localToWorld(new T.Vector3(0,.135,-.035)),new T.Vector3(.65,-.18,0).applyMatrix4(x.prop.matrixWorld)];points.forEach((p,i)=>{display.worldToLocal(p);x.line.geometry.attributes.position.setXYZ(i,p.x,p.y,p.z)});x.line.geometry.attributes.position.needsUpdate=true;}}
 renderer.render(scene,camera);slider.value=t;stamp.textContent=t.toFixed(2)+' s';
}
select.onchange=()=>choose(select.value);play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause':'Play';};slider.oninput=()=>{playing=false;play.textContent='Play';setTime(+slider.value);};
choose(entries[0].c.name);
let then=performance.now(),phase=0;function tick(now){let dt=Math.min(.05,(now-then)/1000);then=now;if(playing){phase=t+dt;if(phase>entry.c.duration+.5){mixers.forEach(({a})=>a.reset().play());phase=0;}setTime(phase);}controls.update();renderer.render(scene,camera);requestAnimationFrame(tick);}requestAnimationFrame(tick);
window.review={ready:true,choose,setTime,packs,entries,scene,camera,renderer,controls,pause(){playing=false;play.textContent='Play';},sheet(times){
 playing=false;play.textContent='Play';const width=entry.kind==='foot'?2.2:3.2;
 for(let i=0;i<times.length;i++){setTime(times[i]);const o=clone(display);o.position.x=(i-(times.length-1)/2)*width;scene.add(o);sheetObjects.push(o);}
 scene.remove(display);camera.position.set(-5.5,entry.kind==='foot'?3.6:4.5,entry.kind==='foot'?9:13);controls.target.set(0,entry.kind==='foot'?.9:1.1,0);controls.update();document.querySelector('#info').textContent=entry.c.name+' · '+times.map(t=>t.toFixed(2)+' s').join(' / ')+' · original Quaternius mesh and rig';renderer.render(scene,camera);return times.length;
}};
