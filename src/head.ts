import * as THREE from 'three';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
// Kääntää kameran katsomaan puhelimen takaosan suuntaan eikä ylöspäin.
const SCREEN_TO_WORLD = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

/**
 * Pään asento. VR-tilassa luetaan puhelimen asentoanturia,
 * testitilassa hiirtä ja kännykkätilassa ruudun vetämistä (ks. touch.ts).
 */
export class HeadTracker {
  /** Lopullinen pään asento suhteessa vartaloon. */
  readonly quaternion = new THREE.Quaternion();

  private readonly raw = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly tmpQ = new THREE.Quaternion();
  private yawOffset = 0;
  private sensor: { alpha: number; beta: number; gamma: number } | null = null;
  private mouseYaw = 0;
  private mousePitch = 0;
  private needsRecenter = false;

  constructor(private readonly mode: 'sensor' | 'mouse' | 'touch', canvas: HTMLCanvasElement) {
    if (mode === 'sensor') {
      window.addEventListener('deviceorientation', (e) => {
        if (e.alpha === null || e.beta === null || e.gamma === null) return;
        const first = this.sensor === null;
        this.sensor = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
        if (first) this.needsRecenter = true;
      });
    } else if (mode === 'mouse') {
      canvas.addEventListener('click', () => canvas.requestPointerLock?.());
      window.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== canvas) return;
        this.addLook(-e.movementX * 0.0025, -e.movementY * 0.0025);
      });
    }
  }

  /** Käännä katsetta (hiiri ja kosketus). */
  addLook(dYaw: number, dPitch: number): void {
    this.mouseYaw += dYaw;
    this.mousePitch = THREE.MathUtils.clamp(this.mousePitch + dPitch, -1.4, 1.4);
  }

  get hasSensor(): boolean {
    return this.sensor !== null;
  }

  update(): void {
    if (this.mode === 'sensor') {
      if (!this.sensor) return;
      const d = THREE.MathUtils.degToRad;
      this.euler.set(d(this.sensor.beta), d(this.sensor.alpha), -d(this.sensor.gamma), 'YXZ');
      this.raw.setFromEuler(this.euler);
      this.raw.multiply(SCREEN_TO_WORLD);
      this.raw.multiply(this.tmpQ.setFromAxisAngle(Z_AXIS, -d(screenAngle())));
    } else {
      this.euler.set(this.mousePitch, this.mouseYaw, 0, 'YXZ');
      this.raw.setFromEuler(this.euler);
    }

    if (this.needsRecenter) {
      this.needsRecenter = false;
      this.recenter();
    }

    this.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.yawOffset).multiply(this.raw);
  }

  /** Nykyinen katsesuunta muuttuu "suoraan eteenpäin" -suunnaksi. */
  recenter(): void {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.raw);
    this.yawOffset = -Math.atan2(-forward.x, -forward.z);
  }
}

function screenAngle(): number {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}
