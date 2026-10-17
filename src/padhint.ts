import type { Button } from './input';

/**
 * Piirtää 8BitDo NES30 -ohjaimen kuvan, jossa painettavat napit on korostettu.
 * Käytetään kaikissa nappikehotteissa, jotta napin paikka näkyy laseissakin.
 *
 *   [L]                         [R]
 *    ┌──────────────────────────┐
 *    │   ▲                Y  X  │
 *    │ ◀   ▶  SEL  STA          │
 *    │   ▼                B  A  │
 *    └──────────────────────────┘
 */

const HIGHLIGHT = '#ffd84a';
const DARK = '#2b2d31';
const LABEL = '#f2f2f2';

/** Leveys suhteessa korkeuteen. */
export const PAD_ASPECT = 2.3;

export function drawPad(ctx: CanvasRenderingContext2D, cx: number, top: number, height: number, hl: Button[]): void {
  const H = height;
  const W = H * PAD_ASPECT;
  const x0 = cx - W / 2;
  const on = (b: Button) => hl.includes(b);
  const px = (fx: number) => x0 + fx * W;
  const py = (fy: number) => top + fy * H;

  ctx.save();
  // Olkanapit L ja R
  for (const [b, fx] of [['turnLeft', 0.08], ['turnRight', 0.7]] as const) {
    ctx.fillStyle = on(b) ? HIGHLIGHT : '#8d9096';
    roundRect(ctx, px(fx), py(0), W * 0.22, H * 0.16, H * 0.05);
    ctx.fill();
    ctx.fillStyle = on(b) ? '#222' : LABEL;
    ctx.font = `700 ${H * 0.11}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b === 'turnLeft' ? 'L' : 'R', px(fx + 0.11), py(0.05));
  }

  // Runko
  ctx.fillStyle = '#d5d6d8';
  roundRect(ctx, px(0), py(0.1), W, H * 0.9, H * 0.12);
  ctx.fill();
  ctx.fillStyle = '#b9babd';
  roundRect(ctx, px(0.03), py(0.16), W * 0.94, H * 0.78, H * 0.09);
  ctx.fill();

  // Ristiohjain
  const dx = px(0.19);
  const dy = py(0.55);
  const arm = H * 0.2;
  const th = H * 0.15;
  ctx.fillStyle = DARK;
  ctx.fillRect(dx - th / 2, dy - arm - th / 2, th, arm * 2 + th);
  ctx.fillRect(dx - arm - th / 2, dy - th / 2, arm * 2 + th, th);
  const dirs: [Button, number, number][] = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
  for (const [b, ox, oy] of dirs) {
    if (!on(b)) continue;
    ctx.fillStyle = HIGHLIGHT;
    ctx.fillRect(dx + ox * arm - th / 2, dy + oy * arm - th / 2, th, th);
  }

  // Select ja Start
  for (const [b, fx, label] of [['recenter', 0.41, 'SELECT'], ['menu', 0.55, 'START']] as const) {
    ctx.fillStyle = on(b) ? HIGHLIGHT : DARK;
    roundRect(ctx, px(fx) - W * 0.045, py(0.6) - H * 0.045, W * 0.09, H * 0.09, H * 0.045);
    ctx.fill();
    ctx.fillStyle = on(b) ? HIGHLIGHT : '#555';
    ctx.font = `700 ${H * 0.08}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px(fx), py(0.75));
  }

  // Toimintonapit: ylärivi Y X, alarivi B A
  const face: [Button, string, number, number][] = [
    ['jump', 'Y', 0.73, 0.38],
    ['crouch', 'X', 0.86, 0.38],
    ['run', 'B', 0.73, 0.72],
    ['action', 'A', 0.86, 0.72],
  ];
  const r = H * 0.12;
  for (const [b, label, fx, fy] of face) {
    const x = px(fx);
    const y = py(fy);
    if (on(b)) {
      ctx.fillStyle = 'rgba(255,216,74,0.45)';
      ctx.beginPath();
      ctx.arc(x, y, r * 1.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = on(b) ? HIGHLIGHT : '#a0242a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on(b) ? '#222' : LABEL;
    ctx.font = `800 ${r * 1.1}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + r * 0.05);
  }
  ctx.restore();
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
