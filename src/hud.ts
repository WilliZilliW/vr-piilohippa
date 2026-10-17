import type * as THREE from 'three';
import { TextPanel, type TextLine } from './text';

/**
 * Katseen edessä näkyvät tekstit: keskellä isot ilmoitukset ja ylhäällä
 * tilarivi (aika, kiinni jääneet). Piirretään himmennyksen päälle.
 */
export class Hud {
  private readonly message: TextPanel;
  private readonly status: TextPanel;
  private timer = 0;

  constructor(camera: THREE.Camera) {
    this.message = new TextPanel({ width: 1.3, height: 0.8, overlay: true, pxPerMeter: 500 });
    this.message.mesh.position.set(0, -0.28, -1.5);
    this.message.mesh.renderOrder = 1100;
    this.message.mesh.visible = false;
    camera.add(this.message.mesh);

    this.status = new TextPanel({ width: 0.9, height: 0.12, overlay: true, pxPerMeter: 500, background: 'rgba(10,15,30,0.7)' });
    this.status.mesh.position.set(0, 0.42, -1.5);
    this.status.mesh.renderOrder = 1100;
    this.status.mesh.visible = false;
    camera.add(this.status.mesh);
  }

  /** Näytä ilmoitus. seconds = Infinity pitää sen näkyvissä, kunnes hide() kutsutaan. */
  show(lines: TextLine[], seconds = 4): void {
    this.message.setText(lines);
    this.message.mesh.visible = true;
    this.timer = seconds;
  }

  hide(): void {
    this.message.mesh.visible = false;
    this.timer = 0;
  }

  setStatus(text: string | null, color = '#ffffff'): void {
    this.status.mesh.visible = text !== null;
    if (text !== null) this.status.setText([{ text, size: 40, bold: true, color }]);
  }

  update(dt: number): void {
    if (this.timer > 0 && this.timer !== Infinity) {
      this.timer -= dt;
      if (this.timer <= 0) this.message.mesh.visible = false;
    }
  }
}
