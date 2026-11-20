// Foot motions on the original Quaternius skeleton.
// Armed poses use Human.arm (Claude, 2026-11-20): every grip names its hand position, the
// direction the weapon points and where the elbow goes, so shoulder, elbow and wrist agree.
// Elbow targets are written relative to the shoulder (UpperArm) after the body is posed.
import {V,curve,gripAxis} from './rig-tools.mjs';
const TAU=Math.PI*2, mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
// a with its component along f removed: a grip axis square to the hand.
// Keyed arm: keys are [time, upper-arm direction, forearm direction, weapon direction]; directions
// blend between keys and Human.aimFk finds a natural forearm roll and wrist bend for each frame.
function keyed(h,s,keys,u,opts){let i=1;while(i<keys.length-1&&u>keys[i][0])i++;const a=keys[i-1],b=keys[i],w=curve(u,[[a[0],0],[b[0],1]]);return h.aimFk(s,mix(a[1],b[1],w),mix(a[2],b[2],w),mix(a[3],b[3],w),opts);}
const perp=(a,f)=>{const x=V(a),y=V(f).normalize();return x.addScaledVector(y,-x.dot(y)).normalize().toArray();};
export const SPEAR_DIAG=40, SWORD_DIAG=20, TOOL_DIAG=25;
const GRIP=[0,.135,-.035];
// Crossbow resting nose-down in front for spanning: grip point and barrel direction, model space.
const CROSSBOW_GROUND={grip:[0,.68,.36],barrel:[0,-.995,.0995],bow:[1,0,0]};
export const weapon=(bone,diag,more={})=>({weapon:{bone,grip:GRIP,axis:gripAxis(bone.endsWith('R')?'R':'L',diag).toArray().map(v=>+v.toFixed(4)),...more}});

// Spear guard and thrust, shared by Spear_Thrust and Spear_Brace. k: 0 guard, 1 full thrust.
// Guard: Spear_Brace's opening stance with the right elbow pulled in beneath the shoulder and
// the forearm running nearly along the shaft. Thrust: both hands drive forward and up while
// the shaft slides through the front hand.
export function spearGuard(k=0){
 return {body:[.79-.04*k,.01+.14*k,8+10*k,-22+4*k],shoulders:[10*k,-6-10*k],
  aim:[.10,.22,1],rear:[.05+.03*k,-.23+.12*k,.30+.14*k],elbowR:[-.03,-.20,-.02+.12*k],sep:.42-.20*k,elbowL:[.10,-.30,.10]};
}
export function spearArms(h,g){
 const r=h.r,S=r.pos('UpperArm.R'),aim=V(g.aim).normalize(),rear=g.rearWorld?V(g.rearWorld):S.clone().add(V(g.rear));
 h.arm('R',rear,aim,S.clone().add(V(g.elbowR)),{diag:SPEAR_DIAG});
 const SL=r.pos('UpperArm.L');let sep=g.sep;
 while(sep>.14&&rear.clone().addScaledVector(aim,sep).distanceTo(SL)>.47)sep-=.005;
 h.arm('L',rear.clone().addScaledVector(aim,sep),aim,SL.clone().add(V(g.elbowL)),{diag:SPEAR_DIAG});
}
export function spearPose(h,u,k){
 const r=h.r,g=spearGuard(k);h.reset();
 const step=curve(u,[[0,0],[.14,0],[.40,1],[.62,1],[.95,0],[1,0]]);
 h.body(...g.body);r.turn('Shoulder.R',[0,1,0],g.shoulders[0]);r.turn('Shoulder.L',[0,1,0],g.shoulders[1]);
 h.legs([.15,.02275+.05*Math.sin(Math.PI*step),.13+.16*step],[-.16,.02275,-.20]);
 spearArms(h,g);
}

export function footMotions(h){
 const r=h.r,S=s=>r.pos('UpperArm.'+s),at=(s,v)=>S(s).add(V(v));
 function ready(y=.80,z=.02,lean=4,twist=0){h.reset();h.body(y,z,lean,twist);h.legs();}
 function stride(u,span=.24,lift=.07,duty=.62){
  u=(u%1+1)%1;if(u<duty)return {z:span*(1-2*u/duty),y:0};
  let t=(u-duty)/(1-duty);return {z:-span+2*span*(t*t*(3-2*t)),y:lift*Math.sin(Math.PI*t)};
 }
 function walk(u,carry=false,panic=false){
  let a=stride(u,panic?.34:.23,panic?.19:.065,panic?.42:.62),b=stride(u+.5,panic?.34:.23,panic?.19:.065,panic?.42:.62);
  h.reset();h.body((panic?.78:.84)+.018*Math.cos(u*TAU*2),.02,panic?16:3,panic?-14:3*Math.sin(u*TAU),.012*Math.sin(u*TAU));
  h.legs([.13,.02275+a.y,.06+a.z],[-.13,.02275+b.y,.06+b.z]);
 }
 // Two hands on one haft: the right hand at `rear`, the left `gap` further along `axis`.
 function haft(rear,axis,gap,elbowR,elbowL,diag=TOOL_DIAG){
  const v=V(axis).normalize();h.arm('R',rear,v,at('R',elbowR),{diag});h.arm('L',V(rear).addScaledVector(v,gap),v,at('L',elbowL),{diag});
 }
 return [
 ['Spear_Brace',36,false,(t,u)=>{
  // From the Spear_Thrust guard down onto the right knee; the butt grounds behind the right
  // foot and the point rises toward a horse's chest.
  const k=curve(u,[[0,0],[.18,0],[.78,1],[1,1]]),g=spearGuard(0);h.reset();
  h.body(...mix(g.body,[.40,.0,28,-20],k));r.turn('Shoulder.R',[0,1,0],0);r.turn('Shoulder.L',[0,1,0],-6-10*k);
  h.legs([.145,.02275,.13+.21*k],[-.16-.01*k,.02275+.03*k,-.20-.04*k],{L:V([.18,.35+.0*k,1]),R:V(mix([-.16,.5,1],[-.17,-.2,-.06],k))});
  const aim=V(mix(g.aim,[.06,.70,1],k)).normalize(),braced=S('R').add(V([-.03,-.36,.30])),guard=S('R').add(V(g.rear));
  // The right hand sits where a kneeling arm reaches; the kneel depth puts the butt (0.91 m back) on the ground.
  spearArms(h,{...g,aim:aim.toArray(),rearWorld:guard.lerp(braced,k).toArray(),elbowR:mix(g.elbowR,[-.10,-.18,-.06],k),sep:g.sep-.16*k,elbowL:mix(g.elbowL,[.12,-.28,.12],k)});
 },{hold:true,...weapon('Wrist.R',SPEAR_DIAG,{lengthBehindGrip:.91}),events:[{time:1,event:'brace-held'}]}],
 ['March_Upright',36,true,(t,u)=>{
  // Shaft upright, resting back against the right shoulder; fist at the chest, elbow down.
  walk(u);h.arm('R',at('R',[-.03,-.10,.31]),[0,1,-.25],at('R',[-.04,-.25,-.04]),{diag:0});
  h.hand('L',[.21,1.00,.04+.14*Math.sin(TAU*u)],null,[0,-1,0],.6);
 },weapon('Wrist.R',0)],
 ['Bow_Loose',48,false,(t,u)=>{
  let draw=curve(u,[[0,0],[.17,.1],[.44,1],[.63,1],[.72,.7],[1,0]]),release=curve(u,[[0,0],[.62,0],[.78,1],[.84,1],[1,0]]);
  ready(.82,.01,2,-18);h.legs([.16,.02275,.04],[-.17,.02275,-.09]);r.turn('Head',[0,1,0],15);
  // Bow hand: thumb up, the bow upright; the arm straightens toward the target as it draws.
  const bowFore=mix([.05,-.30,1],[.04,.08,1],draw);h.pose('L',mix([.25,-1,.35],[.12,.05,1],draw),bowFore,perp([0,1,0],bowFore),{diag:0});
  let right=u<.22?mix([-.12,1.18,.24],[.05,1.30,.30],curve(u,[[0,0],[.18,1],[.22,1]])):u<.64?mix([.05,1.30,.30],[-.13,1.56,.10],curve(u,[[.22,0],[.46,1],[.64,1]])):u<.80?mix([-.13,1.56,.10],[-.32,1.55,-.10],release):mix([-.32,1.55,-.10],[-.12,1.18,.24],curve(u,[[.80,0],[1,1]]));
  if(u>.80)right[2]+=.24*Math.sin(Math.PI*(u-.80)/.20);
  h.hand('R',right,null,[0,0,-1],release*.85,V([-.6,1.45,-.2]));
 },{...weapon('Wrist.L',0),events:[{time:.30,event:'nock'},{time:1.0666666667,event:'loose'},{time:1.30,event:'reach-next-arrow'}]}],
 ['Crossbow_Span',90,false,(t,u)=>{
  // Aim, nose down into the stirrup, pull the string up with both hands, take a bolt from the
  // right hip and lay it, raise and shoot. While held, the crossbow rides on the right hand's
  // grip with the barrel to +Z and the bow level from side to side; while spanning it rests
  // nose-down on the ground (see the weapon metadata), and the hands work around it.
  const held=curve(u,[[0,1],[.06,1],[.15,0],[.70,0],[.84,1],[1,1]]),bend=curve(u,[[0,0],[.13,1],[.22,1],[.45,.65],[.68,.6],[.84,0],[1,0]]),kick=curve(u,[[0,0],[.92,0],[.94,1],[1,0]]);
  ready(.81-.23*bend,.02+.04*bend,6+26*bend-5*kick,-16+13*bend);
  r.turn('Head',[1,0,0],8*(1-bend));r.turn('Shoulder.L',[0,1,0],-10*held);
  const stirrup=curve(u,[[0,0],[.12,0],[.19,1],[.64,1],[.72,0],[1,0]]);
  h.legs([.17,.02275,.04],[-.05,.02275+.06*Math.sin(Math.PI*stirrup),-.08+.50*stirrup]);
  // Right arm, keyed: aim -> holding the stock as it goes down -> string -> bolt at the hip ->
  // laying it in the groove -> the stock again -> raise to aim.
  const AIM=[[.26,-.97,0],[0,.5,.87],[0,0,1]],GROUND=[[.22,-.97,.13],[.13,-.97,.22],[0,-.995,.1]],
    STRING0=[[0,-.87,.5],[.22,-.97,.13],[1,0,.05]],STRING1=[[0,-.71,.71],[.13,-.97,.22],[1,0,.05]],
    QUIVER=[[-.75,-.5,.43],[.35,-.71,-.61],[0,-1,.2]],GROOVE=[[0,-.87,.5],[.35,-.71,.61],[0,-.3,1]];
   const R=keyed(h,'R',[[0,...AIM],[.06,...AIM],[.15,...GROUND],[.20,...STRING0],[.50,...STRING1],[.56,...QUIVER],[.62,...GROOVE],[.67,...GROOVE],[.71,...GROUND],[.84,...AIM],[1,...AIM]],u,{diag:30});
  // Left hand, keyed the same way so its wrist stays natural: under the fore-stock while held, on
  // the stock as it goes down, on the string beside the right hand, then steadying the stock
  // while the right fetches and lays the bolt.
  const AIM_L=[[0,-.71,.71],[-.48,.26,.84],[0,0,1]],STOCK_L=[[-.13,-.97,-.22],[0,-.71,.71],[0,-.995,.1]],
   STRING0_L=[[0,-.87,.5],[-.22,-.97,.13],[-1,0,.05]],STRING1_L=[[.35,-.71,.61],[-.25,-.87,.43],[-1,0,.05]],STEADY_L=[[-.13,-.97,.22],[0,-.97,.26],[0,-.995,.1]];
  keyed(h,'L',[[0,...AIM_L],[.06,...AIM_L],[.15,...STOCK_L],[.20,...STRING0_L],[.47,...STRING1_L],[.53,...STEADY_L],[.67,...STEADY_L],[.73,...STOCK_L],[.84,...AIM_L],[1,...AIM_L]],u,{diag:20});
 },{...weapon('Wrist.R',30,{crossbow:{held:{barrel:[0,0,1],bow:[1,0,0],space:'model',at:'right grip'},grounded:CROSSBOW_GROUND,blendToGround:[.18,.45],blendToHeld:[2.10,2.52]}}),events:[{time:.5,event:'nose-down'},{time:.57,event:'foot-in-stirrup'},{time:1.35,event:'string-spanned'},{time:1.86,event:'bolt-laid'},{time:2.80,event:'shoot'}]}],
 ['Shield_Block',18,false,(t,u)=>{
  // Shield arm comes up and braces: forearm forward, so the shield (normal = hand's long axis) faces the blow.
  const k=curve(u,[[0,0],[.38,1],[.64,1],[1,0]]);ready(.81-.05*k,.02+.035*k,3+13*k,-6);
  const shieldFore=mix([0,-.15,1],[-.30,.55,1],k);h.pose('L',mix([.20,-1,.20],[.45,-.35,1],k),shieldFore,perp([0,1,0],shieldFore),{diag:0});
  h.arm('R',at('R',[-.02,-.22,.26]),[.05,.75,1],at('R',[-.06,-.18,-.02]),{diag:SWORD_DIAG});
 },{...weapon('Wrist.R',SWORD_DIAG,{shield:{bone:'Wrist.L',normal:'hand +Y'}}),events:[{time:.2,event:'block-impact'}]}],
 ['Shield_Wall',60,true,(t,u)=>{
  // Crouched behind the raised shield; the sword is held high at the right shoulder, point
  // forward over the rim, ready to stab down.
  const sway=Math.sin(TAU*u);ready(.73+.007*sway,.015,14,-8);h.legs([.19,.02275,.15],[-.18,.02275,-.20]);
  h.arm('L',[.10,1.24,.36],[0,1,0],at('L',[.16,-.16,.02]),{diag:0});
  // Overhand stab ready: elbow raised, forearm forward and down, point forward over the rim.
  h.aimFk('R',[.25,.87+.03*sway,.43],[-.48,-.26,.84],[0,-.25,1],{diag:SWORD_DIAG});
 },weapon('Wrist.R',SWORD_DIAG,{shield:{bone:'Wrist.L',normal:'hand +Y'}})],
 ['Javelin_Throw',30,false,(t,u)=>{
  const wind=curve(u,[[0,0],[.30,1],[.43,1],[.63,0],[1,0]]),drive=curve(u,[[0,0],[.38,0],[.65,1],[.82,1],[1,0]]);
  ready(.81-.04*drive,.01+.12*drive,3+15*drive,-12-25*wind+40*drive);
  const step=curve(u,[[0,0],[.18,0],[.52,1],[.77,1],[1,0]]);h.legs([.15,.02275+.07*Math.sin(Math.PI*step),.08+.23*step],[-.16,.02275,-.20]);
  // Overhand: carried elbow-high at the shoulder, drawn back beside the head, released high and
  // forward, then the empty hand follows through down and across.
  const opened=curve(u,[[0,0],[.58,0],[.70,.8],[1,.8]]);
  keyed(h,'R',[[0,[.25,.87,-.43],[-.48,-.26,.84],[0,.1,1]],[.43,[0,.87,-.5],[-.87,.5,0],[0,.3,1]],[.63,[.22,.97,.13],[0,.71,.71],[0,.2,1]],[.80,[-.48,-.26,.84],[.35,-.71,.61],[0,-.3,1]],[1,[.25,.87,-.43],[-.48,-.26,.84],[0,.1,1]]],u,{diag:30,open:opened});
  // Left arm stays low, the elbow held by the side; the forearm swings forward to balance.
  const swing=curve(u,[[0,0],[.40,1],[.70,0],[1,0]]);
  h.hand('L',at('L',[.06,-.42,.10+.12*swing]),null,[0,-1,0],.7,at('L',[.05,-.30,-.06]));
 },{...weapon('Wrist.R',30),events:[{time:.6333333333,event:'release-javelin'}]}],
 ['Rout',22,true,(t,u)=>{
  walk(u,false,true);r.turn('Neck',[0,1,0],-32);r.turn('Head',[0,1,0],-32+8*Math.sin(TAU*u));
  h.hand('R',[-.23,1.00,.08+.25*Math.sin(TAU*u)],null,[0,-1,0],1);h.hand('L',[.24,1.04,.08-.25*Math.sin(TAU*u)],null,[0,-1,0],1);
 },{equipment:'none'}],
 ['Cheer',45,false,(t,u)=>{
  // The sword hand goes straight up into the sky; the blade points up and a little back.
  const k=curve(u,[[0,0],[.26,1],[.48,.9],[.64,1],[1,0]]);ready(.83+.018*k,.02,-6*k,0);
  keyed(h,'R',[[0,[-.13,-.97,-.22],[0,-.26,.97],[0,.6,1]],[.5,[-.35,0,.6],[0,.6,.8],[0,1,.3]],[1,[-.22,.97,-.13],[0,1,0],[0,1,-.3]]],k,{diag:SWORD_DIAG});
  h.hand('L',mix([.22,1.02,.12],[.30,1.52,.20],k),null,[0,0,1],.6);
  r.turn('Head',[1,0,0],-10*k);
 },weapon('Wrist.R',SWORD_DIAG)],
 ['Chop',42,true,(t,u)=>{
  // Axe lifted over the right shoulder, then down onto the log. Right hand nearer the head.
  const lift=curve(u,[[0,0],[.35,1],[.46,1],[.64,0],[.76,0],[1,0]]);ready(.68+.13*lift,.04,32-26*lift,-5+8*lift);h.legs([.20,.02275,.12],[-.20,.02275,-.12]);
  // Right hand nearer the axe head, left at the end of the haft; the haft runs in line with the
  // forearms at the strike and back over the right shoulder at the top of the lift.
  const g=h.aimFk('R',mix([0,-.5,.87],[-.75,-.5,.43],lift),mix([0,-.71,.71],[.22,.97,-.13],lift),mix([0,-.5,1],[-.1,.5,-1],lift),{diag:TOOL_DIAG});
  const ax=g.axis.clone().normalize();h.arm('L',g.grip.clone().addScaledVector(ax,-.18),ax,at('L',mix([.05,-.28,.12],[.28,.0,.18],lift)),{diag:TOOL_DIAG,elbowSearch:.12});
 },{...weapon('Wrist.R',TOOL_DIAG,{offhand:-.18}),events:[{time:.9,event:'axe-contact'}]}],
 ['Hoe',54,true,(t,u)=>{
  // Bent over the hoe; the blade bites forward and is drawn back toward the feet.
  let push=curve(u,[[0,0],[.36,1],[.54,1],[.90,0],[1,0]]);ready(.66,.03+.05*push,35,-4);
  // Hands at the belt like a spear guard, the haft running forward-down to the blade in the soil.
  const hf=mix([.05,-.50,1],[.05,-.30,1],push),ha=mix([.10,-.90,.55],[.10,-.80,.75],push);
  const g=h.aimFk('R',[0,-.87,.5],mix([0,-.71,.71],[0,-.5,.87],push),mix([.1,-.9,.6],[.1,-.8,.75],push),{diag:SPEAR_DIAG});
  const ax=g.axis.clone().normalize();h.arm('L',g.grip.clone().addScaledVector(ax,.22),ax,at('L',[.08,-.26,.08]),{diag:SPEAR_DIAG,elbowSearch:.12});
 },{...weapon('Wrist.R',SPEAR_DIAG,{offhand:.22}),events:[{time:1.2,event:'pull-soil'}]}],
 ['Mine',48,true,(t,u)=>{
  let lift=curve(u,[[0,0],[.34,1],[.45,1],[.64,0],[.81,0],[1,0]]);ready(.73+.08*lift,.04,26-22*lift,-9+16*lift);h.legs([.19,.02275,.08],[-.19,.02275,-.14]);
  const g=h.aimFk('R',mix([0,-.71,.71],[-.75,-.5,.43],lift),mix([0,-.71,.71],[.22,.97,-.13],lift),mix([0,-.2,1],[-.1,.6,-1],lift),{diag:TOOL_DIAG});
  const ax=g.axis.clone().normalize();h.arm('L',g.grip.clone().addScaledVector(ax,-.17),ax,at('L',mix([.05,-.28,.12],[.28,.0,.18],lift)),{diag:TOOL_DIAG,elbowSearch:.12});
 },{...weapon('Wrist.R',TOOL_DIAG,{offhand:-.17}),events:[{time:1.0333333333,event:'pick-contact'}]}],
 ['Carry',42,true,(t,u)=>{
  walk(u,true);r.turn('Torso',[0,0,1],-7);h.hand('R',[-.30,1.52,.22],null,null,.35);h.hand('L',[.22,1.02,.06+.08*Math.sin(TAU*u)],null,[0,-1,0],.7);
 },{equipment:'sack on right shoulder'}]
 ];
}
