const fs=require('fs'),http=require('http'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/Users/dpuser/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../../../..'),mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{let p=req.url==='/validation-female.glb'?(process.env.FEMALE_SOURCE||'/tmp/rts-medieval-clips/Female_Medieval.glb'):path.join(root,decodeURIComponent(new URL(req.url,'http://local').pathname));fs.readFile(p,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(e?'missing':b);});}).listen(8897,'127.0.0.1',async()=>{
 let browser;try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const p=await browser.newPage({viewport:{width:1200,height:850}});await p.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',async route=>route.fulfill({path:path.join(process.env.THREE_DIR||'/tmp/rts-medieval-clips/node_modules/three',route.request().url().split('three@0.170.0/')[1]),contentType:'text/javascript'}));
 const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/No target node|not found|Error/i.test(m.text()))errors.push(m.text());});
 await p.goto('http://127.0.0.1:8897/assets/art/3d/wip/review.html');await p.waitForFunction(()=>window.review?.ready);
 const result=await p.evaluate(async()=>{
 const T=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),{clone}=await import('three/addons/utils/SkeletonUtils.js');
 const loader=new GLTFLoader(),sources={male:await loader.loadAsync('Male_Adventurer.source.glb'),female:await loader.loadAsync('/validation-female.glb'),horse:await loader.loadAsync('Horse.normalized.glb')};
 const reports=[];
 for(const e of review.entries){
  const kinds=e.kind==='horse'?['horse']:['male','female'];
  for(const kind of kinds){
   const source=clone(sources[kind].scene),saved=clone(e.g.scene),mixers=[source,saved].map(o=>{let m=new T.AnimationMixer(o),a=m.clipAction(e.c);a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();return m;});
   const targetNames=[...new Set(e.c.tracks.map(t=>t.name.split('.')[0]))],missing=targetNames.filter(n=>!source.getObjectByName(n));
   let maxDifference=0,minMeshY=Infinity,frames=Math.round(e.c.duration*30),sampled=0;
   for(let f=0;f<=frames;f++){
    const tm=Math.min(f/30,e.c.duration);mixers.forEach(m=>m.setTime(tm));source.updateMatrixWorld(true);saved.updateMatrixWorld(true);
    for(const name of targetNames){const a=source.getObjectByName(name),b=saved.getObjectByName(name);if(a&&b)maxDifference=Math.max(maxDifference,a.getWorldPosition(new T.Vector3()).distanceTo(b.getWorldPosition(new T.Vector3())));}
    if(kind!=='female'&&(f%6===0||f===frames)){saved.traverse(o=>{if(!o.isSkinnedMesh||o.name==='Backpack')return;o.skeleton.update();const pos=o.geometry.attributes.position,v=new T.Vector3();for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);o.applyBoneTransform(i,v);v.applyMatrix4(o.matrixWorld);if(!Number.isFinite(v.x+v.y+v.z))throw Error(e.c.name+' has invalid skinned vertices');minMeshY=Math.min(minMeshY,v.y);}});sampled++;}
   }
   reports.push({clip:e.c.name,source:kind,frames:frames+1,missingTargets:missing,maxJointPositionDifference:maxDifference,meshSamples:sampled,minMeshY:Number.isFinite(minMeshY)?minMeshY:null});
  }
 }
 return reports;
 });
 const equipmentChecks=await p.evaluate(async()=>{
  const T=await import('three');review.choose('Crossbow_Span');review.pause();
  let maxBowVerticalSpan=0,minLoadedForwardDot=1;
  for(let frame=0;frame<=90;frame++){
   review.setTime(frame/30);
   const crossbow=review.scene.getObjectByName('ReviewCrossbow'),bow=crossbow.children.find(n=>n.geometry?.type==='BoxGeometry');
   const left=bow.localToWorld(new T.Vector3(0,-.3,0)),right=bow.localToWorld(new T.Vector3(0,.3,0));
   maxBowVerticalSpan=Math.max(maxBowVerticalSpan,Math.abs(left.y-right.y));
   if(frame/30>=2.55){const forward=crossbow.localToWorld(new T.Vector3(1,0,0)).sub(crossbow.localToWorld(new T.Vector3())).normalize();minLoadedForwardDot=Math.min(minLoadedForwardDot,forward.z);}
  }
  if(maxBowVerticalSpan>1e-5||minLoadedForwardDot<.999)throw Error('Crossbow bow must be horizontal and its loaded stock must face forward');
  return {clip:'Crossbow_Span',frames:91,maxBowVerticalSpan,minLoadedForwardDot};
 });
 fs.writeFileSync(path.join(__dirname,'runtime-validation.json'),JSON.stringify({errors,results:result,equipmentChecks},null,2)+'\n');
 if(errors.length||result.some(r=>r.missingTargets.length||r.maxJointPositionDifference>1e-5))throw Error('Runtime compatibility failed; see report');
 console.log(JSON.stringify({errors,equipmentChecks,clips:22,originalRigApplications:result.length,worstRetargetDifference:Math.max(...result.map(r=>r.maxJointPositionDifference)),groundBounds:result.filter(r=>r.minMeshY!==null).map(r=>[r.clip,+r.minMeshY.toFixed(4)])}));
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser?.close();server.close();}
});
