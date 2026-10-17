import * as THREE from 'three';

/**
 * Yksinkertainen maailma: kaikki esteet ovat akselin suuntaisia laatikoita.
 * Laatikot tallennetaan ruudukkoon, jotta törmäystarkistus pysyy nopeana
 * isossakin kaupungissa.
 */
export class World {
  readonly solids: THREE.Box3[] = [];
  readonly ladders: THREE.Box3[] = [];
  /** Liikkuvat esteet (autot). Päivitetään joka ruudulla. */
  dynamic: THREE.Box3[] = [];

  private readonly cell = 8;
  private readonly grid = new Map<number, THREE.Box3[]>();
  private readonly ladderGrid = new Map<number, THREE.Box3[]>();
  private readonly seen = new Set<THREE.Box3>();

  addSolid(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    const b = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    this.solids.push(b);
    this.insert(this.grid, b);
  }

  /** Laatikko keskipisteen ja koon mukaan, pohja korkeudella y. */
  addBox(cx: number, y: number, cz: number, w: number, h: number, d: number): void {
    this.addSolid(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2);
  }

  addLadder(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    const b = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    this.ladders.push(b);
    this.insert(this.ladderGrid, b);
  }

  /** Esteet, jotka osuvat XZ-alueelle (staattiset + liikkuvat). */
  query(minX: number, maxX: number, minZ: number, maxZ: number, out: THREE.Box3[] = []): THREE.Box3[] {
    this.collect(this.grid, minX, maxX, minZ, maxZ, out);
    for (const b of this.dynamic) {
      if (b.max.x >= minX && b.min.x <= maxX && b.max.z >= minZ && b.min.z <= maxZ) out.push(b);
    }
    return out;
  }

  queryLadders(minX: number, maxX: number, minZ: number, maxZ: number, out: THREE.Box3[] = []): THREE.Box3[] {
    return this.collect(this.ladderGrid, minX, maxX, minZ, maxZ, out);
  }

  private key(ix: number, iz: number): number {
    return (ix + 1000) * 4000 + (iz + 1000);
  }

  private insert(grid: Map<number, THREE.Box3[]>, b: THREE.Box3): void {
    const c = this.cell;
    for (let ix = Math.floor(b.min.x / c); ix <= Math.floor(b.max.x / c); ix++) {
      for (let iz = Math.floor(b.min.z / c); iz <= Math.floor(b.max.z / c); iz++) {
        const k = this.key(ix, iz);
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(b);
      }
    }
  }

  private collect(grid: Map<number, THREE.Box3[]>, minX: number, maxX: number, minZ: number, maxZ: number, out: THREE.Box3[]): THREE.Box3[] {
    const c = this.cell;
    this.seen.clear();
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++) {
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const list = grid.get(this.key(ix, iz));
        if (!list) continue;
        for (const b of list) {
          if (this.seen.has(b)) continue;
          this.seen.add(b);
          if (b.max.x >= minX && b.min.x <= maxX && b.max.z >= minZ && b.min.z <= maxZ) out.push(b);
        }
      }
    }
    return out;
  }
}
