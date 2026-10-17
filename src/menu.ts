import * as THREE from 'three';
import type { Input } from './input';
import { DIFFICULTY_LABELS, QUALITY_LABELS, type Difficulty, type Quality, type Settings } from './settings';
import { padLine, TextPanel, type TextLine } from './text';

interface Item {
  label: string;
  value?: () => string;
  change?: (dir: number) => void;
  activate?: () => void;
  visible?: () => boolean;
}

export interface MenuActions {
  onChange: () => void;
  recenter: () => void;
  backToLobby: () => void;
  inLevel: () => boolean;
}

function cycle<T>(list: T[], current: T, dir: number): T {
  const i = list.indexOf(current);
  return list[(i + dir + list.length) % list.length];
}

const clamp = THREE.MathUtils.clamp;

/** Asetusvalikko. Avautuu Start-napista ja näkyy aina katseen edessä. */
export class Menu {
  open = false;
  private index = 0;
  private readonly panel: TextPanel;
  private readonly items: Item[];

  constructor(camera: THREE.Camera, private readonly input: Input, private readonly s: Settings, private readonly vr: boolean, actions: MenuActions) {
    this.panel = new TextPanel({ width: 1.25, height: 1.28, background: 'rgba(12,16,26,0.94)', overlay: true, pxPerMeter: 600 });
    this.panel.mesh.position.set(0, 0, -1.4);
    this.panel.mesh.visible = false;
    camera.add(this.panel.mesh);

    const set = (fn: () => void) => () => {
      fn();
      actions.onChange();
    };
    this.items = [
      { label: 'Jatka peliä', activate: () => this.toggle() },
      {
        label: 'Grafiikan laatu',
        value: () => QUALITY_LABELS[s.quality],
        change: (d) => set(() => (s.quality = cycle<Quality>(['low', 'medium', 'high'], s.quality, d)))(),
      },
      { label: 'Näkökenttä', value: () => `${s.fov}°`, change: (d) => set(() => (s.fov = clamp(s.fov + d * 5, 50, 110)))() },
      {
        label: 'Silmien väli',
        value: () => `${s.eyeSeparation} mm`,
        change: (d) => set(() => (s.eyeSeparation = clamp(s.eyeSeparation + d, 50, 78)))(),
        visible: () => this.vr,
      },
      { label: 'Kääntyminen (L/R)', value: () => `${s.turnAngle}°`, change: (d) => set(() => (s.turnAngle = cycle([15, 30, 45, 90], s.turnAngle, d)))() },
      { label: 'Liikkumisnopeus', value: () => `${s.moveSpeed} %`, change: (d) => set(() => (s.moveSpeed = clamp(s.moveSpeed + d * 10, 50, 150)))() },
      {
        label: 'Vaikeustaso',
        value: () => DIFFICULTY_LABELS[s.difficulty],
        change: (d) => set(() => (s.difficulty = cycle<Difficulty>(['easy', 'normal', 'hard'], s.difficulty, d)))(),
      },
      { label: 'Nollaa katsesuunta', activate: () => { actions.recenter(); this.toggle(); } },
      { label: 'Palaa aulaan', activate: () => { this.toggle(); actions.backToLobby(); }, visible: actions.inLevel },
    ];
  }

  toggle(): void {
    this.open = !this.open;
    this.index = 0;
    this.panel.mesh.visible = this.open;
    this.render();
  }

  /** Palauttaa true, jos valikko on auki (pelaajan ohjaus on silloin pois päältä). */
  update(): boolean {
    const inp = this.input;
    if (inp.justPressed('menu')) this.toggle();
    if (!this.open) return false;
    if (inp.justPressed('run')) {
      this.toggle();
      return true;
    }

    const items = this.visibleItems();
    if (inp.justPressed('down')) this.index = (this.index + 1) % items.length;
    if (inp.justPressed('up')) this.index = (this.index - 1 + items.length) % items.length;
    const item = items[this.index];
    if (item.change) {
      if (inp.justPressed('right')) item.change(1);
      if (inp.justPressed('left')) item.change(-1);
      if (inp.justPressed('action')) item.change(1);
    } else if (item.activate && inp.justPressed('action')) {
      item.activate();
    }
    if (this.open) this.render();
    return true;
  }

  private visibleItems(): Item[] {
    return this.items.filter((i) => !i.visible || i.visible());
  }

  private render(): void {
    const items = this.visibleItems();
    this.index = Math.min(this.index, items.length - 1);
    const lines: TextLine[] = [{ text: 'ASETUKSET', size: 64, bold: true, color: '#ffd84a' }];
    items.forEach((it, i) => {
      const sel = i === this.index;
      const value = it.value ? `   ‹ ${it.value()} ›` : '';
      lines.push({ text: `${sel ? '▶ ' : ''}${it.label}${value}`, size: 40, bold: sel, color: sel ? '#ffffff' : '#9aa6b8' });
    });
    lines.push({ text: '↑↓ valitse · ←→ muuta · A valitse · B/Start sulje', size: 28, color: '#7d8798' });
    lines.push(padLine(['up', 'down', 'left', 'right', 'action', 'run', 'menu'], 80));
    this.panel.setText(lines);
  }
}
