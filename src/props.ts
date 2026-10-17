import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { at, Batcher, blobGeo, boxGeo } from './batch';
import type { World } from './physics';
import { materials } from './textures';
import { TextPanel } from './text';

/** Lehtipuu. Runko on este, latvus ei. */
export function tree(b: Batcher, world: World, x: number, z: number, seed: number, scale = 1): void {
  const m = materials();
  const h = 3 * scale;
  b.add(new THREE.CylinderGeometry(0.12 * scale, 0.24 * scale, h, 7), m.bark, at(x, h / 2, z));
  const r = 1.3 * scale;
  const blobs = 3 + (seed % 2);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + seed;
    const off = i === 0 ? 0 : 0.8 * scale;
    b.add(blobGeo(r * (0.8 + (i % 2) * 0.3), seed + i * 3.1), m.leaves,
      at(x + Math.cos(a) * off, h + 0.4 * scale + (i % 3) * 0.5 * scale, z + Math.sin(a) * off));
  }
  world.addBox(x, 0, z, 0.4 * scale, h, 0.4 * scale);
}

/** Kuusi. */
export function spruce(b: Batcher, world: World, x: number, z: number, scale = 1): void {
  const m = materials();
  b.add(new THREE.CylinderGeometry(0.1 * scale, 0.2 * scale, 1.6 * scale, 6), m.bark, at(x, 0.8 * scale, z));
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const rad = (2.0 - i * 0.42) * scale;
    const hh = (2.4 - i * 0.3) * scale;
    b.add(new THREE.ConeGeometry(rad, hh, 9, 1, true), m.leaves, at(x, (1.4 + i * 1.25) * scale + hh / 2, z, i));
  }
  world.addBox(x, 0, z, 0.4 * scale, 6 * scale, 0.4 * scale);
}

/** Pensas. Ei estettä – pensaan sisään voi piiloutua. */
export function bush(b: Batcher, x: number, y: number, z: number, seed: number, size = 1): void {
  const m = materials();
  b.add(blobGeo(size, seed, 0.25, 2), m.leaves, at(x, y + size * 0.45, z, seed, 1, 0.8, 1));
}

/** Pensasaita (este). */
export function hedge(b: Batcher, world: World, x: number, z: number, w: number, d: number, h = 1.5, y = 0): void {
  const m = materials();
  b.add(boxGeo(w, h, d, 1.5), m.leaves, at(x, y + h / 2, z));
  world.addBox(x, y, z, w, h, d);
}

export function crate(b: Batcher, world: World, x: number, y: number, z: number, size = 1): void {
  const m = materials();
  b.add(boxGeo(size, size, size, size), m.wood, at(x, y + size / 2, z));
  world.addBox(x, y, z, size, size, size);
}

export function bench(b: Batcher, world: World, x: number, y: number, z: number, ry: number): void {
  const m = materials();
  b.add(boxGeo(1.6, 0.06, 0.45, 1), m.wood, at(x, y + 0.45, z, ry));
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const back = new THREE.Vector3(0, 0, 0.22).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ry);
  b.add(boxGeo(1.6, 0.35, 0.05, 1), m.wood, at(x + back.x, y + 0.72, z + back.z, ry));
  for (const lx of [-0.7, 0.7]) {
    b.add(new THREE.BoxGeometry(0.06, 0.45, 0.45), m.painted, at(x + lx * c, y + 0.22, z - lx * s, ry), 0x2b2b2b);
  }
  const alongX = Math.abs(c) > 0.5;
  world.addBox(x, y, z, alongX ? 1.6 : 0.5, 0.45, alongX ? 0.5 : 1.6);
}

export function plantPot(b: Batcher, world: World, x: number, y: number, z: number, seed: number): void {
  const m = materials();
  b.add(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 14), m.painted, at(x, y + 0.3, z), 0x9a4f32);
  b.add(blobGeo(0.55, seed, 0.3), m.leaves, at(x, y + 1.0, z));
  world.addBox(x, y, z, 0.7, 0.6, 0.7);
}

export function streetLight(b: Batcher, world: World, x: number, z: number, ry: number): void {
  const m = materials();
  b.add(new THREE.CylinderGeometry(0.06, 0.1, 6.5, 8), m.metal, at(x, 3.25 + 0.15, z));
  const arm = new THREE.Vector3(0.9, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ry);
  b.add(new THREE.BoxGeometry(1.8, 0.08, 0.08), m.metal, at(x + arm.x, 6.5, z + arm.z, ry));
  b.add(new THREE.BoxGeometry(0.6, 0.12, 0.3), m.painted, at(x + arm.x * 2, 6.45, z + arm.z * 2, ry), 0x3a3a3a);
  world.addBox(x, 0, z, 0.2, 6.5, 0.2);
}

export function dumpster(b: Batcher, world: World, x: number, y: number, z: number, alongX: boolean, color = 0x2e5d3a): void {
  const m = materials();
  const w = alongX ? 1.9 : 1.2;
  const d = alongX ? 1.2 : 1.9;
  b.add(new THREE.BoxGeometry(w, 1.2, d), m.painted, at(x, y + 0.65, z), color);
  b.add(new THREE.BoxGeometry(w + 0.06, 0.08, d + 0.06), m.painted, at(x, y + 1.28, z), 0x222222);
  world.addBox(x, y, z, w, 1.3, d);
}

/** Tikkaat seinää vasten. (nx, nz) = seinästä ulospäin osoittava suunta. */
export function ladder(b: Batcher, world: World, x: number, y: number, z: number, nx: number, nz: number, top: number): void {
  const m = materials();
  const len = top - y + 1.1;
  const cx = x + nx * 0.15;
  const cz = z + nz * 0.15;
  const tx = -nz;
  const tz = nx;
  const ry = Math.abs(tx) > 0.5 ? 0 : Math.PI / 2;
  for (const side of [-0.25, 0.25]) {
    b.add(new THREE.BoxGeometry(0.06, len, 0.06), m.metal, at(cx + tx * side, y + len / 2, cz + tz * side));
  }
  for (let h = y + 0.3; h < top + 1.0; h += 0.3) {
    b.add(new THREE.BoxGeometry(0.5, 0.04, 0.04), m.metal, at(cx, h, cz, ry));
  }
  // Tikkaiden alue: kun pelaaja on tässä ja painaa ylös, hän kiipeää.
  const halfT = 0.35;
  const x0 = x + Math.min(0, nx * 0.65) + (tx !== 0 ? -halfT * Math.abs(tx) : 0);
  const x1 = x + Math.max(0, nx * 0.65) + (tx !== 0 ? halfT * Math.abs(tx) : 0);
  const z0 = z + Math.min(0, nz * 0.65) + (tz !== 0 ? -halfT * Math.abs(tz) : 0);
  const z1 = z + Math.max(0, nz * 0.65) + (tz !== 0 ? halfT * Math.abs(tz) : 0);
  world.addLadder(x0, y, z0, x1, top + 1.1, z1);
}

// ---------- Autot ----------

interface Part {
  geo: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
}

/** Auto osina. Paikallinen keula osoittaa +X-suuntaan, pohja y = 0. */
export function carParts(color: THREE.ColorRepresentation): Part[] {
  const parts: Part[] = [];
  const add = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation, x: number, y: number, z: number) => {
    g.translate(x, y, z);
    parts.push({ geo: g, color: c });
  };
  add(new THREE.BoxGeometry(4.3, 0.62, 1.8), color, 0, 0.62, 0);
  add(new THREE.BoxGeometry(4.36, 0.16, 1.84), 0x2a2a2a, 0, 0.36, 0);
  add(new THREE.BoxGeometry(2.3, 0.6, 1.62), 0x161d24, -0.25, 1.22, 0);
  add(new THREE.BoxGeometry(2.1, 0.08, 1.56), color, -0.25, 1.55, 0);
  for (const sx of [-1.35, 1.35]) for (const sz of [-0.82, 0.82]) {
    const w = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14);
    w.rotateX(Math.PI / 2);
    add(w, 0x111111, sx, 0.33, sz);
  }
  for (const sz of [-0.6, 0.6]) {
    add(new THREE.BoxGeometry(0.05, 0.14, 0.32), 0xfff6d8, 2.16, 0.78, sz);
    add(new THREE.BoxGeometry(0.05, 0.14, 0.32), 0xa01010, -2.16, 0.78, sz);
  }
  return parts;
}

export function parkedCar(b: Batcher, world: World, x: number, y: number, z: number, alongX: boolean, color: THREE.ColorRepresentation, flip = false): void {
  const m = materials();
  const ry = (alongX ? 0 : Math.PI / 2) + (flip ? Math.PI : 0);
  const mtx = at(x, y, z, ry);
  for (const p of carParts(color)) b.add(p.geo, m.carPaint, mtx, p.color);
  world.addBox(x, y, z, alongX ? 4.3 : 1.85, 1.6, alongX ? 1.85 : 4.3);
}

/** Yksi yhdistetty geometria liikkuvalle autolle (yksi piirtokutsu per auto). */
export function carGeometry(color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const list = carParts(color).map((p) => {
    const g = p.geo.toNonIndexed();
    const c = new THREE.Color(p.color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  });
  return mergeGeometries(list)!;
}

export const CAR_COLORS = [0xb8b8b8, 0x1d1d1f, 0xf2f2f2, 0x8c1c1c, 0x1f3d6b, 0x2f4f3a, 0x6b6e72, 0xc9a227, 0x4a6f8a];

/** Kyltti seinään. Valaisee itse itsensä, joten se erottuu hyvin. */
export function sign(text: string, w: number, h: number, bg: string, fg: string): THREE.Mesh {
  const p = new TextPanel({ width: w, height: h, background: bg, pxPerMeter: 160 }, [
    { text, size: Math.round(h * 160 * 0.55), bold: true, color: fg },
  ]);
  return p.mesh;
}
