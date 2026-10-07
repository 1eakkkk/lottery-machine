import RAPIER from '@dimforge/rapier3d-compat';
import { GAMES } from './games';
import { airVelocity } from './airflow';
export const MODEL_VERSION = 'ssq-mechanical-v2';
export const DT = 1 / 120, BALL_RADIUS = 0.082, CHAMBER_RADIUS = 1.08, CENTER_Y = 2.7, FLOOR_Y = 1.94;
export const PORT_Z = 0.48, PORT_RADIUS = 0.158, ROTOR_Y = 2.08, ROTOR_X = 0.30, ROTOR_Z = 0.24, ANGULAR_SPEED = 8.0;
export const TUBE_RADIUS=.106;
// A narrow, inclined receiving lane: balls roll from the outlet toward the end stop.
export const TRAY = { centerX: -.5, halfLength: .9, halfWidth: .095, y: .63, slope: .10, wallY: .83, wallHalfHeight: .175 };
export type Phase = 'ready' | 'loading' | 'mixing' | 'red' | 'blue' | 'third' | 'complete' | 'failed';
export type DrawEvent = { color: 'red' | 'blue'; number: number; tick: number; zone?: number; special?: boolean };
export type Snapshot = { tick: number; phase: Phase; gate: boolean[]; outlet: boolean[]; balls: number[]; events: DrawEvent[]; seed: number; error?: string; rotorRotations?: number[][]; activeZone?: number };
export function randomGenerator(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shellGeometry() {
  const vertices: number[] = [], indices: number[] = [], rows = 16, slices = 48;
  const bottomAngle = Math.acos((FLOOR_Y - CENTER_Y) / CHAMBER_RADIUS);
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= slices; col++) {
    const a = row / rows * bottomAngle, b = col / slices * Math.PI * 2;
    vertices.push(CHAMBER_RADIUS * Math.sin(a) * Math.cos(b), CENTER_Y + CHAMBER_RADIUS * Math.cos(a), CHAMBER_RADIUS * Math.sin(a) * Math.sin(b));
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < slices; col++) {
    const a = row * (slices + 1) + col, b = a + slices + 1; indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
export function floorGeometry() {
  const vertices:number[]=[],indices:number[]=[],slices=32,rings=4;
  for(let ring=0;ring<=rings;ring++)for(let i=0;i<=slices;i++){
    const a=i/slices*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);
    let lo=PORT_RADIUS,hi=2;
    for(let j=0;j<28;j++){const r=(lo+hi)/2,x=r*ca,z=PORT_Z+r*sa,y=FLOOR_Y+.38*(r*r-PORT_RADIUS**2)-CENTER_Y;if(x*x+z*z+y*y<CHAMBER_RADIUS**2)lo=r;else hi=r;}
    const outer=hi+.025,r=PORT_RADIUS+(outer-PORT_RADIUS)*ring/rings;
    vertices.push(r*ca,FLOOR_Y+.38*(r*r-PORT_RADIUS**2),PORT_Z+r*sa);
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
  constructor(public world: RAPIER.World, public color: 'red' | 'blue', public offset: number, count: number, rng: () => number, public airflow=false, public tray=TRAY, public motorSpeed=ANGULAR_SPEED) {
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(offset, 0, 0)), shell = shellGeometry();
    world.createCollider(RAPIER.ColliderDesc.trimesh(shell.vertices, shell.indices).setFriction(0.2).setRestitution(0.48), fixed);
    // A tiled floor with an actual opening. No invisible attraction or chosen ball.
    const floor = floorGeometry();
    // Solid triangular prisms prevent a driven ball from crossing a zero-thickness floor.
    for(let i=0;i<floor.indices.length;i+=3){
      const points:number[]=[];
      for(let j=0;j<3;j++){const k=floor.indices[i+j]*3;points.push(floor.vertices[k],floor.vertices[k+1],floor.vertices[k+2]);}
      for(let j=0;j<3;j++){const k=floor.indices[i+j]*3;points.push(floor.vertices[k],floor.vertices[k+1]-.25,floor.vertices[k+2]);}
      const prism=RAPIER.ColliderDesc.convexHull(new Float32Array(points));
      if(prism)world.createCollider(prism.setFriction(.08).setRestitution(.4),fixed);
    }
    this.gate = world.createCollider(RAPIER.ColliderDesc.cylinder(0.018, PORT_RADIUS + 0.02).setTranslation(0, FLOOR_Y - 0.03, PORT_Z), fixed);
    this.outletGate=world.createCollider(RAPIER.ColliderDesc.cylinder(.018,PORT_RADIUS+.02).setTranslation(0,FLOOR_Y-.26,PORT_Z),fixed);
    const tube=tubeGeometry();world.createCollider(RAPIER.ColliderDesc.trimesh(tube.vertices,tube.indices).setFriction(.1),fixed);
    for (const side of [-1, 1]) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(tray.halfLength+.025, tray.wallHalfHeight, .025).setTranslation(tray.centerX, tray.wallY, PORT_Z + side * (tray.halfWidth+.025)).setRestitution(0), fixed);
      world.createCollider(RAPIER.ColliderDesc.cuboid(.025, tray.wallHalfHeight, tray.halfWidth).setTranslation(tray.centerX+side*(tray.halfLength+.025), tray.wallY, PORT_Z).setRestitution(0), fixed);
    }
    world.createCollider(RAPIER.ColliderDesc.cuboid(tray.halfLength, .025, tray.halfWidth).setTranslation(tray.centerX, tray.y, PORT_Z).setRotation({x:0,y:0,z:Math.sin(tray.slope/2),w:Math.cos(tray.slope/2)}).setFriction(.18).setRestitution(0), fixed);
    if(tray.halfLength>2) {
      // A low transparent cover keeps a dense receiving lane one ball high.
      // The uncovered inlet remains clear for balls falling from the tube.
      const left=tray.centerX-tray.halfLength,right=-.35,x=(left+right)/2;
      world.createCollider(RAPIER.ColliderDesc.cuboid((right-left)/2,.015,tray.halfWidth)
        .setTranslation(x,tray.y+(x-tray.centerX)*Math.tan(tray.slope)+.22,PORT_Z)
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
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(offset + x, 2.63 + layer * 0.2, z).setCcdEnabled(true).setLinearDamping(0.12).setAngularDamping(0.15).setCanSleep(false));
      world.createCollider(RAPIER.ColliderDesc.ball(BALL_RADIUS).setMass(airflow?.005:.025).setFriction(airflow?.14:.24).setRestitution(airflow?.62:.66), body);
      this.balls.push({ body, number: i + 1, selected: false });
    }
  }
  setGate(open: boolean) { this.open = open; this.gate.setEnabled(!open); }
  advanceLock(tick:number){if(this.lockTick>=0&&tick>=this.lockTick+12){this.outletOpen=true;this.outletGate.setEnabled(false);}}
  private blowerStart: number | undefined;
  drive(tick: number, moving: boolean, phase: number) {
    if(this.airflow) {
      if (!moving) this.blowerStart = undefined;
      else this.blowerStart ??= tick;
      const ramp = moving ? Math.min(1,Math.max(0,(tick-this.blowerStart!)*DT/1.2)) : 0;
      const gain = ramp*ramp*(3-2*ramp);
      for(const ball of this.balls) {
        const body=ball.body;body.resetForces(true);
        if(!moving||ball.selected) continue;
        const p=body.translation();
        // Once a ball is in the isolated outlet it falls under gravity, without jet force.
        if(p.y<FLOOR_Y) continue;
        const wind=airVelocity(p.x-this.offset,p.y-CENTER_Y,p.z,tick*DT,phase),v=body.linvel();
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
    for (const ball of this.balls) {
      const p = ball.body.translation();
      const inTube=Math.abs(p.x-this.offset)<PORT_RADIUS&&Math.abs(p.z-PORT_Z)<PORT_RADIUS;
      if(this.open&&!ball.selected&&inTube&&p.y<FLOOR_Y-.14){this.setGate(false);this.lockTick=tick;}
      if (!ball.selected && p.y < FLOOR_Y - 0.42 && inTube) {
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
    this.chambers = [new Chamber(this.world, 'red', -1.45, config.counts[0], rng,config.mixing==='airflow'), new Chamber(this.world, 'blue', 1.45, config.counts[1], rng,config.mixing==='airflow')];
  }
  start() { this.started = true; this.phase = 'loading'; }
  step() {
    if (!this.started || this.phase === 'complete' || this.phase === 'failed') return;
    this.tick++; const [red, blue] = this.chambers;
    const [redTarget,blueTarget]=GAMES[this.game].draws;
    if (this.tick === 240) this.phase = 'mixing';
    if (this.tick === 960) { this.phase = 'red'; red.nextOpen = this.tick; }
    const redMoving = this.tick >= 240 && red.events.length < redTarget, blueMoving = this.blueStart > 0 && this.tick >= this.blueStart && (this.game==='ssq'||blue.events.length<blueTarget);
    red.drive(this.tick, redMoving, this.seedPhase); blue.drive(blueMoving ? this.tick - this.blueStart : 0, blueMoving, this.seedPhase + 1);
    if (this.phase === 'red' && red.events.length < redTarget && this.tick >= red.nextOpen&&red.lockTick<0) red.setGate(true);
    if (this.phase === 'blue' && blue.events.length < blueTarget && this.tick >= blue.nextOpen&&blue.lockTick<0) blue.setGate(true);
    red.advanceLock(this.tick);blue.advanceLock(this.tick);
    this.world.step(); red.readCrossings(this.tick); blue.readCrossings(this.tick);
    if (red.events.length === redTarget && !this.blueStart) { this.blueStart = this.tick + 180; blue.nextOpen = this.blueStart + 720; this.phase = 'blue'; }
    if (red.events.length > redTarget || blue.events.length > blueTarget) this.fail('出球机构出现连续出球，本场无效，请重新开始。');
    if (blue.events.length === blueTarget && this.tick >= blue.events[blueTarget-1].tick + 180) this.phase = 'complete';
    if (this.tick > 120 * 180) this.fail('出球等待超时，本场未完成，请重新开始。');
    for (const chamber of this.chambers) for (const ball of chamber.balls) {
      const p = ball.body.translation();
      if (!Number.isFinite(p.y) || (!ball.selected && (p.y < 1.5 || p.y > 4 || Math.abs(p.x - chamber.offset) > 1.3 || Math.abs(p.z) > 1.3))) this.fail('检测到球体离开有效机器边界，本场无效。');
    }
  }
  fail(message: string) { this.phase = 'failed'; this.error = message; this.chambers.forEach(c => c.setGate(false)); }
  snapshot(): Snapshot {
    const balls: number[] = [];
    for (const chamber of this.chambers) for (const ball of chamber.balls) { const p = ball.body.translation(), q = ball.body.rotation(); balls.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w, ball.selected ? 1 : 0); }
    return { tick: this.tick, phase: this.phase, balls, gate: this.chambers.map(c => c.open) as [boolean, boolean],outlet:this.chambers.map(c=>c.outletOpen) as [boolean,boolean], events: this.chambers.flatMap(c => c.events), seed: this.seed, error: this.error };
  }
  free() { this.world.free(); }
}
export async function initializePhysics() { await RAPIER.init(); }
