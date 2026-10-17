import * as THREE from 'three';
import type { HeadTracker } from './head';
import type { Input } from './input';
import type { World } from './physics';
import type { Settings } from './settings';
import type { View } from './view';

const RADIUS = 0.3;
/** Näin korkean kynnyksen (esim. jalkakäytävän reuna) yli kävellään suoraan. */
const STEP = 0.45;
const STAND_HEIGHT = 1.75;
const CROUCH_HEIGHT = 1.1;
const GRAVITY = 22;
const JUMP_SPEED = 6;
const CLIMB_SPEED = 2.6;
/** Kuinka korkealle reunalle hahmo yltää vetämään itsensä ylös. */
const LEDGE_REACH = 2.4;
const LEDGE_MIN = 0.4;

interface ClimbAnim {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  duration: number;
}

/** Pelaajan hahmo: liikkuminen, painovoima, hyppy, tikkaat ja reunoille kiipeäminen. */
export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  vy = 0;
  yaw = 0;
  grounded = false;
  crouching = false;
  running = false;
  onLadder = false;

  private eye = STAND_HEIGHT - 0.12;
  private climb: ClimbAnim | null = null;
  private readonly boxes: THREE.Box3[] = [];
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(
    private readonly view: View,
    private readonly head: HeadTracker,
    private readonly input: Input,
  ) {}

  get height(): number {
    return this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
  }

  spawn(x: number, y: number, z: number, yaw: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.yaw = yaw;
    this.climb = null;
    this.head.recenter();
    this.syncRig();
  }

  update(dt: number, world: World, s: Settings, enabled: boolean): void {
    if (this.climb) {
      this.updateClimb(dt);
      this.syncRig(dt);
      return;
    }

    const input = this.input;
    let moveX = 0;
    let moveY = 0;
    if (enabled) {
      moveX = input.moveX;
      moveY = input.moveY;
      if (input.justPressed('turnLeft')) this.yaw += THREE.MathUtils.degToRad(s.turnAngle);
      if (input.justPressed('turnRight')) this.yaw -= THREE.MathUtils.degToRad(s.turnAngle);
      if (input.justPressed('recenter')) this.head.recenter();
    }
    this.crouching = enabled && input.isDown('crouch');
    this.running = enabled && input.isDown('run') && !this.crouching && (moveX !== 0 || moveY !== 0);

    this.computeDirections();

    if (enabled && input.justPressed('jump')) {
      if (this.tryLedgeClimb(world)) {
        this.syncRig(dt);
        return;
      }
      if (this.grounded) {
        this.vy = JUMP_SPEED;
        this.grounded = false;
      }
    }

    // Vaakaliike
    const base = this.crouching ? 1.4 : this.running ? 5.5 : 2.9;
    const speed = base * (s.moveSpeed / 100);
    const target = new THREE.Vector3()
      .addScaledVector(this.fwd, moveY)
      .addScaledVector(this.right, moveX);
    if (target.lengthSq() > 1) target.normalize();
    target.multiplyScalar(speed);
    const accel = this.grounded || this.onLadder ? 12 : 3;
    this.vel.x = THREE.MathUtils.damp(this.vel.x, target.x, accel, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, target.z, accel, dt);

    // Tikkaat: ylös/alas ristiohjaimella.
    const ladder = this.findLadder(world);
    this.onLadder = ladder !== null && (moveY !== 0 || !this.grounded);
    if (this.onLadder && ladder) {
      this.vy = moveY * CLIMB_SPEED;
      if (this.pos.y >= ladder.max.y - 0.05 && this.vy > 0) this.vy = 0;
    } else {
      this.vy -= GRAVITY * dt;
    }

    const feetBefore = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.resolveHorizontal(world);

    // Pystyliike
    this.pos.y += this.vy * dt;
    const ground = this.groundHeight(world, this.pos.x, this.pos.z, Math.max(feetBefore, this.pos.y) + STEP);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      if (this.vy < 0) this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = this.pos.y - ground < 0.03;
    }
    if (this.vy > 0) this.hitCeiling(world);

    this.syncRig(dt);
  }

  // ---------- apufunktiot ----------

  private computeDirections(): void {
    this.view.camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 0.01) this.fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.fwd.normalize();
    this.right.set(-this.fwd.z, 0, this.fwd.x);
  }

  private syncRig(dt = 0): void {
    const targetEye = this.height - 0.12;
    this.eye = dt > 0 ? THREE.MathUtils.damp(this.eye, targetEye, 10, dt) : targetEye;
    this.view.rig.position.copy(this.pos);
    this.view.rig.rotation.set(0, this.yaw, 0);
    this.view.camera.position.set(0, this.eye, 0);
    this.view.camera.quaternion.copy(this.head.quaternion);
  }

  private blocks(b: THREE.Box3, feet: number, height: number): boolean {
    return b.max.y > feet + STEP && b.min.y < feet + height;
  }

  private resolveHorizontal(world: World): void {
    const p = this.pos;
    for (let iter = 0; iter < 2; iter++) {
      this.boxes.length = 0;
      world.query(p.x - RADIUS, p.x + RADIUS, p.z - RADIUS, p.z + RADIUS, this.boxes);
      for (const b of this.boxes) {
        if (!this.blocks(b, p.y, this.height)) continue;
        const cx = THREE.MathUtils.clamp(p.x, b.min.x, b.max.x);
        const cz = THREE.MathUtils.clamp(p.z, b.min.z, b.max.z);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (RADIUS - d);
          p.z += (dz / d) * (RADIUS - d);
        } else {
          // Keskipiste laatikon sisällä: työnnetään lyhintä reittiä ulos.
          const pushes = [b.max.x - p.x + RADIUS, p.x - b.min.x + RADIUS, b.max.z - p.z + RADIUS, p.z - b.min.z + RADIUS];
          const i = pushes.indexOf(Math.min(...pushes));
          if (i === 0) p.x += pushes[0];
          else if (i === 1) p.x -= pushes[1];
          else if (i === 2) p.z += pushes[2];
          else p.z -= pushes[3];
        }
      }
    }
  }

  private groundHeight(world: World, x: number, z: number, maxTop: number): number {
    const r = RADIUS * 0.7;
    this.boxes.length = 0;
    world.query(x - r, x + r, z - r, z + r, this.boxes);
    let g = 0;
    for (const b of this.boxes) {
      if (b.max.y <= maxTop && b.max.y > g) {
        const cx = THREE.MathUtils.clamp(x, b.min.x, b.max.x);
        const cz = THREE.MathUtils.clamp(z, b.min.z, b.max.z);
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) g = b.max.y;
      }
    }
    return g;
  }

  private hitCeiling(world: World): void {
    const p = this.pos;
    this.boxes.length = 0;
    world.query(p.x - RADIUS * 0.7, p.x + RADIUS * 0.7, p.z - RADIUS * 0.7, p.z + RADIUS * 0.7, this.boxes);
    const head = p.y + this.height;
    for (const b of this.boxes) {
      if (b.min.y > p.y + STEP && b.min.y < head) {
        p.y = b.min.y - this.height;
        this.vy = 0;
      }
    }
  }

  private findLadder(world: World): THREE.Box3 | null {
    const p = this.pos;
    this.boxes.length = 0;
    world.queryLadders(p.x - RADIUS, p.x + RADIUS, p.z - RADIUS, p.z + RADIUS, this.boxes);
    for (const b of this.boxes) {
      if (p.y >= b.min.y - 0.1 && p.y <= b.max.y + 0.05) return b;
    }
    return null;
  }

  /** Reunalle kiipeäminen: jos edessä on yltävissä oleva reuna ja sen päällä tilaa. */
  private tryLedgeClimb(world: World): boolean {
    const p = this.pos;
    const probe = p.clone().addScaledVector(this.fwd, RADIUS + 0.3);
    this.boxes.length = 0;
    world.query(probe.x - 0.05, probe.x + 0.05, probe.z - 0.05, probe.z + 0.05, this.boxes);
    let top = -Infinity;
    for (const b of this.boxes) {
      const t = b.max.y;
      if (t > p.y + LEDGE_MIN && t <= p.y + LEDGE_REACH && t > top) top = t;
    }
    if (top === -Infinity) return false;

    const target = p.clone().addScaledVector(this.fwd, RADIUS + 0.55);
    target.y = top;
    this.boxes.length = 0;
    world.query(target.x - RADIUS, target.x + RADIUS, target.z - RADIUS, target.z + RADIUS, this.boxes);
    for (const b of this.boxes) {
      if (b.max.y > top + 0.05 && b.min.y < top + CROUCH_HEIGHT) {
        const cx = THREE.MathUtils.clamp(target.x, b.min.x, b.max.x);
        const cz = THREE.MathUtils.clamp(target.z, b.min.z, b.max.z);
        if ((target.x - cx) ** 2 + (target.z - cz) ** 2 < RADIUS * RADIUS) return false;
      }
    }

    this.climb = { from: p.clone(), to: target, t: 0, duration: 0.35 + (top - p.y) * 0.2 };
    this.vel.set(0, 0, 0);
    this.vy = 0;
    return true;
  }

  private updateClimb(dt: number): void {
    const c = this.climb!;
    c.t += dt / c.duration;
    const t = Math.min(c.t, 1);
    // Ensin ylös, sitten eteenpäin reunan yli.
    const up = THREE.MathUtils.smoothstep(t, 0, 0.65);
    const over = THREE.MathUtils.smoothstep(t, 0.5, 1);
    this.pos.set(
      THREE.MathUtils.lerp(c.from.x, c.to.x, over),
      THREE.MathUtils.lerp(c.from.y, c.to.y + 0.05, up),
      THREE.MathUtils.lerp(c.from.z, c.to.z, over),
    );
    if (t >= 1) {
      this.pos.copy(c.to);
      this.climb = null;
      this.grounded = true;
    }
  }
}
