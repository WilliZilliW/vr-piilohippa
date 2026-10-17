import * as THREE from 'three';
import type { World } from './physics';

export interface BushInfo {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LadderInfo {
  /** Tikkaiden kohta seinässä ja seinästä ulos osoittava suunta. */
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Katon korkeus. */
  top: number;
  /** Tikkaiden juuri maassa. */
  base: THREE.Vector3;
  /** Katto, jolle tikkaat vievät. */
  roof: Rect | null;
}

export type SpotKind = 'bush' | 'wall' | 'roof';

export interface Spot {
  pos: THREE.Vector3;
  kind: SpotKind;
  ladder?: LadderInfo;
}

/** Mitä näkö tarvitsee kohteesta. */
export interface Visible {
  pos: THREE.Vector3;
  height: number;
  crouching: boolean;
}

/** Näköyhteydet: seinät, autot, aidat ja pensaat estävät näkymän. */
export class Vision {
  private readonly boxes: THREE.Box3[] = [];

  constructor(private readonly world: World, readonly bushes: BushInfo[]) {}

  /** Onko piste a:sta b:hen vapaa näkölinja? */
  clear(a: THREE.Vector3, b: THREE.Vector3, bushSlack = 3): boolean {
    this.boxes.length = 0;
    this.world.query(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z), this.boxes);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    for (const box of this.boxes) {
      if (segmentHitsBox(a.x, a.y, a.z, dx, dy, dz, box)) return false;
    }
    const len = Math.hypot(dx, dy, dz);
    if (len > bushSlack) {
      for (const bush of this.bushes) {
        // Pensas estää näkymän, ellei katsoja tai kohde ole aivan sen vieressä.
        const cx = bush.x;
        const cy = bush.y + bush.r * 0.45;
        const cz = bush.z;
        const rr = bush.r * 0.85;
        const da = Math.hypot(a.x - cx, a.z - cz);
        const db = Math.hypot(b.x - cx, b.z - cz);
        if (da < rr + 0.5 || db < rr + 0.5) continue;
        if (segmentHitsSphere(a.x, a.y, a.z, dx, dy, dz, cx, cy, cz, rr)) return false;
      }
    }
    return true;
  }

  /** Onko kohde pensaan sisällä? */
  inBush(p: THREE.Vector3): BushInfo | null {
    for (const b of this.bushes) {
      if (Math.hypot(p.x - b.x, p.z - b.z) < b.r * 0.85 && p.y < b.y + b.r) return b;
    }
    return null;
  }

  /**
   * Näkeekö katsoja kohteen.
   * @param facing katsojan vaakasuora katsesuunta (yksikkövektori)
   */
  canSee(eye: THREE.Vector3, facing: THREE.Vector3, t: Visible, range: number, fovCos: number): boolean {
    const dx = t.pos.x - eye.x;
    const dz = t.pos.z - eye.z;
    const dist = Math.hypot(dx, dz);
    const effRange = range * (t.crouching ? 0.6 : 1);
    if (dist > effRange) return false;
    // Hyvin läheltä huomaa aina, vaikka ei katsoisi suoraan.
    if (dist > 1.6 && (dx * facing.x + dz * facing.z) / dist < fovCos) return false;
    if (this.inBush(t.pos) && dist > (t.crouching ? 2.0 : 3.5)) return false;

    const head = new THREE.Vector3(t.pos.x, t.pos.y + t.height - 0.12, t.pos.z);
    if (this.clear(eye, head)) return true;
    const chest = new THREE.Vector3(t.pos.x, t.pos.y + t.height * 0.6, t.pos.z);
    return this.clear(eye, chest);
  }
}

function segmentHitsBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: THREE.Box3): boolean {
  let t0 = 0;
  let t1 = 1;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const mn = [b.min.x, b.min.y, b.min.z];
  const mx = [b.max.x, b.max.y, b.max.z];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < mn[k] || o[k] > mx[k]) return false;
    } else {
      let ta = (mn[k] - o[k]) / d[k];
      let tb = (mx[k] - o[k]) / d[k];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  // Ei lasketa osumaksi, jos jana alkaa tai loppuu laatikon sisällä (esim. katolla seisova).
  return t0 > 0.001 && t1 < 0.999;
}

function segmentHitsSphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): boolean {
  const fx = ox - cx;
  const fy = oy - cy;
  const fz = oz - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}
