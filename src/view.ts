import * as THREE from 'three';
import { StereoEffect } from 'three/examples/jsm/effects/StereoEffect.js';
import type { Settings } from './settings';

/**
 * Piirtäminen. VR-tilassa kuva jaetaan kahtia (vasen ja oikea silmä),
 * testitilassa piirretään tavallinen kuva.
 *
 * Kamerarakenne: rig (pelaajan jalat + vartalon suunta) -> camera (pää).
 */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig = new THREE.Group();
  private readonly stereo: StereoEffect | null;
  private readonly fade: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly reticle: THREE.Mesh;
  private fadeTarget = 0;

  constructor(readonly vr: boolean) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Varjot lasketaan kerran ruutua kohden, ei erikseen kummallekin silmälle.
    this.renderer.shadowMap.autoUpdate = false;
    document.body.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
    this.rig.add(this.camera);
    this.stereo = vr ? new StereoEffect(this.renderer) : null;

    // Tähtäyspiste keskellä näköä.
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.012, 0.02, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }),
    );
    this.reticle.position.z = -1.5;
    this.reticle.renderOrder = 950;
    this.camera.add(this.reticle);

    // Musta häivytys kohtausten välillä.
    this.fade = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, depthTest: false }),
    );
    this.fade.position.z = -0.1;
    this.fade.renderOrder = 1000;
    this.camera.add(this.fade);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applySettings(s: Settings): void {
    const dpr = window.devicePixelRatio || 1;
    const ratio = s.quality === 'low' ? 1 : s.quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(ratio);
    const shadows = s.quality !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.recompileMaterials = true;
    }
    this.camera.fov = s.fov;
    this.stereo?.setEyeSeparation(s.eyeSeparation / 1000);
    this.resize();
  }

  /** Kun varjot kytketään päälle tai pois, materiaalit pitää kääntää uudelleen. */
  recompileMaterials = false;

  setReticleVisible(v: boolean): void {
    this.reticle.visible = v;
  }

  fadeOut(): void {
    this.fadeTarget = 1;
  }

  fadeIn(): void {
    this.fadeTarget = 0;
  }

  /** Himmennys osittain (esim. etsijä laskee silmät kiinni). */
  fadeTo(opacity: number): void {
    this.fadeTarget = opacity;
  }

  get fadeDone(): boolean {
    return Math.abs(this.fade.material.opacity - this.fadeTarget) < 0.01;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.stereo) this.stereo.setSize(w, h);
    else this.renderer.setSize(w, h);
  }

  render(scene: THREE.Scene, dt: number): void {
    const m = this.fade.material;
    m.opacity = THREE.MathUtils.damp(m.opacity, this.fadeTarget, 6, dt);
    if (Math.abs(m.opacity - this.fadeTarget) < 0.005) m.opacity = this.fadeTarget;
    this.fade.visible = m.opacity > 0.001;

    if (this.recompileMaterials) {
      this.recompileMaterials = false;
      scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((x) => (x.needsUpdate = true));
        else if (mat) mat.needsUpdate = true;
      });
    }

    this.renderer.shadowMap.needsUpdate = true;
    if (this.stereo) this.stereo.render(scene, this.camera);
    else this.renderer.render(scene, this.camera);
  }
}
