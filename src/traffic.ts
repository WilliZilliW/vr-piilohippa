import * as THREE from 'three';
import type { World } from './physics';
import { CAR_COLORS, carGeometry } from './props';
import { materials, rng } from './textures';

/**
 * Autoliikenne. Kadut muodostavat ruudukon, jonka risteykset ovat solmuja.
 * Autot ajavat oikeaa kaistaa, valitsevat risteyksessä suunnan satunnaisesti
 * ja odottavat, jos risteyksessä on jo toinen auto. Pelaajan tai toisen auton
 * eteen tullessa auto jarruttaa.
 */

const LANE = 2;
const STOP = 7; // pysähtymisviiva risteyksen keskeltä
const CRUISE = 8.5; // m/s ≈ 30 km/h

interface Node {
  x: number;
  z: number;
  occupant: Car | null;
}

interface Car {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  from: Node;
  to: Node;
  dir: THREE.Vector2;
  /** 'road' = suora katuosuus, 'turn' = risteyksen läpi ajo. */
  phase: 'road' | 'turn';
  s: number;
  speed: number;
  curve: THREE.QuadraticBezierCurve3 | null;
  curveLen: number;
  next: Node | null;
  nextDir: THREE.Vector2 | null;
  pos: THREE.Vector3;
  fwd: THREE.Vector3;
}

export class Traffic {
  private readonly nodes: Node[][] = [];
  private readonly cars: Car[] = [];
  private readonly r = rng(77);
  private readonly lines: number[];

  constructor(scene: THREE.Scene, private readonly world: World, lines: number[], _edge: number) {
    this.lines = lines;
    for (let i = 0; i < lines.length; i++) {
      this.nodes.push(lines.map((z) => ({ x: lines[i], z, occupant: null })));
    }

    const m = materials();
    const used = new Set<string>();
    const count = 14;
    for (let n = 0; n < count; n++) {
      // Jokainen auto aloittaa eri katuosuudelta.
      let from: Node, to: Node, key: string;
      let guard = 0;
      do {
        const i = Math.floor(this.r() * lines.length);
        const j = Math.floor(this.r() * lines.length);
        from = this.nodes[i][j];
        const nb = this.neighbors(from);
        to = nb[Math.floor(this.r() * nb.length)];
        key = `${from.x},${from.z}>${to.x},${to.z}`;
      } while (used.has(key) && guard++ < 50);
      used.add(key);

      const mesh = new THREE.Mesh(carGeometry(CAR_COLORS[n % CAR_COLORS.length]), m.carPaint);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      const dir = new THREE.Vector2(Math.sign(to.x - from.x), Math.sign(to.z - from.z));
      const car: Car = {
        mesh, box: new THREE.Box3(), from, to, dir, phase: 'road',
        s: STOP + this.r() * 15, speed: CRUISE, curve: null, curveLen: 0, next: null, nextDir: null,
        pos: new THREE.Vector3(), fwd: new THREE.Vector3(),
      };
      this.cars.push(car);
      this.place(car);
    }
    world.dynamic = this.cars.map((c) => c.box);
  }

  private neighbors(n: Node): Node[] {
    const i = this.lines.indexOf(n.x);
    const j = this.lines.indexOf(n.z);
    const out: Node[] = [];
    if (i > 0) out.push(this.nodes[i - 1][j]);
    if (i < this.lines.length - 1) out.push(this.nodes[i + 1][j]);
    if (j > 0) out.push(this.nodes[i][j - 1]);
    if (j < this.lines.length - 1) out.push(this.nodes[i][j + 1]);
    return out;
  }

  /** Oikea puoli ajosuunnasta (Y ylöspäin, katsotaan ylhäältä). */
  private static right(d: THREE.Vector2): THREE.Vector2 {
    return new THREE.Vector2(-d.y, d.x);
  }

  private roadPoint(car: Car, s: number): THREE.Vector3 {
    const r = Traffic.right(car.dir);
    return new THREE.Vector3(car.from.x + car.dir.x * s + r.x * LANE, 0, car.from.z + car.dir.y * s + r.y * LANE);
  }

  private segmentLength(car: Car): number {
    return Math.abs(car.to.x - car.from.x) + Math.abs(car.to.z - car.from.z);
  }

  private chooseNext(car: Car): void {
    const options = this.neighbors(car.to).filter((n) => !(n.x === car.from.x && n.z === car.from.z));
    const list = options.length ? options : this.neighbors(car.to);
    // Suosi suoraan ajoa vähän.
    const straight = list.find((n) => Math.sign(n.x - car.to.x) === car.dir.x && Math.sign(n.z - car.to.z) === car.dir.y);
    car.next = straight && this.r() < 0.45 ? straight : list[Math.floor(this.r() * list.length)];
    car.nextDir = new THREE.Vector2(Math.sign(car.next.x - car.to.x), Math.sign(car.next.z - car.to.z));
  }

  private buildTurn(car: Car): void {
    const d1 = car.dir;
    const d2 = car.nextDir!;
    const r1 = Traffic.right(d1);
    const r2 = Traffic.right(d2);
    const c = car.to;
    const p0 = new THREE.Vector3(c.x - d1.x * STOP + r1.x * LANE, 0, c.z - d1.y * STOP + r1.y * LANE);
    const p2 = new THREE.Vector3(c.x + d2.x * STOP + r2.x * LANE, 0, c.z + d2.y * STOP + r2.y * LANE);
    const straight = d1.x === d2.x && d1.y === d2.y;
    const p1 = straight
      ? p0.clone().lerp(p2, 0.5)
      : new THREE.Vector3(c.x + (r1.x + r2.x) * LANE, 0, c.z + (r1.y + r2.y) * LANE);
    car.curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    car.curveLen = car.curve.getLength();
  }

  private place(car: Car): void {
    if (car.phase === 'road') {
      car.pos.copy(this.roadPoint(car, car.s));
      car.fwd.set(car.dir.x, 0, car.dir.y);
    } else {
      const t = Math.min(car.s / car.curveLen, 1);
      car.pos.copy(car.curve!.getPoint(t));
      car.fwd.copy(car.curve!.getTangent(t)).setY(0).normalize();
    }
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = Math.atan2(-car.fwd.z, car.fwd.x);

    // Törmäyslaatikko pelaajalle
    const ax = Math.abs(car.fwd.x);
    const az = Math.abs(car.fwd.z);
    const hx = car.phase === 'turn' && ax > 0.2 && az > 0.2 ? 1.7 : 2.15 * ax + 0.92 * az;
    const hz = car.phase === 'turn' && ax > 0.2 && az > 0.2 ? 1.7 : 2.15 * az + 0.92 * ax;
    car.box.min.set(car.pos.x - hx, 0, car.pos.z - hz);
    car.box.max.set(car.pos.x + hx, 1.6, car.pos.z + hz);
  }

  /** Kuinka lähellä edessä on este (toinen auto tai pelaaja). */
  private clearance(car: Car, player: THREE.Vector3): number {
    let best = Infinity;
    const rightX = -car.fwd.z;
    const rightZ = car.fwd.x;
    const check = (x: number, z: number, width: number) => {
      const dx = x - car.pos.x;
      const dz = z - car.pos.z;
      const along = dx * car.fwd.x + dz * car.fwd.z;
      const lat = Math.abs(dx * rightX + dz * rightZ);
      if (along > 0 && along < 14 && lat < width) best = Math.min(best, along);
    };
    for (const o of this.cars) if (o !== car) check(o.pos.x, o.pos.z, 1.7);
    if (player.y < 1.2) check(player.x, player.z, 1.6);
    return best;
  }

  update(dt: number, player: THREE.Vector3): void {
    for (const car of this.cars) {
      let target = CRUISE;
      const gap = this.clearance(car, player);
      if (gap < 14) target = Math.min(target, Math.max(0, (gap - 5.5) * 1.4));

      if (car.phase === 'road') {
        const len = this.segmentLength(car) - STOP;
        if (!car.next) this.chooseNext(car);
        const toStop = len - car.s;
        const turning = !(car.nextDir!.x === car.dir.x && car.nextDir!.y === car.dir.y);
        if (toStop < 12) target = Math.min(target, turning ? 4.5 : 7);
        // Odota, jos risteys on varattu.
        const busy = car.to.occupant && car.to.occupant !== car;
        if (busy && toStop < 10) target = Math.min(target, Math.max(0, (toStop - 0.5) * 1.5));
        if (toStop <= 0.05 && !busy) {
          car.to.occupant = car;
          car.phase = 'turn';
          car.s = 0;
          this.buildTurn(car);
        } else if (toStop <= 0.05) {
          car.s = len;
          target = 0;
        }
      } else if (car.s >= car.curveLen) {
        // Risteys ajettu: seuraava katuosuus alkaa.
        car.to.occupant = null;
        car.from = car.to;
        car.to = car.next!;
        car.dir = car.nextDir!;
        car.next = null;
        car.nextDir = null;
        car.phase = 'road';
        car.s = STOP;
        car.curve = null;
      } else {
        target = Math.min(target, 5.5);
      }

      const rate = target < car.speed ? 7 : 2.2;
      car.speed = THREE.MathUtils.damp(car.speed, target, rate, dt);
      if (car.speed < 0.05 && target === 0) car.speed = 0;
      car.s += car.speed * dt;
      this.place(car);
    }
  }
}
