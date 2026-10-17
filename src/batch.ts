import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Kerää staattiset kappaleet ja yhdistää ne materiaaleittain yhdeksi
 * verkoksi. Näin puhelin piirtää koko kaupungin muutamalla kutsulla.
 */
export class Batcher {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix?: THREE.Matrix4, color?: THREE.ColorRepresentation): void {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    if ((mat as THREE.MeshStandardMaterial).vertexColors) {
      const c = new THREE.Color(color ?? 0xffffff);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    }
    let list = this.groups.get(mat);
    if (!list) this.groups.set(mat, (list = []));
    list.push(g);
  }

  build(parent: THREE.Object3D, opts: { castShadow?: boolean; receiveShadow?: boolean; noShadow?: THREE.Material[] } = {}): void {
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      const shadowOk = !opts.noShadow?.includes(mat);
      mesh.castShadow = (opts.castShadow ?? true) && shadowOk;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      list.forEach((g) => g.dispose());
    }
    this.groups.clear();
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

/** Siirto + kierto Y-akselin ympäri (+ skaalaus). */
export function at(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(0, ry, 0));
  return tmpM.clone().compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(sx, sy, sz));
}

/** Laatikko, jonka tekstuuri skaalautuu maailman mittojen mukaan (uvScale metriä / toisto). */
export function boxGeo(w: number, h: number, d: number, uvScale = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[face][0]) / uvScale, (uv.getY(i) * dims[face][1]) / uvScale);
    }
  }
  return g;
}

/** Vaakasuora taso (lattia/maa) maailmamittaisilla UV:illa. */
export function floorGeo(w: number, d: number, uvScale = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / uvScale, (uv.getY(i) * d) / uvScale);
  return g;
}

/** Pystysuora seinäpinta, katsoo +Z-suuntaan. UV:t: u = w / bayW, v = h / bayH. */
export function wallGeo(w: number, h: number, bayW: number, bayH: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / bayW, (uv.getY(i) * h) / bayH);
  return g;
}

/** Epäsäännöllinen "möykky" (puun latvus, pensas, kivi). */
export function blobGeo(radius: number, seed: number, roughness = 0.22, detail = 1): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const k = 1 + roughness * (Math.sin(n.x * 5.1 + seed) * Math.cos(n.y * 4.3 + seed * 1.7) + Math.sin(n.z * 6.7 + seed * 0.3) * 0.5);
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y, v.z);
    uvs[i * 2] = (Math.atan2(n.z, n.x) / Math.PI + 1) * 2;
    uvs[i * 2 + 1] = n.y * 2;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}
