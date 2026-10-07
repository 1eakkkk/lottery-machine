import RAPIER from '@dimforge/rapier3d-compat';
import { GAMES } from './games';
import { airVelocity,venusAirVelocity } from './airflow';
import { VenusWheel } from './venus-wheel';
export const MODEL_VERSION = 'ssq-mechanical-v2';
export const DT = 1 / 120, BALL_RADIUS = 0.082, CHAMBER_RADIUS = 1.08, CENTER_Y = 2.7, FLOOR_Y = 1.94;
export const PORT_Z = 0.48, PORT_RADIUS = 0.158, ROTOR_Y = 2.08, ROTOR_X = 0.30, ROTOR_Z = 0.24, ANGULAR_SPEED = 8.0;
export const TUBE_RADIUS=.106;
// A narrow, inclined receiving lane: balls roll from the outlet toward the end stop.
export const TRAY = { centerX: -.5, halfLength: .9, halfWidth: .095, y: .63, slope: .10, wallY: .83, wallHalfHeight: .175 };
export type Phase = 'ready' | 'loading' | 'mixing' | 'red' | 'blue' | 'third' | 'complete' | 'failed';
export type DrawEvent = { color: 'red' | 'blue'; number: number; tick: number; zone?: number; special?: boolean };
export type Snapshot = { tick: number; phase: Phase; gate: boolean[]; outlet: boolean[]; balls: number[]; events: DrawEvent[]; seed: number; error?: string; rotorRotations?: number[][]; activeZone?: number; wheelAngles?:number[];wheelLoads?:number[][] };
export function randomGenerator(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function dltLoadingPosition(slot:number,count:number) {
  const columns=count===35?7:4, column=slot%columns, layer=Math.floor(slot/columns),angle=column*Math.PI*2/columns+(count===12?Math.PI/4:0);
  return {x:.60*Math.cos(angle),y:3.58+layer*.19,z:.60*Math.sin(angle)};
}
export const DLT_PORT_Y=3.45;
export const DLT_TRAY={...TRAY,centerX:-.35,halfLength:1.1,y:.50,wallY:.69,wallHalfHeight:.18};
// The rotating wheel delivers into this fixed lower right-hand bend.
// Dimensions are model parameters, not manufacturer measurements.
export const DLT_CHUTE=[[0,1.48],[0,1.30],[.07,1.20],[.25,1.15],[.43,1.10],[.55,1.03],[.58,.98]] as const;
export function dltChuteGeometry() {
  const points:number[][]=[],vertices:number[]=[],indices:number[]=[],slices=32;
  for(let segment=0;segment<DLT_CHUTE.length-1;segment++)for(let step=0;step<12;step++) {
    const t=step/12,p0=DLT_CHUTE[Math.max(0,segment-1)],p1=DLT_CHUTE[segment],p2=DLT_CHUTE[segment+1],p3=DLT_CHUTE[Math.min(DLT_CHUTE.length-1,segment+2)];
    points.push([0,1].map(k=>.5*(2*p1[k]+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t)));
  }
  points.push([...DLT_CHUTE.at(-1)!]);
  points.forEach(([x,y],i)=> {
    const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)],dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy);
    const radius=i<24?.19-(.19-.125)*Math.max(0,(i-12)/12):.125;
    for(let j=0;j<=slices;j++) {const a=j/slices*Math.PI*2;vertices.push(x-dy/length*radius*Math.cos(a),y+dx/length*radius*Math.cos(a),radius*Math.sin(a));}
  });
  for(let i=0;i<points.length-1;i++)for(let j=0;j<slices;j++){const a=i*(slices+1)+j,b=a+slices+1;indices.push(a,b,a+1,a+1,b,b+1);}
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
export function blowerGain(seconds:number,venus=false) {
  // Timing approximated from video; these are not measured blower settings.
  const ramp=Math.max(0,Math.min(1,seconds/(venus?10:1.2)));
  return ramp*ramp*(3-2*ramp);
}
function shellGeometry(venus=false,loadingCap=false) {
  const vertices: number[] = [], indices: number[] = [], rows = 16, slices = 48;
  const bottomAngle = loadingCap?.78:Math.acos((FLOOR_Y - CENTER_Y) / CHAMBER_RADIUS);
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= slices; col++) {
    const topAngle=loadingCap?.20:venus?.78:0;
    const a = topAngle+row / rows * (bottomAngle-topAngle), b = col / slices * Math.PI * 2;
    vertices.push(CHAMBER_RADIUS * Math.sin(a) * Math.cos(b), CENTER_Y + CHAMBER_RADIUS * Math.cos(a), CHAMBER_RADIUS * Math.sin(a) * Math.sin(b));
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < slices; col++) {
    const a = row * (slices + 1) + col, b = a + slices + 1; indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
export function floorGeometry(venus=false) {
  const portZ=venus?0:PORT_Z;
  const vertices:number[]=[],indices:number[]=[],slices=32,rings=4;
  for(let ring=0;ring<=rings;ring++)for(let i=0;i<=slices;i++){
    const a=i/slices*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);
    let lo=PORT_RADIUS,hi=2;
    for(let j=0;j<28;j++){const r=(lo+hi)/2,x=r*ca,z=portZ+r*sa,y=FLOOR_Y+.38*(r*r-PORT_RADIUS**2)-CENTER_Y;if(x*x+z*z+y*y<CHAMBER_RADIUS**2)lo=r;else hi=r;}
    const outer=hi+.025,r=PORT_RADIUS+(outer-PORT_RADIUS)*ring/rings;
    vertices.push(r*ca,FLOOR_Y+.38*(r*r-PORT_RADIUS**2),portZ+r*sa);
  }
  for(let ring=0;ring<rings;ring++)for(let i=0;i<slices;i++){
    const a=ring*(slices+1)+i,b=a+slices+1;indices.push(a,a+1,b,a+1,b+1,b);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
export function tubeGeometry(){
  const vertices:number[]=[],indices:number[]=[],slices=32,rings=[[FLOOR_Y,PORT_RADIUS],[FLOOR_Y-.13,TUBE_RADIUS],[1.02,TUBE_RADIUS]];
  for(const [y,r]of rings)for(let i=0;i<=slices;i++){const a=i/slices*Math.PI*2;vertices.push(r*Math.cos(a),y,PORT_Z+r*Math.sin(a));}
  for(let j=0;j<2;j++)for(let i=0;i<slices;i++){const a=j*(slices+1)+i,b=a+slices+1;indices.push(a,b,a+1,a+1,b,b+1);}
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
type Ball = { body: RAPIER.RigidBody; number: number; selected: boolean };
export class Chamber {
  balls: Ball[] = []; rotors: RAPIER.RigidBody[] = []; gate: RAPIER.Collider; outletGate:RAPIER.Collider;
  open = false; nextOpen = 0; events: DrawEvent[] = [];
  lockTick=-1;outletOpen=false;
  lastAngle = 0;
  private loadingCap?:RAPIER.Collider;
  wheel?:VenusWheel;
  get portZ(){return this.venus?0:PORT_Z;}
  constructor(public world: RAPIER.World, public color: 'red' | 'blue', public offset: number, count: number, rng: () => number, public airflow=false, public tray=TRAY, public motorSpeed=ANGULAR_SPEED,public venus=false) {
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(offset, 0, 0)), shell = shellGeometry(venus);
    world.createCollider(RAPIER.ColliderDesc.trimesh(shell.vertices, shell.indices).setFriction(0.2).setRestitution(0.48), fixed);
    if(venus) { const cap=shellGeometry(false,true);this.loadingCap=world.createCollider(RAPIER.ColliderDesc.trimesh(cap.vertices,cap.indices).setCollisionGroups(0x00040001).setFriction(.2).setRestitution(.48),fixed);this.loadingCap.setEnabled(false); }
    // A tiled floor with an actual opening. No invisible attraction or chosen ball.
    const floor = floorGeometry(venus);
    // Solid triangular prisms prevent a driven ball from crossing a zero-thickness floor.
    for(let i=0;i<floor.indices.length;i+=3){
      const points:number[]=[];
      for(let j=0;j<3;j++){const k=floor.indices[i+j]*3;points.push(floor.vertices[k],floor.vertices[k+1],floor.vertices[k+2]);}
      for(let j=0;j<3;j++){const k=floor.indices[i+j]*3;points.push(floor.vertices[k],floor.vertices[k+1]-(venus?.08:.25),floor.vertices[k+2]);}
      const prism=RAPIER.ColliderDesc.convexHull(new Float32Array(points));
      if(prism)world.createCollider(prism.setFriction(.08).setRestitution(.4),fixed);
    }
    if(venus) {
      world.createCollider(RAPIER.ColliderDesc.cylinder(.025,PORT_RADIUS+.02).setTranslation(0,FLOOR_Y-.025,0),fixed);
      this.wheel=new VenusWheel(world,fixed,offset,color,count===35?5:2);
      this.gate=this.wheel.gate;this.outletGate=this.wheel.pockets[0].floor;
      this.events=this.wheel.events;
      const vertices:number[]=[],indices:number[]=[],rings=[[3.45,.20],[3.70,.112],[3.86,.112]],slices=32;
      for(const [y,r]of rings)for(let i=0;i<=slices;i++){const a=i/slices*Math.PI*2;vertices.push(r*Math.cos(a),y,r*Math.sin(a));}
      for(let j=0;j<2;j++)for(let i=0;i<slices;i++){const a=j*(slices+1)+i,b=a+slices+1;indices.push(a,b,a+1,a+1,b,b+1);}
      world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)).setCollisionGroups(0x00100001).setFriction(.01).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),fixed);
      const chute=dltChuteGeometry();world.createCollider(RAPIER.ColliderDesc.trimesh(chute.vertices,chute.indices).setFriction(.03).setRestitution(0),fixed);
    } else {
      this.gate=world.createCollider(RAPIER.ColliderDesc.cylinder(.018,PORT_RADIUS+.02).setTranslation(0,FLOOR_Y-.03,this.portZ),fixed);
      this.outletGate=world.createCollider(RAPIER.ColliderDesc.cylinder(.018,PORT_RADIUS+.02).setTranslation(0,FLOOR_Y-.26,this.portZ),fixed);
      const tube=tubeGeometry();world.createCollider(RAPIER.ColliderDesc.trimesh(tube.vertices,tube.indices).setFriction(.1),fixed);
    }
    for (const side of [-1, 1]) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(tray.halfLength+.025, tray.wallHalfHeight, .025).setTranslation(tray.centerX, tray.wallY, this.portZ + side * (tray.halfWidth+.025)).setRestitution(0), fixed);
      world.createCollider(RAPIER.ColliderDesc.cuboid(.025, tray.wallHalfHeight, tray.halfWidth).setTranslation(tray.centerX+side*(tray.halfLength+.025), tray.wallY, this.portZ).setRestitution(0), fixed);
    }
    world.createCollider(RAPIER.ColliderDesc.cuboid(tray.halfLength, .025, tray.halfWidth).setTranslation(tray.centerX, tray.y, this.portZ).setRotation({x:0,y:0,z:Math.sin(tray.slope/2),w:Math.cos(tray.slope/2)}).setFriction(.18).setRestitution(0), fixed);
    if(tray.halfLength>2||venus) {
      // A low transparent cover keeps a dense receiving lane one ball high.
      // The uncovered inlet remains clear for balls falling from the tube.
      const left=tray.centerX-tray.halfLength,right=-.35,x=(left+right)/2;
      world.createCollider(RAPIER.ColliderDesc.cuboid((right-left)/2,.015,tray.halfWidth)
        .setTranslation(x,tray.y+(x-tray.centerX)*Math.tan(tray.slope)+.22,this.portZ)
        .setRotation({x:0,y:0,z:Math.sin(tray.slope/2),w:Math.cos(tray.slope/2)}).setRestitution(0),fixed);
    }
    // Counter-rotating paddle assemblies: momentum is imparted by contacts.
    for (const side of airflow?[]:[-1, 1]) {
      const rotor = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(offset + side * ROTOR_X, ROTOR_Y, ROTOR_Z));
      for (let blade = 0; blade < 6; blade++) {
        const a = blade * Math.PI / 3;
        const s=Math.sin(a/2),c=Math.cos(a/2),sp=Math.sin(.3),cp=Math.cos(.3);
        world.createCollider(RAPIER.ColliderDesc.cuboid(0.235, 0.035, 0.07).setTranslation(0.235 * Math.cos(a), 0, -0.235 * Math.sin(a))
          .setRotation({ x: c*sp, y: s*cp, z: -s*sp, w: c*cp }).setFriction(0.65).setRestitution(0.62), rotor);
      }
      this.rotors.push(rotor);
    }
    const slots=Array.from({length:count},(_,i)=>i);
    for(let i=count-1;i>0;i--){const j=Math.floor(rng()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(slots[i] / 12), cell = slots[i] % 12, x = (cell % 4 - 1.5) * 0.22 + (rng() - 0.5) * 0.02, z = (Math.floor(cell / 4) - 1) * 0.22 + (rng() - 0.5) * 0.02;
      const loading=venus?dltLoadingPosition(slots[i],count):{x,y:2.63+layer*.2,z};
      const body = world.createRigidBody((venus?RAPIER.RigidBodyDesc.kinematicPositionBased():RAPIER.RigidBodyDesc.dynamic()).setTranslation(offset + loading.x, loading.y, loading.z).setCcdEnabled(true).setLinearDamping(0.12).setAngularDamping(0.15).setCanSleep(false));
      const ballCollider=RAPIER.ColliderDesc.ball(BALL_RADIUS).setMass(airflow?.005:.025).setFriction(venus?.05:airflow?.14:.24).setRestitution(airflow?.62:.66);
      if(venus)ballCollider.setCollisionGroups(0x0001ffff);
      world.createCollider(ballCollider,body);
      this.balls.push({ body, number: i + 1, selected: false });
    }
  }
  releaseLoadingBalls() {
    if(this.venus)for(const ball of this.balls)ball.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);
  }
  setGate(open:boolean){
    if(this.wheel){this.wheel.request(open);this.open=this.wheel.accepting;return;}
    this.open=open;this.gate.setEnabled(!open);
  }
  advanceLock(tick:number){
    if(this.wheel){this.wheel.step(tick);this.open=this.wheel.accepting;return;}
    if(this.lockTick>=0&&tick>=this.lockTick+12){this.outletOpen=true;this.outletGate.setEnabled(false);}
  }
  private blowerStart: number | undefined;
  drive(tick: number, moving: boolean, phase: number) {
    if(this.airflow) {
      if (!moving) this.blowerStart = undefined;
      else this.blowerStart ??= tick;
      if(this.loadingCap&&moving&&tick-this.blowerStart!>=180)this.loadingCap.setEnabled(true);
      const gain = moving?blowerGain((tick-this.blowerStart!)*DT,this.venus):0;
      for(const ball of this.balls) {
        const body=ball.body;body.resetForces(true);
        if(!moving||ball.selected) continue;
        const p=body.translation();
        if(this.wheel?.pending===ball&&p.y>3.90)continue;

        // Once a ball is in the isolated outlet it falls under gravity, without jet force.
        if(p.y<FLOOR_Y) continue;
        const wind=(this.venus?venusAirVelocity:airVelocity)(p.x-this.offset,p.y-CENTER_Y,p.z,tick*DT,phase),v=body.linvel();
        const dx=wind.x*gain-v.x,dy=wind.y*gain-v.y,dz=wind.z*gain-v.z;
        const drag=.5*1.225*.47*Math.PI*BALL_RADIUS**2*Math.hypot(dx,dy,dz);
        body.addForce({x:drag*dx,y:drag*dy,z:drag*dz},true);
      }
      return;
    }
    if(moving)this.lastAngle=tick*DT*this.motorSpeed+phase;
    this.rotors.forEach((rotor, i) => {
      const a = (i === 0 ? 1 : -1) * this.lastAngle;
      const tilt = 0, st=Math.sin(tilt/2), ct=Math.cos(tilt/2), sa=Math.sin(a/2), ca=Math.cos(a/2);
      rotor.setNextKinematicRotation({x:-st*sa,y:ct*sa,z:st*ca,w:ct*ca});
    });
  }
  readCrossings(tick: number) {
    if(this.wheel){this.wheel.capture(tick,this.balls);this.open=this.wheel.accepting;return;}
    for (const ball of this.balls) {
      const p = ball.body.translation();
      const inTube=this.venus?Math.hypot(p.x-this.offset,p.z)<TUBE_RADIUS-BALL_RADIUS+.006:Math.abs(p.x-this.offset)<PORT_RADIUS&&Math.abs(p.z-this.portZ)<PORT_RADIUS;
      if(this.open&&!ball.selected&&inTube&&p.y<(this.venus?DLT_PORT_Y:FLOOR_Y)-.14){this.setGate(false);this.lockTick=tick;}
      if (!ball.selected && p.y < (this.venus?DLT_PORT_Y:FLOOR_Y) - .42 && inTube) {
        ball.selected = true; this.events.push({ color: this.color, number: ball.number, tick }); this.setGate(false); this.nextOpen = tick + 240;this.lockTick=-1;this.outletOpen=false;this.outletGate.setEnabled(true);
      }
    }
  }
}
export class DrawSimulation {
  world: RAPIER.World; chambers: [Chamber, Chamber]; tick = 0; phase: Phase = 'ready'; started = false; blueStart = 0; error?: string; seedPhase: number;
  constructor(public seed: number, public game:'ssq'|'dlt'='ssq') {
    const rng = randomGenerator(seed); this.seedPhase = rng() * 6;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); this.world.timestep = DT; this.world.numSolverIterations = 8;
    const config=GAMES[game];
    this.chambers = [new Chamber(this.world, 'red', -1.45, config.counts[0], rng,config.mixing==='airflow',game==='dlt'?DLT_TRAY:TRAY,ANGULAR_SPEED,game==='dlt'), new Chamber(this.world, 'blue', 1.45, config.counts[1], rng,config.mixing==='airflow',game==='dlt'?DLT_TRAY:TRAY,ANGULAR_SPEED,game==='dlt')];
  }
  start() { this.started = true; this.phase = 'loading'; }
  step() {
    if (!this.started || this.phase === 'complete' || this.phase === 'failed') return;
    this.tick++; const [red, blue] = this.chambers;
    const [redTarget,blueTarget]=GAMES[this.game].draws;
    if (this.tick === 240) { this.phase = 'mixing';red.releaseLoadingBalls(); }
    if (this.blueStart&&this.tick===this.blueStart){blue.releaseLoadingBalls();if(this.game==='dlt')this.phase='blue';}
    if (this.tick === (this.game==='dlt'?240+14*120:960)) { this.phase = 'red'; red.nextOpen = this.tick; }
    const redMoving = this.tick >= 240 && red.events.length < redTarget, blueMoving = this.blueStart > 0 && this.tick >= this.blueStart && (this.game==='ssq'||blue.events.length<blueTarget);
    red.drive(this.tick, redMoving, this.seedPhase); blue.drive(blueMoving ? this.tick - this.blueStart : 0, blueMoving, this.seedPhase + 1);
    if (this.phase === 'red' && red.events.length < redTarget && this.tick >= red.nextOpen&&red.lockTick<0) red.setGate(true);
    if (this.phase === 'blue' && blue.events.length < blueTarget && this.tick >= blue.nextOpen&&blue.lockTick<0) blue.setGate(true);
    red.advanceLock(this.tick);blue.advanceLock(this.tick);
    this.world.step(); red.readCrossings(this.tick); blue.readCrossings(this.tick);
    if (red.events.length === redTarget && !this.blueStart && (this.game!=='dlt'||red.wheel!.drained&&this.landed(red))) { this.blueStart = this.tick + (this.game==='dlt'?60:180); blue.nextOpen = this.blueStart + (this.game==='dlt'?14*120:720); if(this.game==='ssq')this.phase = 'blue'; }
    if (red.events.length > redTarget || blue.events.length > blueTarget) this.fail('出球机构出现连续出球，本场无效，请重新开始。');
    const delivered=this.game!=='dlt'||this.chambers.every(c=>c.wheel!.drained&&this.landed(c));
    if (blue.events.length === blueTarget && this.tick >= blue.events[blueTarget-1].tick + (this.game==='dlt'?60:180)&&delivered) this.phase = 'complete';
    if (this.tick > 120 * 180) this.fail('出球等待超时，本场未完成，请重新开始。');
    for (const chamber of this.chambers) for (const ball of chamber.balls) {
      const p = ball.body.translation();
      if(this.game==='dlt'&&ball.selected&&(p.y<.2||Math.abs(p.x-chamber.offset)>1.7||Math.abs(p.z)>.4))this.fail('号码球离开导球通道，本场无效。');
      if (!Number.isFinite(p.y) || (!ball.selected && (p.y < 1.5 || p.y > (this.game==='dlt'&&(chamber===red?this.tick<420:!this.blueStart||this.tick<this.blueStart+180)?4.7:this.game==='dlt'?4.22:4) || Math.abs(p.x - chamber.offset) > 1.3 || Math.abs(p.z) > 1.3))) this.fail('检测到球体离开有效机器边界，本场无效。');
    }
  }
  private landed(c:Chamber){return c.balls.filter(b=>b.selected).every(b=>{
    const p=b.body.translation(),v=b.body.linvel(),rest=c.tray.y+(p.x-c.offset-c.tray.centerX)*Math.tan(c.tray.slope)+(.025+BALL_RADIUS)/Math.cos(c.tray.slope);
    return Math.abs(p.y-rest)<.018&&Math.hypot(v.x,v.y,v.z)<.15;
  });}
  fail(message: string) { this.phase = 'failed'; this.error = message; this.chambers.forEach(c => c.setGate(false)); }
  snapshot(): Snapshot {
    const balls: number[] = [];
    for (const chamber of this.chambers) for (const ball of chamber.balls) { const p = ball.body.translation(), q = ball.body.rotation(); balls.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w, ball.selected ? 1 : 0); }
    return { tick: this.tick, phase: this.phase, balls, gate: this.chambers.map(c => c.open) as [boolean, boolean],outlet:this.chambers.map(c=>c.outletOpen) as [boolean,boolean], events: this.chambers.flatMap(c => c.events), seed: this.seed, error: this.error,...(this.game==='dlt'?{wheelAngles:this.chambers.map(c=>c.wheel!.angle),wheelLoads:this.chambers.map(c=>c.wheel!.pockets.map(p=>p.ball?.number??0))}:{}) };
  }
  free() { this.world.free(); }
}
export async function initializePhysics() { await RAPIER.init(); }
