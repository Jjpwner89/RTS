import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight-110);renderer.setClearColor('#e3dfd1');renderer.shadowMap.enabled=true;document.body.append(renderer.domElement);
const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x6c5e45,2));const light=new T.DirectionalLight(0xfff4de,3);light.position.set(-3,7,5);light.castShadow=true;scene.add(light);
const camera=new T.PerspectiveCamera(33,innerWidth/(innerHeight-110),.01,100);camera.position.set(-3,2.1,4);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.9,.1);controls.update();
const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardMaterial({color:0xb4b5a4,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);scene.add(new T.GridHelper(12,24,0x858b7c,0xa4aa9a));
let g=await new GLTFLoader().loadAsync('../clips-foot.glb');let model=g.scene;scene.add(model);model.traverse(o=>{if(o.name==='Backpack')o.visible=false;if(o.isMesh){o.castShadow=true;o.frustumCulled=false;for(let m of [].concat(o.material)){m.flatShading=true;m.roughness=.9;}}});
const shaft=new T.Mesh(new T.CylinderGeometry(.014,.017,2.6,8),new T.MeshStandardMaterial({color:0x695038}));shaft.rotation.z=-Math.PI/2;shaft.position.x=.4;
const tip=new T.Mesh(new T.ConeGeometry(.045,.23,4),new T.MeshStandardMaterial({color:0x858e91,roughness:.6}));tip.rotation.z=-Math.PI/2;tip.position.x=1.81;
const prop=new T.Group();prop.position.set(0,.135,-.035);prop.add(shaft,tip);model.getObjectByName('WristR').add(prop);
let mixer=new T.AnimationMixer(model),action,playing=true,t=0;
const select=document.querySelector('#clip'),slider=document.querySelector('#time'),stamp=document.querySelector('#stamp');
g.animations.forEach(c=>select.add(new Option(c.name,c.name)));
function choose(name){mixer.stopAllAction();const c=g.animations.find(c=>c.name===name);action=mixer.clipAction(c);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();t=0;slider.max=c.duration;return c;}
select.onchange=()=>choose(select.value);choose(g.animations[0].name);
document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'Pause':'Play';};
function setTime(v){t=v;mixer.setTime(t);model.updateMatrixWorld(true);renderer.render(scene,camera);slider.value=t;stamp.textContent=t.toFixed(2)+' s';}
slider.oninput=()=>{playing=false;setTime(+slider.value);};
let then=performance.now();function frame(now){let dt=Math.min(.05,(now-then)/1000);then=now;if(playing){t+=dt;if(t>action.getClip().duration+.5){action.reset().play();t=0;}setTime(Math.min(t,action.getClip().duration));}renderer.render(scene,camera);requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.review={ready:true,choose,setTime,model,g,scene,camera,renderer,controls,prop,pause(){playing=false;},sheet(times){playing=false;scene.remove(model);const xs=[];times.forEach((tm,i)=>{let o=clone(model),m=new T.AnimationMixer(o),a=m.clipAction(action.getClip());a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();m.setTime(tm);o.position.x=(i-(times.length-1)/2)*2.2;scene.add(o);xs.push(o);});camera.position.set(-5.5,3.6,9);controls.target.set(0,.9,.15);controls.update();renderer.render(scene,camera);return xs.length;}};
