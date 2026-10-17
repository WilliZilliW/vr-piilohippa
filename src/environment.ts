import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Quality } from './settings';

/** Ulkovalaistus: fysikaalinen taivas, aurinko varjoineen ja taivaan heijastukset. */
export class Outdoor {
  readonly sun: THREE.DirectionalLight;
  private readonly sunDir: THREE.Vector3;
  private readonly envTarget: THREE.WebGLRenderTarget;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const elevation = 38;
    const azimuth = 140;
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(
      1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth),
    );

    const sky = new Sky();
    sky.scale.setScalar(300);
    const u = sky.material.uniforms;
    u.turbidity.value = 5;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(this.sunDir);
    scene.add(sky);

    // Taivaasta lasketaan ympäristövalo ja heijastukset (ikkunat, autot).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const skyCopy = new Sky();
    skyCopy.scale.setScalar(300);
    skyCopy.material.uniforms.sunPosition.value.copy(this.sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const) {
      skyCopy.material.uniforms[k].value = u[k].value;
    }
    envScene.add(skyCopy);
    this.envTarget = pmrem.fromScene(envScene);
    scene.environment = this.envTarget.texture;
    scene.environmentIntensity = 0.22;
    pmrem.dispose();

    scene.fog = new THREE.Fog(0xb9c8d6, 70, 190);

    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x5b4d36, 0.3));

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.4);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -40;
    cam.right = cam.top = 40;
    cam.near = 1;
    cam.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
  }

  applyQuality(q: Quality): void {
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** Varjoalue seuraa pelaajaa. */
  follow(p: THREE.Vector3): void {
    const step = 4;
    const x = Math.round(p.x / step) * step;
    const z = Math.round(p.z / step) * step;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + this.sunDir.x * 100, this.sunDir.y * 100, z + this.sunDir.z * 100);
  }

  dispose(): void {
    this.envTarget.dispose();
  }
}

/** Sisätilan ympäristövalo (aula). */
export function indoorEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = target.texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();
  return target;
}
