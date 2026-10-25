import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materials } from './textures';

export interface Outfit {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  cap?: number;
}

function colored(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}

function merge(parts: [THREE.BufferGeometry, number][]): THREE.BufferGeometry {
  return mergeGeometries(parts.map(([g, c]) => colored(g, c)))!;
}

/**
 * Yksinkertainen ihmishahmo: vartalo+pää yhtenä kappaleena ja raajat erikseen,
 * jotta niitä voi heiluttaa kävellessä. Hahmo katsoo -Z-suuntaan.
 */
export class Character {
  readonly root = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly legs: THREE.Object3D[] = [];
  private readonly arms: THREE.Object3D[] = [];
  private phase = Math.random() * 10;
  private crouch = 0;

  constructor(o: Outfit) {
    const mat = materials().painted;
    this.root.add(this.hips);

    const torso = merge([
      [new THREE.BoxGeometry(0.42, 0.58, 0.24).translate(0, 1.16, 0), o.shirt],
      [new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8).translate(0, 1.49, 0), o.skin],
      [new THREE.SphereGeometry(0.135, 14, 10).scale(0.95, 1.08, 1).translate(0, 1.64, 0), o.skin],
      [new THREE.SphereGeometry(0.142, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.67, 0.012), o.hair],
      [new THREE.BoxGeometry(0.035, 0.035, 0.02).translate(-0.045, 1.66, -0.13), 0x1a1a1a],
      [new THREE.BoxGeometry(0.035, 0.035, 0.02).translate(0.045, 1.66, -0.13), 0x1a1a1a],
      [new THREE.BoxGeometry(0.44, 0.07, 0.26).translate(0, 0.88, 0), 0x2a2a2a],
      ...(o.cap !== undefined
        ? ([
          [new THREE.CylinderGeometry(0.15, 0.15, 0.08, 14).translate(0, 1.75, 0), o.cap],
          [new THREE.BoxGeometry(0.2, 0.02, 0.14).translate(0, 1.72, -0.16), o.cap],
        ] as [THREE.BufferGeometry, number][])
        : []),
    ]);
    const body = new THREE.Mesh(torso, mat);
    body.castShadow = true;
    this.hips.add(body);

    const legGeo = merge([
      [new THREE.BoxGeometry(0.16, 0.78, 0.18).translate(0, -0.39, 0), o.pants],
      [new THREE.BoxGeometry(0.17, 0.09, 0.27).translate(0, -0.8, -0.04), 0x222222],
    ]);
    const armGeo = merge([
      [new THREE.BoxGeometry(0.11, 0.52, 0.13).translate(0, -0.26, 0), o.shirt],
      [new THREE.BoxGeometry(0.09, 0.1, 0.1).translate(0, -0.57, 0), o.skin],
    ]);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(side * 0.11, 0.86, 0);
      leg.castShadow = true;
      this.hips.add(leg);
      this.legs.push(leg);
      const arm = new THREE.Mesh(armGeo, mat);
      arm.position.set(side * 0.28, 1.42, 0);
      arm.castShadow = true;
      this.hips.add(arm);
      this.arms.push(arm);
    }
  }

  /** Näkymättömyys: hahmosta näkyy vain läpikuultava haamu. */
  setGhost(on: boolean): void {
    const mat = on ? ghostMaterial() : materials().painted;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = mat;
        mesh.castShadow = !on;
      }
    });
  }

  /**
   * @param speed vaakanopeus m/s
   * @param crouching kyykyssä
   * @param climbing tikkailla
   */
  animate(dt: number, speed: number, crouching: boolean, climbing: boolean): void {
    this.crouch = THREE.MathUtils.damp(this.crouch, crouching ? 1 : 0, 10, dt);
    this.phase += dt * (climbing ? 6 : Math.min(speed, 6) * 2.4);
    const amp = climbing ? 0.6 : Math.min(speed / 5, 1) * 0.75;
    const s = Math.sin(this.phase);
    this.legs[0].rotation.x = s * amp + this.crouch * 1.2;
    this.legs[1].rotation.x = -s * amp + this.crouch * 1.2;
    if (climbing) {
      this.arms[0].rotation.x = Math.PI * 0.85 + s * 0.3;
      this.arms[1].rotation.x = Math.PI * 0.85 - s * 0.3;
    } else {
      this.arms[0].rotation.x = -s * amp * 0.8;
      this.arms[1].rotation.x = s * amp * 0.8;
    }
    // Kyykyssä lantio laskee ja vartalo kallistuu.
    this.hips.position.y = -this.crouch * 0.45;
    this.hips.rotation.x = -this.crouch * 0.35;
    // Juostessa pieni pomppu
    this.hips.position.y += Math.abs(Math.cos(this.phase)) * Math.min(speed / 5, 1) * 0.04;
  }
}

let ghost: THREE.Material | null = null;

function ghostMaterial(): THREE.Material {
  ghost ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, transparent: true, opacity: 0.18, depthWrite: false });
  return ghost;
}
