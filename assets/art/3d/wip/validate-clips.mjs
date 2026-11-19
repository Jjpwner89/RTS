// Contract checks for files delivered under BRIEFS.md section 7.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readGLB,accessor} from './rig-tools.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));

const reports=[];
for(const kind of ['foot','riders','horse']){
 const file=path.join(dir,'../clips-'+kind+'.glb');if(!fs.existsSync(file))continue;const src=readGLB(file),j=src.j;
 const check=(value,message)=>{if(!value)throw Error(kind+': '+message);};
 check(j.asset.version==='2.0','glTF 2');check(!(j.textures||[]).length,'no textures');
 if(kind!=='horse'){const original=readGLB(path.join(dir,'Male_Adventurer.source.glb'));check(JSON.stringify(j.nodes)===JSON.stringify(original.j.nodes),'exact original nodes and rest transforms');check(JSON.stringify(j.skins[0].joints)===JSON.stringify(original.j.skins[0].joints),'exact original skin joints');check(JSON.stringify(accessor(src,j.skins[0].inverseBindMatrices))===JSON.stringify(accessor(original,original.j.skins[0].inverseBindMatrices)),'original inverse binds');}
 const roots=j.nodes.map((n,i)=>['Root','root','CharacterArmature','Armature'].includes(n.name)?i:-1).filter(i=>i>=0);
 const clips=[];
 for(const a of j.animations){
 let duration=0;
 for(const c of a.channels){const s=a.samplers[c.sampler],times=accessor(src,s.input),values=accessor(src,s.output),d=c.target.path==='rotation'?4:3;duration=Math.max(duration,times.at(-1));check(values.every(Number.isFinite),'finite key values');times.forEach((v,i)=>check(Math.abs(v-i/30)<1e-5,'30 fps'));
 if(c.target.path==='rotation')for(let i=0;i<values.length;i+=4)check(Math.abs(Math.hypot(...values.slice(i,i+4))-1)<1e-5,'unit quaternions');
 if(roots.includes(c.target.node))check(values.every((v,i)=>Math.abs(v-values[i%d])<1e-6),'constant root');
 if(a.extras?.loop)check(values.slice(0,d).every((v,i)=>Math.abs(v-values[values.length-d+i])<1e-5),'matching loop endpoints');
 }clips.push({name:a.name,duration,loop:a.extras?.loop,tracks:a.channels.length});
 }
 let standard;
 if(process.env.GLTF_VALIDATOR){const validator=await import(process.env.GLTF_VALIDATOR);const result=await validator.validateBytes(new Uint8Array(fs.readFileSync(file)),{maxIssues:2000});check(result.issues.numErrors===0,'Khronos validation errors: '+JSON.stringify(result.issues));const warnings=result.issues.messages.filter(m=>m.severity===1);check(warnings.every(m=>m.code==='NODE_SKINNED_MESH_NON_ROOT'),'unexpected glTF warning');standard={errors:result.issues.numErrors,warnings:result.issues.numWarnings,warningNote:'Only source-inherited NODE_SKINNED_MESH_NON_ROOT; exact source hierarchy retained.'};}
 reports.push({file:path.basename(file),bytes:fs.statSync(file).size,joints:j.skins[0].joints.length,checks:'passed',khronos:standard,clips});
}
fs.writeFileSync(path.join(dir,'validation-report.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports,null,2));
