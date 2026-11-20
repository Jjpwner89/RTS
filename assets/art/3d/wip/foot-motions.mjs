// Additional foot motions, authored on the original Quaternius skeleton.
import {V,curve,rad} from './rig-tools.mjs';
const TAU=Math.PI*2, mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function footMotions(h){
 const r=h.r;
 function ready(y=.80,z=.02,lean=4,twist=0){h.reset();h.body(y,z,lean,twist);h.legs();}
 function tool(rear,axis,gap=.22,stable=false){const v=V(axis).normalize();h.hand('R',rear,v.toArray(),stable?[1,0,0]:null);h.hand('L',V(rear).addScaledVector(v,gap).toArray(),v.toArray(),stable?[-1,0,0]:null);}
 function stride(u,span=.24,lift=.07,duty=.62){
  u=(u%1+1)%1;if(u<duty)return {z:span*(1-2*u/duty),y:0};
  let t=(u-duty)/(1-duty);return {z:-span+2*span*(t*t*(3-2*t)),y:lift*Math.sin(Math.PI*t)};
 }
 function walk(u,carry=false,panic=false){
  let a=stride(u,panic?.34:.23,panic?.19:.065,panic?.42:.62),b=stride(u+.5,panic?.34:.23,panic?.19:.065,panic?.42:.62);
  h.reset();h.body((panic?.78:.84)+.018*Math.cos(u*TAU*2),.02,panic?16:3,panic?-14:3*Math.sin(u*TAU),.012*Math.sin(u*TAU));
  h.legs([.13,.02275+a.y,.06+a.z],[-.13,.02275+b.y,.06+b.z]);
 }
 return [
 ['Spear_Brace',36,false,(t,u)=>{
  const k=curve(u,[[0,0],[.18,0],[.78,1],[1,1]]);ready(.79-.36*k,.015-.04*k,5+14*k,-12+8*k);
  h.legs([.145,.02275,.12+.22*k],[-.17,.02275,-.19-.17*k],{L:V([.18,.35,1]),R:V([-.17,-.2,-.06])});
  tool(mix([-.20,1.08,.24],[-.20,.46,.12],k),mix([.65,.15,1],[.12,.50,.86],k),.29);
 },{hold:true,events:[{time:1,event:'brace-held'}]}],
 ['March_Upright',36,true,(t,u)=>{
  walk(u);h.hand('R',[-.24,1.25,.22],[0,1,0],[0,0,1]);h.hand('L',[.21,1.00,.04+.14*Math.sin(TAU*u)],null,[0,-1,0],.6);
 },{}],
 ['Bow_Loose',48,false,(t,u)=>{
  let draw=curve(u,[[0,0],[.17,.1],[.44,1],[.63,1],[.72,.7],[1,0]]),release=curve(u,[[0,0],[.62,0],[.78,1],[.84,1],[1,0]]);
  ready(.82,.01,2,-18);h.legs([.16,.02275,.04],[-.17,.02275,-.09]);r.turn('Head',[0,1,0],15);
  h.hand('L',mix([.18,1.08,.28],[.18,1.38,.47],draw),[0,1,0],[0,0,1]);
  let right=u<.22?mix([-.12,1.18,.24],[.05,1.30,.30],curve(u,[[0,0],[.18,1],[.22,1]])):u<.64?mix([.05,1.30,.30],[-.13,1.56,.10],curve(u,[[.22,0],[.46,1],[.64,1]])):u<.80?mix([-.13,1.56,.10],[-.32,1.55,-.10],release):mix([-.32,1.55,-.10],[-.12,1.18,.24],curve(u,[[.80,0],[1,1]]));
  if(u>.80)right[2]+=.24*Math.sin(Math.PI*(u-.80)/.20);
  h.hand('R',right,null,[0,0,-1],release*.85,V([-.6,1.45,-.2]));
 },{weapon:{bone:'Wrist.L',axis:[1,0,0],grip:[0,.135,-.035]},events:[{time:.30,event:'nock'},{time:1.0666666667,event:'loose'},{time:1.30,event:'reach-next-arrow'}]}],
 ['Crossbow_Span',90,false,(t,u)=>{
  const bend=curve(u,[[0,0],[.12,1],[.50,1],[.72,.7],[.88,0],[1,0]]);
  ready(.81-.26*bend,.02+.04*bend,4+43*bend,-3);
  const stirrup=curve(u,[[0,0],[.14,1],[.80,1],[.96,0],[1,0]]);h.legs([.17,.02275,.04],[-.05,.02275+.05*Math.sin(Math.PI*stirrup),-.08+.46*stirrup]);
  const pull=curve(u,[[0,0],[.18,0],[.40,1],[.47,1],[.57,0],[1,0]]);
  const lowY=.65+.20*pull;
  let R=mix([-.11,1.20,.23],[-.10,lowY,.41],bend),L=mix([-.11,1.20,.39],[.10,lowY,.41],bend);
  if(u>.48&&u<.73){const reach=Math.sin(Math.PI*(u-.48)/.25);R=mix(R,[-.22,.85,.0],reach);}
  const dir=mix([0,0,1],[0,-1,.1],bend);
  const gripAxis=[0,dir[2],-dir[1]];h.hand('R',R,gripAxis,[0,0,1]);h.hand('L',L,gripAxis,[0,0,1]);
 },{weapon:{bone:'Wrist.R',grip:[0,.135,-.035],barrelDirection:[0,0,1],bowDirection:[1,0,0],orientationSpace:'model'},equipmentGrounded:[.4,2.4],events:[{time:.4,event:'foot-in-stirrup'},{time:1.2,event:'string-spanned'},{time:2.1,event:'bolt-laid'},{time:2.8,event:'shoot'}]}],
 ['Shield_Block',18,false,(t,u)=>{
  const k=curve(u,[[0,0],[.38,1],[.64,1],[1,0]]);ready(.81-.05*k,.02+.035*k,3+13*k,-6);
  h.hand('L',mix([.20,1.02,.22],[.10,1.36,.35],k),[1,0,0],[0,0,1]);
  h.hand('R',[-.30,1.23,.27],[0,1,0],[0,0,1]);
 },{events:[{time:.2,event:'block-impact'}]}],
 ['Shield_Wall',60,true,(t,u)=>{
  ready(.73+.007*Math.sin(TAU*u),.015,14,-8);h.legs([.19,.02275,.15],[-.18,.02275,-.20]);
  h.hand('L',[.10,1.25,.32],[1,0,0],[0,0,1]);h.hand('R',[-.22,1.48,.18],[0,.45,1],[0,0,1]);
 },{}],
 ['Javelin_Throw',30,false,(t,u)=>{
  const wind=curve(u,[[0,0],[.30,1],[.43,1],[.63,0],[1,0]]),drive=curve(u,[[0,0],[.38,0],[.65,1],[.82,1],[1,0]]);
  ready(.81-.04*drive,.01+.12*drive,3+15*drive,-12-25*wind+40*drive);
  const step=curve(u,[[0,0],[.18,0],[.52,1],[.77,1],[1,0]]);h.legs([.15,.02275+.07*Math.sin(Math.PI*step),.08+.23*step],[-.16,.02275,-.20]);
  const hand= u<.43?mix([-.20,1.05,.16],[-.22,1.61,-.09],wind):u<.68?mix([-.22,1.61,-.09],[-.08,1.42,.55],curve(u,[[.43,0],[.65,1],[.68,1]])):mix([-.08,1.42,.55],[-.20,1.05,.16],curve(u,[[.68,0],[1,1]]));
  hand[0]-=.16*Math.sin(Math.PI*u);
  const opened=curve(u,[[0,0],[.58,0],[.70,.8],[1,.8]]),relax=curve(u,[[0,0],[.66,0],[.82,1],[1,1]]);
  if(relax<1)h.hand('R',hand,[0,.15,1],[0,-1,0],opened,V([-.65,1.2,-.5]));
  if(relax>0){
   const names=['UpperArm.R','LowerArm.R','Wrist.R'],held=names.map(n=>r.by[n].quaternion.clone());
   h.hand('R',hand,null,null,relax<1?0:opened,V([-.65,1.2,-.5]));
   if(relax<1)names.forEach((n,i)=>r.by[n].quaternion.slerp(held[i],1-relax));
   r.update();
  }
  const leftShoulder=r.pos('UpperArm.L');
  h.hand('L',leftShoulder.clone().add(V([.07,-.51,.04])).toArray(),null,[0,-1,0],.7,leftShoulder.clone().add(V([.05,-.4,0])));
 },{events:[{time:.6333333333,event:'release-javelin'}]}],
 ['Rout',22,true,(t,u)=>{
  walk(u,false,true);r.turn('Neck',[0,1,0],-32);r.turn('Head',[0,1,0],-32+8*Math.sin(TAU*u));
  h.hand('R',[-.23,1.00,.08+.25*Math.sin(TAU*u)],null,[0,-1,0],1);h.hand('L',[.24,1.04,.08-.25*Math.sin(TAU*u)],null,[0,-1,0],1);
 },{equipment:'none'}],
 ['Cheer',45,false,(t,u)=>{
  const k=curve(u,[[0,0],[.26,1],[.48,.9],[.64,1],[1,0]]);ready(.83+.018*k,.02,-6*k,0);
  r.turn('Shoulder.R',[0,0,1],-45*k);
  const raised=[-.23,1.10+.74*k,.16];h.hand('R',raised,[0,1,0],[0,0,1],0,V([-.5,1.55,-.2]));h.hand('L',mix([.22,1.02,.12],[.30,1.52,.20],k),null,[0,0,1],.6);
  r.turn('Head',[1,0,0],-10*k);
 },{}],
 ['Chop',42,true,(t,u)=>{
  const lift=curve(u,[[0,0],[.35,1],[.46,1],[.64,0],[.76,0],[1,0]]);ready(.68+.13*lift,.04,32-26*lift,-5+8*lift);h.legs([.20,.02275,.12],[-.20,.02275,-.12]);
  tool(mix([-.07,.94,.29],[-.13,1.46,.38],lift),mix([0,-.5,1],[0,.85,-.25],lift),.16,true);
 },{events:[{time:.9,event:'axe-contact'}]}],
 ['Hoe',54,true,(t,u)=>{
  let push=curve(u,[[0,0],[.36,1],[.54,1],[.90,0],[1,0]]);ready(.66,.03+.05*push,35,-4);
  tool([-.15,.88,.13+.12*push],[.15,-.86,.49],.18);
 },{events:[{time:1.2,event:'pull-soil'}]}],
 ['Mine',48,true,(t,u)=>{
  let lift=curve(u,[[0,0],[.34,1],[.45,1],[.64,0],[.81,0],[1,0]]);ready(.73+.08*lift,.04,26-22*lift,-9+16*lift);h.legs([.19,.02275,.08],[-.19,.02275,-.14]);
  tool(mix([-.12,1.01,.26],[-.14,1.43,.35],lift),mix([0,-.15,1],[0,.95,-.1],lift),.15,true);
 },{events:[{time:1.0333333333,event:'pick-contact'}]}],
 ['Carry',42,true,(t,u)=>{
  walk(u,true);r.turn('Torso',[0,0,1],-7);h.hand('R',[-.30,1.52,.22],null,null,.35);h.hand('L',[.22,1.02,.06+.08*Math.sin(TAU*u)],null,[0,-1,0],.7);
 },{equipment:'sack on right shoulder'}]
 ];
}
