import type { HeadTracker } from './head';
import type { Button, Input, VirtualState } from './input';

/**
 * Kosketusohjaus kännykällä pelaamiseen ilman VR-laseja:
 * vasemmalla virtuaalinen ohjaustikku, muualla ruutua vetämällä katsotaan
 * ympärille ja oikealla ovat toimintonapit. Napeissa on samat kirjaimet
 * kuin NES30-ohjaimessa, joten pelin nappikehotteet pätevät sellaisenaan.
 */

const LOOK_SPEED = 0.006; // radiaania pikseliä kohden
const STICK_R = 60; // tikun liikevara pikseleinä
/** Kun tikku on vedetty lähes reunaan, juostaan. */
const RUN_AT = 0.92;

interface PadButton {
  button: Button;
  label: string;
  hint: string;
  /** Pysyykö napin tila päällä painalluksesta toiseen (kyykky). */
  toggle?: boolean;
  right: number;
  bottom: number;
  size: number;
}

const BUTTONS: PadButton[] = [
  { button: 'action', label: 'A', hint: 'toiminto', right: 24, bottom: 96, size: 76 },
  { button: 'jump', label: 'Y', hint: 'hyppy', right: 112, bottom: 30, size: 68 },
  { button: 'run', label: 'B', hint: 'juoksu', right: 112, bottom: 150, size: 60 },
  { button: 'crouch', label: 'X', hint: 'kyykky', toggle: true, right: 24, bottom: 196, size: 60 },
];

export class TouchControls {
  private readonly root = document.createElement('div');
  private readonly held = new Set<Button>();
  private readonly toggled = new Set<Button>();
  private readonly buttonEls = new Map<Button, HTMLElement>();

  private stickId: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private readonly stickBase = document.createElement('div');
  private readonly stickKnob = document.createElement('div');
  private moveX = 0;
  private moveY = 0;

  private lookId: number | null = null;
  private lookX = 0;
  private lookY = 0;

  constructor(private readonly input: Input, private readonly head: HeadTracker) {
    this.root.id = 'touch';
    document.body.appendChild(this.root);
    injectStyle();

    // Koko ruudun kokoinen kosketuspinta: vasen puolisko tikulle, muu katseelle.
    const surface = document.createElement('div');
    surface.className = 'touch-surface';
    this.root.appendChild(surface);
    surface.addEventListener('pointerdown', (e) => this.surfaceDown(e));
    surface.addEventListener('pointermove', (e) => this.surfaceMove(e));
    surface.addEventListener('pointerup', (e) => this.surfaceUp(e));
    surface.addEventListener('pointercancel', (e) => this.surfaceUp(e));

    this.stickBase.className = 'touch-stick';
    this.stickKnob.className = 'touch-knob';
    this.stickBase.appendChild(this.stickKnob);
    this.root.appendChild(this.stickBase);

    for (const b of BUTTONS) this.addButton(b);

    const menu = this.addButton({ button: 'menu', label: '☰', hint: '', right: 16, bottom: 0, size: 48 });
    menu.style.bottom = '';
    menu.style.top = '16px';

    input.setVirtual(() => this.state());
  }

  private addButton(b: PadButton): HTMLElement {
    const el = document.createElement('div');
    el.className = 'touch-btn';
    el.style.right = `${b.right}px`;
    el.style.bottom = `${b.bottom}px`;
    el.style.width = el.style.height = `${b.size}px`;
    el.style.fontSize = `${Math.round(b.size * 0.42)}px`;
    el.innerHTML = b.hint ? `${b.label}<small>${b.hint}</small>` : b.label;
    const press = (e: PointerEvent) => {
      e.preventDefault();
      capture(el, e.pointerId);
      if (b.toggle) {
        if (this.toggled.has(b.button)) this.toggled.delete(b.button);
        else this.toggled.add(b.button);
      } else {
        this.held.add(b.button);
      }
      this.refresh();
    };
    const release = (e: PointerEvent) => {
      e.preventDefault();
      this.held.delete(b.button);
      this.refresh();
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    this.root.appendChild(el);
    this.buttonEls.set(b.button, el);
    return el;
  }

  private refresh(): void {
    for (const [b, el] of this.buttonEls) el.classList.toggle('on', this.held.has(b) || this.toggled.has(b));
  }

  private surfaceDown(e: PointerEvent): void {
    e.preventDefault();
    capture(e.target as HTMLElement, e.pointerId);
    if (this.stickId === null && e.clientX < window.innerWidth * 0.45) {
      this.stickId = e.pointerId;
      this.stickX = e.clientX;
      this.stickY = e.clientY;
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
      this.stickBase.classList.add('on');
      this.setKnob(0, 0);
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    }
  }

  private surfaceMove(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickX;
      let dy = e.clientY - this.stickY;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        dx *= STICK_R / len;
        dy *= STICK_R / len;
      }
      this.setKnob(dx, dy);
      this.moveX = dx / STICK_R;
      this.moveY = -dy / STICK_R;
    } else if (e.pointerId === this.lookId) {
      this.head.addLook(-(e.clientX - this.lookX) * LOOK_SPEED, -(e.clientY - this.lookY) * LOOK_SPEED);
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    }
  }

  private surfaceUp(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.moveX = this.moveY = 0;
      this.stickBase.classList.remove('on');
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  }

  private setKnob(dx: number, dy: number): void {
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Napit ja tikun asento Input-luokalle. */
  private state(): VirtualState {
    const buttons = [...this.held, ...this.toggled];
    // Tikku toimii myös ristiohjaimena, jotta valikossa voi liikkua.
    if (this.moveX > 0.5) buttons.push('right');
    if (this.moveX < -0.5) buttons.push('left');
    if (this.moveY > 0.5) buttons.push('up');
    if (this.moveY < -0.5) buttons.push('down');
    // Tikun juoksu ei ole B-nappi, jottei se sulje valikkoa.
    const run = Math.hypot(this.moveX, this.moveY) > RUN_AT;
    return { buttons, moveX: this.moveX, moveY: this.moveY, run };
  }
}

/** Sormi pysyy samassa elementissä, vaikka se liukuisi sen ulkopuolelle. */
function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    // Kaappaus ei aina onnistu (esim. sormi jo nostettu) – ei haittaa.
  }
}

function injectStyle(): void {
  const style = document.createElement('style');
  style.textContent = `
    #touch { position: fixed; inset: 0; z-index: 5; user-select: none; -webkit-user-select: none; }
    #touch .touch-surface { position: absolute; inset: 0; touch-action: none; }
    #touch .touch-stick {
      position: absolute; width: ${STICK_R * 2}px; height: ${STICK_R * 2}px; margin: -${STICK_R}px 0 0 -${STICK_R}px;
      border-radius: 50%; background: #ffffff1c; border: 2px solid #ffffff55; display: none; pointer-events: none;
    }
    #touch .touch-stick.on { display: block; }
    #touch .touch-knob {
      position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px;
      border-radius: 50%; background: #ffffffaa;
    }
    #touch .touch-btn {
      position: absolute; border-radius: 50%; background: #0008; border: 2px solid #ffffff88; color: #fff;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-weight: 700; font-family: system-ui, sans-serif; line-height: 1; touch-action: none;
    }
    #touch .touch-btn small { font-size: 11px; font-weight: 500; opacity: .85; margin-top: 3px; }
    #touch .touch-btn.on { background: #ffd84a; color: #222; border-color: #ffd84a; }
  `;
  document.head.appendChild(style);
}
