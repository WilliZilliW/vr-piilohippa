import * as THREE from 'three';
import { STAND_HEIGHT, STEP } from './body';
import type { World } from './physics';

/**
 * Reitinhaku maan tasolla. Kaupunki jaetaan 1 m ruutuihin; ruutu on
 * kuljettava, jos siinä mahtuu seisomaan. Reitti haetaan A*-algoritmilla
 * ja suoristetaan, jotta hahmot eivät kulje sik-sakkia.
 */
export class NavGrid {
  readonly cell = 1;
  readonly min: number;
  readonly size: number;
  /** 0 = este, muuten kulkukustannus. */
  readonly cost: Uint8Array;
  readonly ground: Float32Array;

  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly state: Uint8Array;
  private readonly heap: Int32Array;
  private readonly f: Float32Array;

  constructor(private readonly world: World, extent: number) {
    this.min = -extent;
    this.size = Math.ceil((extent * 2) / this.cell);
    const n = this.size * this.size;
    this.cost = new Uint8Array(n);
    this.ground = new Float32Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.state = new Uint8Array(n);
    this.heap = new Int32Array(n);
    this.f = new Float32Array(n);
    this.build();
  }

  private build(): void {
    const boxes: THREE.Box3[] = [];
    // Hahmon säde + vähän väljyyttä. Ohuet esteet (aidat) tarkistetaan koko
    // ruudun alueelta, jotteivät ne jää ruutujen keskipisteiden väliin.
    const r = 0.35;
    const thinR = 0.5;
    const saved = this.world.dynamic;
    this.world.dynamic = []; // autot eivät ole pysyviä esteitä
    for (let iz = 0; iz < this.size; iz++) {
      for (let ix = 0; ix < this.size; ix++) {
        const x = this.min + (ix + 0.5) * this.cell;
        const z = this.min + (iz + 0.5) * this.cell;
        boxes.length = 0;
        this.world.query(x - thinR, x + thinR, z - thinR, z + thinR, boxes);
        let ground = 0;
        for (const b of boxes) {
          if (b.max.y <= STEP && b.max.y > ground && x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z) ground = b.max.y;
        }
        let blocked = false;
        for (const b of boxes) {
          const thin = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) < 0.5;
          const rr = thin ? thinR : r;
          if (b.max.x < x - rr || b.min.x > x + rr || b.max.z < z - rr || b.min.z > z + rr) continue;
          if (b.max.y > ground + STEP && b.min.y < ground + STAND_HEIGHT) {
            blocked = true;
            break;
          }
        }
        const i = iz * this.size + ix;
        this.ground[i] = ground;
        // Ajoradat (maan taso 0) ovat kalliimpia: hahmot suosivat jalkakäytäviä.
        this.cost[i] = blocked ? 0 : ground < 0.05 ? 3 : 1;
      }
    }
    this.world.dynamic = saved;
  }

  index(x: number, z: number): number {
    const ix = Math.floor((x - this.min) / this.cell);
    const iz = Math.floor((z - this.min) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.size || iz >= this.size) return -1;
    return iz * this.size + ix;
  }

  center(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const ix = i % this.size;
    const iz = Math.floor(i / this.size);
    return out.set(this.min + (ix + 0.5) * this.cell, this.ground[i], this.min + (iz + 0.5) * this.cell);
  }

  walkable(x: number, z: number): boolean {
    const i = this.index(x, z);
    return i >= 0 && this.cost[i] > 0;
  }

  /** Lähin kuljettava ruutu (spiraalihaku). */
  nearestWalkable(x: number, z: number, maxR = 6): number {
    const i0 = this.index(x, z);
    if (i0 >= 0 && this.cost[i0] > 0) return i0;
    const ix0 = Math.floor((x - this.min) / this.cell);
    const iz0 = Math.floor((z - this.min) / this.cell);
    for (let r = 1; r <= maxR; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = ix0 + dx;
        const iz = iz0 + dz;
        if (ix < 0 || iz < 0 || ix >= this.size || iz >= this.size) continue;
        const i = iz * this.size + ix;
        if (this.cost[i] === 0) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Onko suora linja kuljettava (käytetään reitin suoristamiseen). */
  lineWalkable(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / 0.25);
    // Tarkistetaan myös vähän sivuilta, jotta hahmo ei hankaa kulmia.
    const nx = (-dz / (len || 1)) * 0.45;
    const nz = (dx / (len || 1)) * 0.45;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      if (!this.walkable(x, z) || !this.walkable(x + nx, z + nz) || !this.walkable(x - nx, z - nz)) return false;
    }
    return true;
  }

  /** A*-reitti. Palauttaa suoristetun pisteketjun tai null. */
  findPath(from: THREE.Vector3, to: THREE.Vector3, maxNodes = 40000): THREE.Vector3[] | null {
    const start = this.nearestWalkable(from.x, from.z);
    const goal = this.nearestWalkable(to.x, to.z);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [this.center(goal)];

    const N = this.size;
    const gx = goal % N;
    const gz = Math.floor(goal / N);
    const h = (i: number) => {
      const dx = Math.abs((i % N) - gx);
      const dz = Math.abs(Math.floor(i / N) - gz);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };

    this.state.fill(0);
    let heapLen = 0;
    const push = (i: number) => {
      let k = heapLen++;
      this.heap[k] = i;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (this.f[this.heap[p]] <= this.f[i]) break;
        this.heap[k] = this.heap[p];
        this.heap[p] = i;
        k = p;
      }
    };
    const pop = (): number => {
      const top = this.heap[0];
      const last = this.heap[--heapLen];
      let k = 0;
      this.heap[0] = last;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < heapLen && this.f[this.heap[l]] < this.f[this.heap[m]]) m = l;
        if (r < heapLen && this.f[this.heap[r]] < this.f[this.heap[m]]) m = r;
        if (m === k) break;
        const t = this.heap[m];
        this.heap[m] = this.heap[k];
        this.heap[k] = t;
        k = m;
      }
      return top;
    };

    this.g[start] = 0;
    this.f[start] = h(start);
    this.parent[start] = -1;
    this.state[start] = 1;
    push(start);
    let expanded = 0;
    let found = false;

    while (heapLen > 0) {
      const cur = pop();
      if (this.state[cur] === 2) continue;
      this.state[cur] = 2;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expanded > maxNodes) break;
      const cx = cur % N;
      const cz = Math.floor(cur / N);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx;
        const c = this.cost[ni];
        if (c === 0 || this.state[ni] === 2) continue;
        // Ei oikaista kulmien yli.
        if (dx && dz && (this.cost[cz * N + nx] === 0 || this.cost[nz * N + cx] === 0)) continue;
        const ng = this.g[cur] + (dx && dz ? Math.SQRT2 : 1) * c;
        if (this.state[ni] === 1 && ng >= this.g[ni]) continue;
        this.g[ni] = ng;
        this.f[ni] = ng + h(ni);
        this.parent[ni] = cur;
        this.state[ni] = 1;
        push(ni);
      }
    }
    if (!found) return null;

    const raw: THREE.Vector3[] = [];
    for (let i = goal; i !== -1; i = this.parent[i]) raw.push(this.center(i));
    raw.reverse();
    raw[0] = from.clone();
    const last = raw[raw.length - 1];
    if (this.walkable(to.x, to.z)) last.set(to.x, last.y, to.z);

    // Suoristus: hypätään suoraan niin pitkälle kuin linja on vapaa.
    const out: THREE.Vector3[] = [];
    let i = 0;
    while (i < raw.length - 1) {
      let j = Math.min(raw.length - 1, i + 40);
      while (j > i + 1 && !this.lineWalkable(raw[i], raw[j])) j--;
      out.push(raw[j]);
      i = j;
    }
    return out;
  }
}
