/**
 * Ohjaus: Bluetooth-peliohjain (8BitDo NES30) Gamepad API:n kautta,
 * näppäimistö sekä kännykän kosketusohjaimet. NES30 voi olla myös näppäimistötilassa, jolloin
 * sen napit tulevat näppäinpainalluksina.
 */

export type Button =
  | 'up' | 'down' | 'left' | 'right'
  | 'action'     // A
  | 'run'        // B
  | 'crouch'     // X
  | 'jump'       // Y: hyppy / kiipeä reunalle
  | 'turnLeft'   // L
  | 'turnRight'  // R
  | 'recenter'   // Select
  | 'menu';      // Start

// Vakio-ohjaimen (mapping === 'standard') nappien numerot.
const STANDARD_BUTTONS: Record<number, Button> = {
  0: 'action', 1: 'run', 2: 'crouch', 3: 'jump',
  4: 'turnLeft', 5: 'turnRight', 8: 'recenter', 9: 'menu',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

const KEYS: Record<string, Button> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyF: 'action',
  Space: 'jump',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyC: 'crouch', ControlLeft: 'crouch',
  KeyQ: 'turnLeft', KeyE: 'turnRight',
  KeyR: 'recenter',
  Enter: 'menu', Escape: 'menu',
};

/** Kosketusohjainten tila (ks. touch.ts). */
export interface VirtualState {
  buttons: Button[];
  moveX: number;
  moveY: number;
}

export class Input {
  /** -1..1, oikealle positiivinen. */
  moveX = 0;
  /** -1..1, eteenpäin positiivinen. */
  moveY = 0;
  gamepadName: string | null = null;

  private down = new Set<Button>();
  private prev = new Set<Button>();
  private keys = new Set<string>();
  private virtual: (() => VirtualState) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (KEYS[e.code]) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Kytke kosketusohjaimet napeiksi ja analogiseksi liikkeeksi. */
  setVirtual(source: () => VirtualState): void {
    this.virtual = source;
  }

  /** Pelataanko kosketusohjaimilla. */
  get touch(): boolean {
    return this.virtual !== null;
  }

  update(): void {
    this.prev = this.down;
    this.down = new Set();

    for (const code of this.keys) {
      const b = KEYS[code];
      if (b) this.down.add(b);
    }

    const pad = firstGamepad();
    this.gamepadName = pad ? pad.id : null;
    if (pad) {
      pad.buttons.forEach((btn, i) => {
        const b = STANDARD_BUTTONS[i];
        if (b && btn.pressed) this.down.add(b);
      });
      // Joissain tiloissa ristiohjain tulee akseleina eikä nappeina.
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (ax < -0.5) this.down.add('left');
      if (ax > 0.5) this.down.add('right');
      if (ay < -0.5) this.down.add('up');
      if (ay > 0.5) this.down.add('down');
    }

    const v = this.virtual?.();
    if (v) for (const b of v.buttons) this.down.add(b);

    this.moveX = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    this.moveY = (this.down.has('up') ? 1 : 0) - (this.down.has('down') ? 1 : 0);
    // Kosketustikku on analoginen: hidas hiipiminen onnistuu.
    if (v && (v.moveX !== 0 || v.moveY !== 0)) {
      this.moveX = v.moveX;
      this.moveY = v.moveY;
    }
  }

  /** Kaikki juuri nyt pohjassa olevat napit (nappitestiä varten). */
  pressed(): Button[] {
    return [...this.down];
  }

  isDown(b: Button): boolean {
    return this.down.has(b);
  }

  justPressed(b: Button): boolean {
    return this.down.has(b) && !this.prev.has(b);
  }
}

function firstGamepad(): Gamepad | null {
  if (!navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) return pad;
  }
  return null;
}
