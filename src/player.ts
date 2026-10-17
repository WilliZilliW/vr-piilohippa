import * as THREE from 'three';
import { Body, emptyCommand } from './body';
import type { HeadTracker } from './head';
import type { Input } from './input';
import type { World } from './physics';
import type { Settings } from './settings';
import type { View } from './view';

/**
 * Pelaaja: lukee ohjaimen ja pään asennon, muuttaa ne liikekomennoiksi
 * ja liikuttaa omaa Body-hahmoaan. Kamera seuraa hahmoa.
 */
export class Player {
  readonly body = new Body();
  yaw = 0;
  /** Lukitaanko liikkuminen (esim. etsijän laskiessa). */
  locked = false;

  private eye = 1.63;
  private readonly cmd = emptyCommand();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(
    private readonly view: View,
    private readonly head: HeadTracker,
    private readonly input: Input,
  ) {}

  get pos(): THREE.Vector3 {
    return this.body.pos;
  }

  get grounded(): boolean {
    return this.body.grounded;
  }

  get crouching(): boolean {
    return this.body.crouching;
  }

  get running(): boolean {
    return this.body.running;
  }

  /** Vaakasuora katsesuunta maailmassa. */
  get forward(): THREE.Vector3 {
    return this.fwd;
  }

  spawn(x: number, y: number, z: number, yaw: number): void {
    this.body.reset(x, y, z);
    this.yaw = yaw;
    this.head.recenter();
    this.syncRig();
  }

  update(dt: number, world: World, s: Settings, enabled: boolean): void {
    const input = this.input;
    const active = enabled && !this.locked;
    if (enabled) {
      if (input.justPressed('turnLeft')) this.yaw += THREE.MathUtils.degToRad(s.turnAngle);
      if (input.justPressed('turnRight')) this.yaw -= THREE.MathUtils.degToRad(s.turnAngle);
      if (input.justPressed('recenter')) this.head.recenter();
    }
    this.computeDirections();

    const c = this.cmd;
    const mx = active ? input.moveX : 0;
    const my = active ? input.moveY : 0;
    c.moveX = this.fwd.x * my + this.right.x * mx;
    c.moveZ = this.fwd.z * my + this.right.z * mx;
    c.run = active && input.isDown('run');
    c.crouch = active && input.isDown('crouch');
    c.jump = active && input.justPressed('jump');
    c.climb = my;
    c.holdLadder = true;
    c.facingX = this.fwd.x;
    c.facingZ = this.fwd.z;
    c.speedScale = s.moveSpeed / 100;
    this.body.step(dt, world, c);
    this.syncRig(dt);
  }

  private computeDirections(): void {
    this.view.camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 0.01) this.fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.fwd.normalize();
    this.right.set(-this.fwd.z, 0, this.fwd.x);
  }

  private syncRig(dt = 0): void {
    const targetEye = this.body.height - 0.12;
    this.eye = dt > 0 ? THREE.MathUtils.damp(this.eye, targetEye, 10, dt) : targetEye;
    this.view.rig.position.copy(this.body.pos);
    this.view.rig.rotation.set(0, this.yaw, 0);
    this.view.camera.position.set(0, this.eye, 0);
    this.view.camera.quaternion.copy(this.head.quaternion);
  }
}
