import * as THREE from 'three';

export interface TextLine {
  text: string;
  /** Fonttikoko pikseleinä tekstuurissa. */
  size?: number;
  color?: string;
  bold?: boolean;
}

export interface PanelOptions {
  /** Paneelin koko metreinä. */
  width: number;
  height: number;
  background?: string | null;
  pxPerMeter?: number;
  /** Piirretäänkö muiden esineiden päälle (HUD). */
  overlay?: boolean;
}

/** 3D-tilassa näkyvä tekstikyltti. Teksti piirretään canvasille ja siitä tekstuuriksi. */
export class TextPanel {
  readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly background: string | null;
  private current = '';

  constructor(opts: PanelOptions, lines: TextLine[] = []) {
    const ppm = opts.pxPerMeter ?? 256;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(opts.width * ppm);
    this.canvas.height = Math.round(opts.height * ppm);
    this.ctx = this.canvas.getContext('2d')!;
    this.background = opts.background === undefined ? 'rgba(10,15,30,0.85)' : opts.background;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: !opts.overlay,
      depthWrite: !opts.overlay,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.width, opts.height), material);
    if (opts.overlay) this.mesh.renderOrder = 900;
    this.setText(lines);
  }

  setText(lines: TextLine[]): void {
    const key = JSON.stringify(lines);
    if (key === this.current) return;
    this.current = key;

    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.background) {
      ctx.fillStyle = this.background;
      roundRect(ctx, 0, 0, canvas.width, canvas.height, Math.min(canvas.width, canvas.height) * 0.08);
      ctx.fill();
    }

    const sizes = lines.map((l) => l.size ?? 48);
    const gap = 0.35;
    const total = sizes.reduce((s, v) => s + v * (1 + gap), 0) - (sizes.length ? sizes[sizes.length - 1] * gap : 0);
    let y = (canvas.height - total) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      const size = sizes[i];
      ctx.font = `${line.bold ? '700' : '500'} ${size}px system-ui, sans-serif`;
      ctx.fillStyle = line.color ?? '#ffffff';
      ctx.fillText(line.text, canvas.width / 2, y, canvas.width * 0.94);
      y += size * (1 + gap);
    });
    this.texture.needsUpdate = true;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
