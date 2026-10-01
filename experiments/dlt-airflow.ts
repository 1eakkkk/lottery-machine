import RAPIER from '@dimforge/rapier3d-compat';
import { DT, randomGenerator } from '../src/physics';

export const DLT_RULES = { front: { count: 35, draw: 5 }, rear: { count: 12, draw: 2 } } as const;
export const DLT_PROTOTYPE_VERSION = 'dlt-airflow-mixing-prototype-v0';
// Normalized development dimensions, not measured Venus machine specifications.
const RADIUS = 1, BALL_RADIUS = .075, BALL_MASS = .005;

function chamberShell() {
  const vertices: number[] = [], indices: number[] = [], rows = 24, slices = 48;
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= slices; col++) {
    const theta = row / rows * Math.PI, phi = col / slices * Math.PI * 2;
    vertices.push(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < slices; col++) {
    const a = row * (slices + 1) + col, b = a + slices + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/** Spatial air velocity shared by all balls: upward jet, return flow and turbulence.
 * This is an empirical field, not a Navier–Stokes fluid solver or calibrated device.
 * Identity/number is deliberately absent from its input.
 */
export function airVelocity(position: RAPIER.Vector, seconds: number, phase: number): RAPIER.Vector {
  const { x, y, z } = position, radial = x * x + z * z;
  const jet = Math.exp(-radial / .24);
  const circulation = 3.5 * (y + .2), swirl = 3.8;
  return {
    x: circulation * x - swirl * z + .9 * Math.sin(z * 7 + seconds * 3.7 + phase),
    y: 8.5 * jet - 2 + .8 * Math.sin(x * 6 - z * 5 + seconds * 4.1 + phase),
    z: circulation * z + swirl * x + .9 * Math.sin(x * 8 - seconds * 3.3 + phase),
  };
}

export class AirflowMixingPrototype {
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  balls: { number: number; body: RAPIER.RigidBody }[] = [];
  tick = 0;
  private phase: number;
  constructor(public seed: number, public zone: 'front' | 'rear') {
    this.world.timestep = DT;
    const shell = chamberShell(), fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(shell.vertices, shell.indices).setFriction(.12).setRestitution(.58), fixed);
    const rng = randomGenerator(seed), count = DLT_RULES[zone].count;
    this.phase = rng() * Math.PI * 2;
    const identities = Array.from({ length: count }, (_, i) => i + 1);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)); [identities[i], identities[j]] = [identities[j], identities[i]];
    }
    for (let i = 0; i < count; i++) {
      const x = (i % 6 - 2.5) * .18, z = (Math.floor(i / 6) - 2.5) * .18;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, -.4 + rng() * .015, z).setCcdEnabled(true).setAngularDamping(.06));
      this.world.createCollider(RAPIER.ColliderDesc.ball(BALL_RADIUS).setMass(BALL_MASS).setFriction(.14).setRestitution(.62), body);
      body.setAngvel({ x: rng() * 4 - 2, y: rng() * 4 - 2, z: rng() * 4 - 2 }, true);
      this.balls.push({ number: identities[i], body });
    }
  }
  step() {
    const seconds = this.tick * DT, dragCoefficient = .5 * 1.225 * .47 * Math.PI * BALL_RADIUS ** 2;
    for (const { body } of this.balls) {
      const air = airVelocity(body.translation(), seconds, this.phase), velocity = body.linvel();
      const dx = air.x - velocity.x, dy = air.y - velocity.y, dz = air.z - velocity.z;
      const drag = dragCoefficient * Math.hypot(dx, dy, dz);
      body.resetForces(true);
      body.addForce({ x: drag * dx, y: drag * dy, z: drag * dz }, true);
    }
    this.world.step(); this.tick++;
    for (const { body } of this.balls) {
      const p = body.translation();
      if (![p.x, p.y, p.z].every(Number.isFinite) || Math.hypot(p.x, p.y, p.z) > RADIUS + .02) throw new Error('Airflow prototype boundary failure');
    }
  }
  snapshot() {
    return { seed: this.seed, zone: this.zone, tick: this.tick, balls: this.balls.map(({ number, body }) => ({ number, position: body.translation(), rotation: body.rotation() })) };
  }
  free() { this.world.free(); }
}
